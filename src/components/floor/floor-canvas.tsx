"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Table } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Save, Check, MapIcon, ZoomIn, ZoomOut, Maximize2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRoomCamera, MIN_ZOOM, MAX_ZOOM } from "./use-room-camera";
import { useViewportGestures } from "./use-viewport-gestures";
import { TableNode, TABLE_SIZE, type LocalTable, type TableStaffMap } from "./table-node";
import { ManagePlanDialog } from "./manage-plan-dialog";
import { AssignStaffDialog } from "./assign-staff-dialog";
import { RoomLayoutRenderer } from "./builder/room-layout-renderer";
import { parseRoomLayoutElements } from "@/lib/room-layout";
import type { RoomLayoutMode } from "@prisma/client";

type CoverageFilter = "all" | "assigned" | "unassigned";

export type FloorCanvasHandle = {
  save: () => Promise<void>;
  isDirty: () => boolean;
};

export const FloorCanvas = forwardRef<
  FloorCanvasHandle,
  {
    initialTables: Table[];
    roomId: string;
    roomName: string;
    floorPlanUrl?: string | null;
    activeLayoutMode?: RoomLayoutMode | null;
    roomLayoutElements?: unknown;
    width?: number;
    height?: number;
    staffByTableId?: Record<string, TableStaffMap>;
    date?: string;
    service?: string;
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function FloorCanvas(
  {
    initialTables,
    roomId,
    roomName,
    floorPlanUrl = null,
    activeLayoutMode = null,
    roomLayoutElements = [],
    width = 1200,
    height = 760,
    staffByTableId,
    date,
    service,
    onDirtyChange,
  },
  ref,
) {
  const router = useRouter();
  const [tables, setTables] = useState<LocalTable[]>(initialTables);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [managePlanOpen, setManagePlanOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignStaffTableId, setAssignStaffTableId] = useState<string | null>(null);

  const { camera, worldRef, viewportRef, getZoom, panBy, zoomAt, fitRoom, reset100, stepZoom } = useRoomCamera({
    roomWidth: width,
    roomHeight: height,
  });
  const parsedLayoutElements = parseRoomLayoutElements(roomLayoutElements);

  useEffect(() => {
    setMenuOpen(false);
  }, [selectedId]);

  const isDirty = tables.some((t) => t.dirty);
  const lod: "full" | "medium" | "low" = camera.zoom > 0.7 ? "full" : camera.zoom > 0.45 ? "medium" : "low";

  useEffect(() => {
    onDirtyChange?.(isDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const onStartDrag = useCallback(
    (id: string, e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const t = tables.find((x) => x.id === id);
      if (!t) return;
      const baseX = t.posX;
      const baseY = t.posY;
      const dragZoom = getZoom();
      const size = TABLE_SIZE[t.shape];

      function move(ev: PointerEvent) {
        const dx = (ev.clientX - startX) / dragZoom;
        const dy = (ev.clientY - startY) / dragZoom;
        setTables((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  // Rounded to whole px: the API validates posX/posY as
                  // integers, and a sub-pixel value here (dx/dy divided by a
                  // fractional zoom) would otherwise fail that check on save.
                  posX: Math.round(Math.max(0, Math.min(width - size.w, baseX + dx))),
                  posY: Math.round(Math.max(0, Math.min(height - size.h, baseY + dy))),
                  dirty: true,
                }
              : p,
          ),
        );
      }
      function up() {
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
      }
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [tables, width, height, getZoom],
  );

  async function persist() {
    const dirty = tables.filter((t) => t.dirty);
    if (dirty.length === 0) return;
    setSaving(true);
    const results = await Promise.all(
      dirty.map((t) =>
        fetch(`/api/tables/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ posX: t.posX, posY: t.posY, rotation: t.rotation, seats: t.seats, label: t.label }),
        }).then((res) => ({ id: t.id, ok: res.ok })),
      ),
    );
    const failedIds = new Set(results.filter((r) => !r.ok).map((r) => r.id));
    // Tables that failed to save stay dirty, so the existing "Modifiche non
    // salvate" indicator keeps telling the truth — and the confirmation
    // below only fires when every change actually made it to the server.
    setTables((prev) => prev.map((t) => (failedIds.has(t.id) ? t : { ...t, dirty: false })));
    setSaving(false);
    router.refresh();

    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    if (failedIds.size === 0) {
      setJustSaved(true);
      savedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2200);
    }
  }

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  useImperativeHandle(ref, () => ({ save: persist, isDirty: () => tables.some((t) => t.dirty) }));

  async function addTable() {
    const label = prompt("Etichetta nuovo tavolo (es. T20)") ?? "";
    if (!label) return;
    const seats = Number(prompt("Posti", "2") ?? 2);
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, seats, roomId, posX: 80, posY: 80 }),
    });
    if (res.ok) {
      const t = await res.json();
      setTables((prev) => [...prev, t]);
      router.refresh();
    }
  }

  const deleteTable = useCallback(
    async (id: string) => {
      setTables((prev) => prev.filter((t) => t.id !== id));
      setSelectedId(null);
      await fetch(`/api/tables/${id}`, { method: "DELETE" });
      router.refresh();
    },
    [router],
  );

  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  const gestures = useViewportGestures({
    viewportRef,
    getZoom,
    panBy,
    zoomAt,
    onBackgroundClick: () => setSelectedId(null),
  });

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative h-full w-full touch-none select-none overflow-hidden rounded-xl",
        gestures.isPanning ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
    >
      <div
        ref={worldRef}
        className="absolute left-0 top-0 origin-top-left bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:20px_20px]"
        style={{ width, height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
      >
        {activeLayoutMode === "BUILDER" ? (
          <RoomLayoutRenderer elements={parsedLayoutElements} width={width} height={height} />
        ) : (
          floorPlanUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={floorPlanUrl}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-60"
              draggable={false}
            />
          )
        )}

        {activeLayoutMode !== "BUILDER" && !floorPlanUrl && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <div
              className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
              onPointerDown={(e) => e.stopPropagation()}
            >
              Nessuna piantina caricata.
              <button type="button" className="font-medium text-accent-strong hover:underline" onClick={() => setManagePlanOpen(true)}>
                Crea la tua sala
              </button>
            </div>
          </div>
        )}

        {tables.map((t) => {
          const isSelected = selectedId === t.id;
          const staff = staffByTableId?.[t.id];
          const isAssigned = Boolean(staff?.TABLE_RESPONSIBLE);
          const matchesFilter =
            !staffByTableId ||
            coverageFilter === "all" ||
            (coverageFilter === "assigned" && isAssigned) ||
            (coverageFilter === "unassigned" && !isAssigned);
          return (
            <TableNode
              key={t.id}
              table={t}
              isSelected={isSelected}
              matchesFilter={matchesFilter}
              staff={staff}
              lod={lod}
              onSelect={onSelect}
              onDelete={deleteTable}
              onStartDrag={onStartDrag}
              menu={
                isSelected
                  ? {
                      menuOpen,
                      onMenuOpenChange: setMenuOpen,
                      onOpenAssignStaff: (tableId) => {
                        setMenuOpen(false);
                        setAssignStaffTableId(tableId);
                      },
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2">
        {staffByTableId && (
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 text-xs shadow-lg backdrop-blur-sm"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {(["all", "assigned", "unassigned"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setCoverageFilter(f)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  coverageFilter === f ? "bg-accent-strong text-white" : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {f === "all" ? "Tutti" : f === "assigned" ? "Assegnati" : "Non assegnati"}
              </button>
            ))}
          </div>
        )}

        <div
          className="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            variant="outline"
            size="sm"
            className="hidden shadow-lg sm:inline-flex"
            onClick={() => setManagePlanOpen(true)}
          >
            <MapIcon className="h-4 w-4" /> {floorPlanUrl || activeLayoutMode === "BUILDER" ? "Gestisci piantina" : "Carica piantina"}
          </Button>
          <Button variant="subtle" size="sm" className="hidden shadow-lg sm:inline-flex" onClick={addTable}>
            <Plus className="h-4 w-4" /> Nuovo tavolo
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="outline" className="shadow-lg sm:hidden" aria-label="Altre azioni">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setManagePlanOpen(true)}>
                <MapIcon className="h-4 w-4" /> {floorPlanUrl || activeLayoutMode === "BUILDER" ? "Gestisci piantina" : "Carica piantina"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={addTable}>
                <Plus className="h-4 w-4" /> Nuovo tavolo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="accent"
            size="sm"
            onClick={persist}
            disabled={saving}
            className={cn("shadow-lg transition-colors duration-300", justSaved && "bg-sage text-forest hover:bg-sage")}
          >
            {justSaved ? (
              <>
                <Check className="h-4 w-4" /> Sala salvata
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> {saving ? "Salvataggio…" : "Salva sala"}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden sm:block">
        <span className="rounded-md border border-border bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground/80 backdrop-blur-sm">
          Trascina lo sfondo per navigare · trascina un tavolo per spostarlo
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-border bg-card/90 p-1 shadow-lg backdrop-blur-sm">
        <div
          className="pointer-events-auto flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => stepZoom(-1)}
            disabled={camera.zoom <= MIN_ZOOM}
            aria-label="Riduci zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="w-10 text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => reset100()}
            title="Dimensione reale (100%)"
          >
            {Math.round(camera.zoom * 100)}%
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => stepZoom(1)}
            disabled={camera.zoom >= MAX_ZOOM}
            aria-label="Aumenta zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => fitRoom(true)}
            aria-label="Adatta alla sala"
            title="Adatta alla sala"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ManagePlanDialog
        open={managePlanOpen}
        onOpenChange={setManagePlanOpen}
        roomId={roomId}
        roomName={roomName}
        currentFloorPlanUrl={floorPlanUrl}
        activeLayoutMode={activeLayoutMode}
        roomLayoutElements={parsedLayoutElements}
        roomWidth={width}
        roomHeight={height}
        allTables={tables}
      />

      <AssignStaffDialog
        open={!!assignStaffTableId}
        onOpenChange={(next) => !next && setAssignStaffTableId(null)}
        table={tables.find((t) => t.id === assignStaffTableId) ?? null}
        roomName={roomName}
        date={date ?? ""}
        service={service ?? ""}
        onChanged={() => router.refresh()}
      />
    </div>
  );
});
