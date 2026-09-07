"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Table } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Save, Check, MapIcon, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TABLE_SIZE, type LocalTable, type TableStaffMap } from "./table-node";
import { RoomTableNode } from "./operational/room-table-node";
import { OperationalRoomView } from "./operational/operational-room-view";
import { ManagePlanDialog } from "./manage-plan-dialog";
import { AssignStaffDialog } from "./assign-staff-dialog";
import { NewTableDialog } from "./new-table-dialog";
import { parseRoomLayoutElements, getRoomBounds } from "@/lib/room-layout";
import type { TableOperationalStatus } from "@/lib/table-status";
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
    statusByTableId?: Record<string, TableOperationalStatus>;
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
    statusByTableId,
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
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignStaffTableId, setAssignStaffTableId] = useState<string | null>(null);

  const parsedLayoutElements = useMemo(() => parseRoomLayoutElements(roomLayoutElements), [roomLayoutElements]);
  const roomBounds = useMemo(
    () =>
      getRoomBounds(
        { width, height, activeLayoutMode },
        parsedLayoutElements,
        tables.map((t) => ({ x: t.posX, y: t.posY, ...TABLE_SIZE[t.shape] })),
      ),
    [width, height, activeLayoutMode, parsedLayoutElements, tables],
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [selectedId]);

  const isDirty = tables.some((t) => t.dirty);

  useEffect(() => {
    onDirtyChange?.(isDirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

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

  return (
    <OperationalRoomView
      width={width}
      height={height}
      roomBounds={roomBounds}
      floorPlanUrl={floorPlanUrl}
      activeLayoutMode={activeLayoutMode}
      roomLayoutElements={parsedLayoutElements}
      tables={tables}
      onBackgroundClick={() => setSelectedId(null)}
      emptyPlanSlot={
        <>
          Nessuna piantina caricata.
          <button type="button" className="font-medium text-accent-strong hover:underline" onClick={() => setManagePlanOpen(true)}>
            Crea la tua sala
          </button>
        </>
      }
      renderTable={(t, ctx) => {
        const isSelected = selectedId === t.id;
        const staff = staffByTableId?.[t.id];
        const isAssigned = Boolean(staff?.TABLE_RESPONSIBLE);
        const matchesFilter =
          !staffByTableId ||
          coverageFilter === "all" ||
          (coverageFilter === "assigned" && isAssigned) ||
          (coverageFilter === "unassigned" && !isAssigned);
        return (
          <RoomTableNode
            key={t.id}
            table={t}
            mode="STAFF"
            status={statusByTableId?.[t.id]}
            isSelected={isSelected}
            matchesFilter={matchesFilter}
            staff={staff}
            lod={ctx.lod}
            onSelect={onSelect}
            onDelete={deleteTable}
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
      }}
    >
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
          <Button variant="subtle" size="sm" className="hidden shadow-lg sm:inline-flex" onClick={() => setNewTableOpen(true)}>
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
              <DropdownMenuItem onSelect={() => setNewTableOpen(true)}>
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
          Trascina lo sfondo per navigare · clicca un tavolo per i dettagli
        </span>
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

      <NewTableDialog
        open={newTableOpen}
        onOpenChange={setNewTableOpen}
        roomId={roomId}
        roomName={roomName}
        onCreated={(t) => {
          setTables((prev) => [...prev, t]);
          router.refresh();
        }}
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
    </OperationalRoomView>
  );
});
