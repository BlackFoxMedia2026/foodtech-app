"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Table } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Save, Lock, MapIcon, Trash2, ZoomIn, ZoomOut, MoreHorizontal, UserPlus, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FloorPlanDialog } from "./floor-plan-dialog";

type Local = Table & { dirty?: boolean };
type CoverageFilter = "all" | "assigned" | "unassigned";

const VIEWPORT_HEIGHT = 420;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const DEFAULT_ZOOM = 0.7;
const ZOOM_STEP = 0.1;

export type FloorCanvasHandle = {
  save: () => Promise<void>;
  isDirty: () => boolean;
};

function compactWaiterName(fullName: string) {
  if (fullName.length <= 10) return fullName;
  const [first, ...rest] = fullName.split(" ");
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0]}.` : first;
}

type WaiterOption = { id: string; name: string };
type TableAssignment = { id: string; name: string };
type AssignStep = { kind: "list" } | { kind: "confirm"; waiterId: string; waiterName: string };

export const FloorCanvas = forwardRef<
  FloorCanvasHandle,
  {
    initialTables: Table[];
    roomId: string;
    roomName: string;
    floorPlanUrl?: string | null;
    width?: number;
    height?: number;
    waiterByTableId?: Record<string, TableAssignment>;
    waiters?: WaiterOption[];
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
    width = 1200,
    height = 760,
    waiterByTableId,
    waiters = [],
    date,
    service,
    onDirtyChange,
  },
  ref,
) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [tables, setTables] = useState<Local[]>(initialTables);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");
  const [floorPlanOpen, setFloorPlanOpen] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignStep, setAssignStep] = useState<AssignStep>({ kind: "list" });
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setAssignStep({ kind: "list" });
    setAssignError(null);
  }, [selectedId]);

  const isDirty = tables.some((t) => t.dirty);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  function onDrag(id: string, e: React.MouseEvent) {
    const card = canvasRef.current?.getBoundingClientRect();
    if (!card) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const t = tables.find((x) => x.id === id);
    if (!t) return;
    const baseX = t.posX;
    const baseY = t.posY;
    const dragZoom = zoom;

    function move(ev: MouseEvent) {
      const dx = (ev.clientX - startX) / dragZoom;
      const dy = (ev.clientY - startY) / dragZoom;
      setTables((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                posX: Math.max(0, Math.min(width - 80, baseX + dx)),
                posY: Math.max(0, Math.min(height - 80, baseY + dy)),
                dirty: true,
              }
            : p,
        ),
      );
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  async function persist() {
    const dirty = tables.filter((t) => t.dirty);
    if (dirty.length === 0) return;
    setSaving(true);
    await Promise.all(
      dirty.map((t) =>
        fetch(`/api/tables/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ posX: t.posX, posY: t.posY, rotation: t.rotation, seats: t.seats, label: t.label }),
        }),
      ),
    );
    setTables((prev) => prev.map((t) => ({ ...t, dirty: false })));
    setSaving(false);
    router.refresh();
  }

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

  async function deleteTable(id: string) {
    setTables((prev) => prev.filter((t) => t.id !== id));
    setSelectedId(null);
    await fetch(`/api/tables/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function handleAssign(tableId: string, waiterId: string) {
    if (!date || !service) return;
    setAssignSubmitting(true);
    setAssignError(null);
    const res = await fetch("/api/waiter-assignments/table", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId, waiterId, date, service }),
    });
    setAssignSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setAssignError(body?.message ?? "Impossibile assegnare il tavolo. Riprova.");
      return;
    }
    setMenuOpen(false);
    router.refresh();
  }

  async function handleRemoveAssignment(tableId: string) {
    if (!date || !service) return;
    setAssignSubmitting(true);
    setAssignError(null);
    const res = await fetch("/api/waiter-assignments/table", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId, date, service }),
    });
    setAssignSubmitting(false);
    if (!res.ok) {
      setAssignError("Impossibile rimuovere l'assegnazione. Riprova.");
      return;
    }
    setMenuOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Trascina i tavoli per riorganizzare la sala. Clicca per selezionare.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {waiterByTableId && (
            <div className="flex items-center gap-1 rounded-md border border-border p-1 text-xs">
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
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Riduci zoom"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Aumenta zoom"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFloorPlanOpen(true)}>
            <MapIcon className="h-4 w-4" /> {floorPlanUrl ? "Gestisci piantina" : "Carica piantina"}
          </Button>
          <Button variant="subtle" size="sm" onClick={addTable}>
            <Plus className="h-4 w-4" /> Nuovo tavolo
          </Button>
          <Button variant="accent" size="sm" onClick={persist} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Salvataggio…" : "Salva sala"}
          </Button>
        </div>
      </div>

      <div className="relative overflow-auto rounded-xl border-2 border-dashed border-border" style={{ height: VIEWPORT_HEIGHT }}>
        <div style={{ width: width * zoom, height: height * zoom }}>
          <div
            ref={canvasRef}
            className="relative bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:20px_20px]"
            style={{ width, height, transform: `scale(${zoom})`, transformOrigin: "0 0" }}
          >
            {floorPlanUrl && (
              <div
                className="pointer-events-none absolute inset-0 bg-center bg-no-repeat opacity-40"
                style={{ backgroundImage: `url(${floorPlanUrl})`, backgroundSize: "contain" }}
                aria-hidden="true"
              />
            )}

            {!floorPlanUrl && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                  Nessuna piantina caricata.
                  <button type="button" className="font-medium text-accent-strong hover:underline" onClick={() => setFloorPlanOpen(true)}>
                    Carica piantina
                  </button>
                </div>
              </div>
            )}

            {tables.map((t) => {
              const isSelected = selectedId === t.id;
              const assignment = waiterByTableId?.[t.id];
              const isAssigned = Boolean(assignment);
              const assignableWaiters = waiters.filter((w) => w.id !== assignment?.id);
              const matchesFilter =
                !waiterByTableId ||
                coverageFilter === "all" ||
                (coverageFilter === "assigned" && isAssigned) ||
                (coverageFilter === "unassigned" && !isAssigned);
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onMouseDown={(e) => onDrag(t.id, e)}
                  onClick={() => setSelectedId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(t.id);
                    } else if (e.key === "Delete" || e.key === "Backspace") {
                      if (isSelected) deleteTable(t.id);
                    }
                  }}
                  className={cn(
                    "absolute grid place-items-center select-none transition-shadow",
                    t.shape === "ROUND" && "rounded-full",
                    t.shape === "SQUARE" && "rounded-md",
                    t.shape === "RECT" && "rounded-md",
                    t.shape === "BOOTH" && "rounded-2xl",
                    t.shape === "LOUNGE" && "rounded-3xl",
                    t.active ? "table-pearl text-carbon-900" : "bg-muted text-muted-foreground",
                    isSelected && "ring-4 ring-accent/70",
                    waiterByTableId && !isAssigned && "opacity-70",
                    !matchesFilter && "opacity-20",
                    "shadow-lg hover:shadow-xl cursor-grab active:cursor-grabbing",
                  )}
                  style={{
                    left: t.posX,
                    top: t.posY,
                    width: t.shape === "RECT" ? 120 : t.shape === "BOOTH" ? 160 : t.shape === "LOUNGE" ? 140 : 80,
                    height: t.shape === "RECT" ? 70 : t.shape === "BOOTH" ? 90 : t.shape === "LOUNGE" ? 100 : 80,
                    transform: `rotate(${t.rotation}deg)`,
                  }}
                >
                  {isSelected && (
                    <DropdownMenu
                      open={menuOpen}
                      onOpenChange={(next) => {
                        setMenuOpen(next);
                        if (!next) {
                          setAssignStep({ kind: "list" });
                          setAssignError(null);
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Azioni tavolo ${t.label}`}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-transform hover:scale-110"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        onMouseDown={(e) => e.stopPropagation()}
                        className="min-w-[200px]"
                      >
                        {waiterByTableId && waiters.length > 0 && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <UserPlus className="h-4 w-4" /> Assegna
                              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="min-w-[220px]">
                              <div className="px-3 py-1.5 text-xs text-muted-foreground">Tavolo {t.label}</div>

                              {assignStep.kind === "confirm" ? (
                                <div className="space-y-2 p-2">
                                  <p className="px-1 text-xs text-card-foreground">
                                    {t.label} è assegnato a {assignment?.name}. Assegnarlo a {assignStep.waiterName}?
                                  </p>
                                  {assignError && <p className="px-1 text-xs text-destructive">{assignError}</p>}
                                  <div className="flex justify-end gap-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setAssignStep({ kind: "list" });
                                      }}
                                    >
                                      Annulla
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="accent"
                                      size="sm"
                                      disabled={assignSubmitting}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        handleAssign(t.id, assignStep.waiterId);
                                      }}
                                    >
                                      {assignSubmitting ? "Assegno…" : "Cambia assegnazione"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {assignment && (
                                    <div className="px-3 py-1 text-xs">
                                      <span className="text-muted-foreground">Assegnato a</span>{" "}
                                      <span className="font-medium text-card-foreground">{assignment.name}</span>
                                    </div>
                                  )}
                                  {assignError && <p className="px-3 py-1 text-xs text-destructive">{assignError}</p>}
                                  <DropdownMenuSeparator />
                                  {assignableWaiters.map((w) => (
                                    <DropdownMenuItem
                                      key={w.id}
                                      disabled={assignSubmitting}
                                      onSelect={(e) => {
                                        if (assignment) {
                                          e.preventDefault();
                                          setAssignStep({ kind: "confirm", waiterId: w.id, waiterName: w.name });
                                        } else {
                                          handleAssign(t.id, w.id);
                                        }
                                      }}
                                    >
                                      {w.name}
                                    </DropdownMenuItem>
                                  ))}
                                  {assignment && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        disabled={assignSubmitting}
                                        onSelect={(e) => {
                                          e.preventDefault();
                                          handleRemoveAssignment(t.id);
                                        }}
                                      >
                                        Rimuovi assegnazione
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </>
                              )}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => deleteTable(t.id)}
                        >
                          <Trash2 className="h-4 w-4" /> Elimina tavolo
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <span className="text-display text-sm font-semibold">{t.label}</span>
                  <span className="text-[10px] opacity-70">{t.seats} posti</span>
                  {waiterByTableId && (
                    <span
                      className={cn("max-w-[90%] truncate text-[9px]", isAssigned ? "font-medium opacity-90" : "italic opacity-50")}
                      title={assignment?.name}
                    >
                      {assignment ? compactWaiterName(assignment.name) : "Non assegnato"}
                    </span>
                  )}
                  {!t.active && <Lock className="absolute bottom-1 left-1 h-3 w-3" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <FloorPlanDialog
        open={floorPlanOpen}
        onOpenChange={setFloorPlanOpen}
        roomId={roomId}
        roomName={roomName}
        currentUrl={floorPlanUrl}
      />
    </div>
  );
});
