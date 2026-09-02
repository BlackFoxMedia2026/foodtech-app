"use client";

import { useEffect, useRef, useState } from "react";
import type { Table } from "@prisma/client";
import {
  boundingBox,
  isTableRef,
  isWall,
  type AreaType,
  type RoomElement,
} from "@/lib/room-layout";
import { TABLE_SIZE } from "../table-node";
import { useRoomCamera } from "../use-room-camera";
import { useHistory } from "./use-history";
import { snapDrawPoint, snapPointToWalls, type Point } from "./snapping";
import { wallsFromPoints } from "./perimeter-generator";

export type LocalTable = Table & { dirty?: boolean };
export type EditorState = { elements: RoomElement[]; tables: LocalTable[] };
export type PlaceableType = "DOOR" | "WINDOW" | "COLUMN" | AreaType;
export type Tool =
  | { mode: "idle" }
  | { mode: "drawing-wall" }
  | { mode: "placing"; elementType: PlaceableType }
  | { mode: "placing-table"; shape: Table["shape"]; seats: number };

const CLOSE_THRESHOLD = 18;

export function useRoomBuilder({
  roomId,
  initialElements,
  initialWidth,
  initialHeight,
  initialTables,
  startTool,
  onSaved,
}: {
  roomId: string;
  initialElements: RoomElement[];
  initialWidth: number;
  initialHeight: number;
  initialTables: Table[];
  startTool?: "idle" | "drawing-wall";
  onSaved?: () => void;
}) {
  const history = useHistory<EditorState>({ elements: initialElements, tables: initialTables.map((t) => ({ ...t })) });
  const stateRef = useRef(history.state);
  stateRef.current = history.state;

  const [dims, setDims] = useState({ width: initialWidth, height: initialHeight });
  const dimsRef = useRef(dims);
  dimsRef.current = dims;

  useEffect(() => {
    const box = boundingBox(history.state.elements);
    const margin = 80;
    setDims((prev) => ({
      width: Math.max(prev.width, Math.round(box.maxX + margin)),
      height: Math.max(prev.height, Math.round(box.maxY + margin)),
    }));
  }, [history.state.elements]);

  const { camera, worldRef, viewportRef, getZoom, panBy, zoomAt, fitRoom, reset100, stepZoom } = useRoomCamera({
    roomWidth: dims.width,
    roomHeight: dims.height,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolState, setToolState] = useState<Tool>(startTool === "drawing-wall" ? { mode: "drawing-wall" } : { mode: "idle" });
  const [drawPoints, setDrawPoints] = useState<Point[]>([]);
  const [saving, setSaving] = useState(false);

  function setTool(next: Tool) {
    setToolState(next);
    if (next.mode !== "drawing-wall") setDrawPoints([]);
  }

  const dragStartRef = useRef<EditorState | null>(null);
  function beginTransaction() {
    dragStartRef.current = stateRef.current;
  }
  function endTransaction() {
    if (dragStartRef.current) {
      history.commit(dragStartRef.current, stateRef.current);
      dragStartRef.current = null;
    }
  }

  function updateElementLive(id: string, patch: Partial<RoomElement>) {
    history.setLive({
      ...stateRef.current,
      elements: stateRef.current.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as RoomElement) : e)),
    });
  }

  function updateElementCommit(id: string, patch: Partial<RoomElement>) {
    const next = {
      ...stateRef.current,
      elements: stateRef.current.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as RoomElement) : e)),
    };
    history.commit(stateRef.current, next);
  }

  function deleteElement(id: string) {
    const next = { ...stateRef.current, elements: stateRef.current.elements.filter((e) => e.id !== id) };
    history.commit(stateRef.current, next);
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function createElementAt(type: PlaceableType, point: Point) {
    const id = crypto.randomUUID();
    let el: RoomElement;
    if (type === "DOOR") el = { id, type: "DOOR", wallId: null, x: point.x, y: point.y, width: 90, rotation: 0 };
    else if (type === "WINDOW") el = { id, type: "WINDOW", wallId: null, x: point.x, y: point.y, width: 120, rotation: 0 };
    else if (type === "COLUMN")
      el = { id, type: "COLUMN", x: point.x - 20, y: point.y - 20, width: 40, height: 40, rotation: 0 };
    else el = { id, type, x: point.x - 80, y: point.y - 60, width: 160, height: 120, rotation: 0, label: null };

    if (type === "DOOR" || type === "WINDOW") {
      const snapped = snapPointToWalls(point, stateRef.current.elements.filter(isWall));
      if (snapped) {
        el = { ...el, x: snapped.point.x, y: snapped.point.y, wallId: snapped.wallId, rotation: snapped.angle } as RoomElement;
      }
    }

    const next = { ...stateRef.current, elements: [...stateRef.current.elements, el] };
    history.commit(stateRef.current, next);
    setSelectedId(id);
  }

  // --- Freehand perimeter drawing ---
  function addDrawPoint(raw: Point) {
    setDrawPoints((vertices) => {
      if (vertices.length === 0) return [raw];
      const origin = vertices[vertices.length - 1];
      const snapped = snapDrawPoint(origin, raw, vertices);
      const first = vertices[0];
      if (vertices.length >= 2 && Math.hypot(snapped.x - first.x, snapped.y - first.y) < CLOSE_THRESHOLD) {
        closeShape(vertices);
        return [];
      }
      return [...vertices, snapped];
    });
  }

  function closeShape(vertices: Point[]) {
    if (vertices.length < 3) return;
    const walls = wallsFromPoints(vertices);
    const next = { ...stateRef.current, elements: [...stateRef.current.elements, ...walls] };
    history.commit(stateRef.current, next);
    setTool({ mode: "idle" });
    requestAnimationFrame(() => fitRoom(true));
  }

  function cancelDrawing() {
    setDrawPoints([]);
    setTool({ mode: "idle" });
  }

  function finishDrawingManually() {
    closeShape(drawPoints);
  }

  // --- Tables ---
  const placedTableIds = new Set(history.state.elements.filter(isTableRef).map((e) => e.tableId));
  const unplacedTables = history.state.tables.filter((t) => !placedTableIds.has(t.id));

  function placeTableAt(tableId: string, point: Point) {
    const table = stateRef.current.tables.find((t) => t.id === tableId);
    if (!table) return;
    const size = TABLE_SIZE[table.shape];
    const posX = Math.round(Math.max(0, point.x - size.w / 2));
    const posY = Math.round(Math.max(0, point.y - size.h / 2));
    const next: EditorState = {
      elements: [...stateRef.current.elements, { id: crypto.randomUUID(), type: "TABLE", tableId }],
      tables: stateRef.current.tables.map((t) => (t.id === tableId ? { ...t, posX, posY, dirty: true } : t)),
    };
    history.commit(stateRef.current, next);
  }

  let tableCounter = history.state.tables.length;
  function nextTableLabel() {
    const existingLabels = new Set(stateRef.current.tables.map((t) => t.label));
    tableCounter += 1;
    let label = `T${tableCounter}`;
    while (existingLabels.has(label)) {
      tableCounter += 1;
      label = `T${tableCounter}`;
    }
    return label;
  }

  // Creates a real Table row and places it in one atomic commit — placeTableAt
  // can't be reused here since it looks the table up in stateRef.current,
  // which wouldn't yet include a table created moments earlier in the same
  // async call (React state updates aren't synchronous).
  async function createTableAt(shape: Table["shape"], seats: number, point: Point) {
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: nextTableLabel(), seats, shape, roomId, posX: 0, posY: 0 }),
    });
    if (!res.ok) return;
    const table = (await res.json()) as Table;
    const size = TABLE_SIZE[table.shape];
    const posX = Math.round(Math.max(0, point.x - size.w / 2));
    const posY = Math.round(Math.max(0, point.y - size.h / 2));
    const next: EditorState = {
      elements: [...stateRef.current.elements, { id: crypto.randomUUID(), type: "TABLE", tableId: table.id }],
      tables: [...stateRef.current.tables, { ...table, posX, posY, dirty: true }],
    };
    history.commit(stateRef.current, next);
  }

  async function createUnplacedTable(input: { label: string; seats: number; shape: Table["shape"] }) {
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, roomId, posX: 0, posY: 0 }),
    });
    if (!res.ok) return null;
    const table = (await res.json()) as Table;
    history.commit(stateRef.current, { ...stateRef.current, tables: [...stateRef.current.tables, table] });
    return table;
  }

  function removeTableFromPlan(tableId: string) {
    const next = {
      ...stateRef.current,
      elements: stateRef.current.elements.filter((e) => !(isTableRef(e) && e.tableId === tableId)),
    };
    history.commit(stateRef.current, next);
    setSelectedId(null);
  }

  async function deleteTablePermanently(tableId: string) {
    const next = {
      elements: stateRef.current.elements.filter((e) => !(isTableRef(e) && e.tableId === tableId)),
      tables: stateRef.current.tables.filter((t) => t.id !== tableId),
    };
    history.commit(stateRef.current, next);
    setSelectedId(null);
    await fetch(`/api/tables/${tableId}`, { method: "DELETE" });
  }

  function onStartTableDrag(id: string, e: React.PointerEvent) {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const t = stateRef.current.tables.find((x) => x.id === id);
    if (!t) return;
    beginTransaction();
    const baseX = t.posX;
    const baseY = t.posY;
    const dragZoom = getZoom();
    const size = TABLE_SIZE[t.shape];
    const { width, height } = dimsRef.current;

    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / dragZoom;
      const dy = (ev.clientY - startY) / dragZoom;
      const nextX = Math.round(Math.max(0, Math.min(width - size.w, baseX + dx)));
      const nextY = Math.round(Math.max(0, Math.min(height - size.h, baseY + dy)));
      history.setLive({
        ...stateRef.current,
        tables: stateRef.current.tables.map((p) => (p.id === id ? { ...p, posX: nextX, posY: nextY, dirty: true } : p)),
      });
    }
    function up() {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      endTransaction();
    }
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function onStartTableRotate(id: string, e: React.PointerEvent) {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const t = stateRef.current.tables.find((x) => x.id === id);
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!t || !rect) return;
    beginTransaction();
    const size = TABLE_SIZE[t.shape];
    const cx = t.posX + size.w / 2;
    const cy = t.posY + size.h / 2;
    const screenCenterX = rect.left + camera.x + cx * camera.zoom;
    const screenCenterY = rect.top + camera.y + cy * camera.zoom;

    function move(ev: PointerEvent) {
      const angleRad = Math.atan2(ev.clientY - screenCenterY, ev.clientX - screenCenterX);
      let deg = angleRad * (180 / Math.PI) + 90;
      deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      history.setLive({
        ...stateRef.current,
        tables: stateRef.current.tables.map((p) => (p.id === id ? { ...p, rotation: deg, dirty: true } : p)),
      });
    }
    function up() {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      endTransaction();
    }
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  }

  function toWorld(clientX: number, clientY: number): Point {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return { x: (localX - camera.x) / camera.zoom, y: (localY - camera.y) / camera.zoom };
  }

  function handleBackgroundClick(e: React.PointerEvent) {
    const world = toWorld(e.clientX, e.clientY);
    if (toolState.mode === "drawing-wall") {
      addDrawPoint(world);
      return;
    }
    if (toolState.mode === "placing") {
      createElementAt(toolState.elementType, world);
      setTool({ mode: "idle" });
      return;
    }
    if (toolState.mode === "placing-table") {
      void createTableAt(toolState.shape, toolState.seats, world);
      setTool({ mode: "idle" });
      return;
    }
    setSelectedId(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const tableId = e.dataTransfer.getData("application/x-table-id");
    const elementType = e.dataTransfer.getData("application/x-element-type");
    const newTable = e.dataTransfer.getData("application/x-new-table");
    const world = toWorld(e.clientX, e.clientY);
    if (tableId) placeTableAt(tableId, world);
    else if (elementType) createElementAt(elementType as PlaceableType, world);
    else if (newTable) {
      const [shape, seats] = newTable.split(":");
      void createTableAt(shape as Table["shape"], Number(seats) || 2, world);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/layout`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ elements: stateRef.current.elements, width: dimsRef.current.width, height: dimsRef.current.height }),
      });
      if (!res.ok) return false;
      const dirtyTables = stateRef.current.tables.filter((t) => t.dirty);
      const results = await Promise.all(
        dirtyTables.map((t) =>
          fetch(`/api/tables/${t.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ posX: t.posX, posY: t.posY, rotation: t.rotation }),
          }).then((r) => r.ok),
        ),
      );
      if (results.every(Boolean)) {
        history.reset({ elements: stateRef.current.elements, tables: stateRef.current.tables.map((t) => ({ ...t, dirty: false })) });
        onSaved?.();
        return true;
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  const selectedElement = history.state.elements.find((e) => e.id === selectedId) ?? null;

  return {
    elements: history.state.elements,
    tables: history.state.tables,
    dims,
    camera,
    worldRef,
    viewportRef,
    getZoom,
    panBy,
    zoomAt,
    fitRoom,
    reset100,
    stepZoom,
    selectedId,
    setSelectedId,
    selectedElement,
    tool: toolState,
    setTool,
    drawPoints,
    saving,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,
    isDirty: () => history.canUndo,
    save,
    beginTransaction,
    endTransaction,
    updateElementLive,
    updateElementCommit,
    deleteElement,
    createElementAt,
    addDrawPoint,
    cancelDrawing,
    finishDrawingManually,
    unplacedTables,
    placeTableAt,
    createTableAt,
    createUnplacedTable,
    removeTableFromPlan,
    deleteTablePermanently,
    onStartTableDrag,
    onStartTableRotate,
    handleBackgroundClick,
    handleDrop,
    toWorld,
  };
}

export type RoomBuilder = ReturnType<typeof useRoomBuilder>;
