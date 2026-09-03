"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import type { BookingStatus, RoomLayoutMode, Table } from "@prisma/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTime } from "@/lib/utils";
import { bookingsOverlap } from "@/lib/booking-time";
import { BookingsFloorCanvas } from "./bookings-floor-canvas";
import { UnassignedPanel } from "./unassigned-panel";
import { AssignTableDialog } from "./assign-table-dialog";
import { AssignBookingDialog } from "./assign-booking-dialog";
import { BookingDetailDialog } from "./booking-detail-dialog";
import type { FloorBooking } from "./booking-table-node";
import type { Row } from "../bookings-page-client";

type RoomWithTables = {
  id: string;
  name: string;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
  tables: Table[];
};

/** Bookings in these statuses still need a seat; CANCELLED/NO_SHOW don't
 * occupy a table and don't need one assigned — mirrors the server's
 * ACTIVE_STATUSES in booking-floor.ts so a cancelled booking never shows a
 * table as falsely occupied. */
const NEEDS_TABLE_STATUSES = new Set<BookingStatus>(["CONFIRMED", "PENDING", "ARRIVED", "SEATED", "COMPLETED"]);

export function BookingsFloorView({
  rooms,
  rows,
  shiftWindow,
  canManage,
  onBookingUpdated,
}: {
  rooms: RoomWithTables[];
  rows: Row[];
  shiftWindow: { start: Date; end: Date } | null;
  canManage: boolean;
  onBookingUpdated: (updated: Row) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [activeRoomId, setActiveRoomId] = useState(() => {
    const fromUrl = search.get("room");
    return rooms.find((r) => r.id === fromUrl)?.id ?? rooms[0]?.id ?? "";
  });
  // Collapsed by default on phones only (brief section 40: never show a
  // microscopic floor plan squeezed next to a full-size panel) — collapsing
  // the panel gives the canvas the full stack height on first paint; a tap
  // still expands it. Desktop/tablet keep the previous always-expanded default.
  const [panelCollapsed, setPanelCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [assignPickerBookingId, setAssignPickerBookingId] = useState<string | null>(null);
  const [assignBookingForTableId, setAssignBookingForTableId] = useState<string | null>(null);
  const [draggingBooking, setDraggingBooking] = useState<{ id: string; partySize: number; startsAt: Date; durationMin: number } | null>(null);
  const [dropConfirm, setDropConfirm] = useState<{ bookingId: string; tableId: string; tableLabel: string; tableSeats: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeIndex = Math.max(0, rooms.findIndex((r) => r.id === activeRoomId));
  const activeRoom = rooms[activeIndex] ?? rooms[0];

  function goToRoom(delta: number) {
    if (rooms.length <= 1) return;
    const nextIndex = ((activeIndex + delta) % rooms.length + rooms.length) % rooms.length;
    const nextId = rooms[nextIndex].id;
    setActiveRoomId(nextId);
    const sp = new URLSearchParams(search);
    sp.set("room", nextId);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  // The ONE derivation point from the shared `rows` (brief sections 23/24) —
  // no separate fetch, no separate state; Elenco renders `rows` directly,
  // this is just a different filter/shape over the identical array.
  const inWindow = useMemo(() => {
    const needsTable = rows.filter((r) => NEEDS_TABLE_STATUSES.has(r.status));
    if (!shiftWindow) return needsTable;
    return needsTable.filter((r) => r.startsAt >= shiftWindow.start && r.startsAt <= shiftWindow.end);
  }, [rows, shiftWindow]);

  const unassigned = useMemo(
    () => inWindow.filter((r) => !r.tableId).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [inWindow],
  );
  const assigned = useMemo(() => inWindow.filter((r) => !!r.tableId), [inWindow]);

  // Distinguishes "genuinely nothing to assign" from "the service filter is
  // hiding real unassigned bookings" — without this the empty state claimed
  // "tutte le prenotazioni hanno un tavolo" even when the real cause was
  // simply that the selected service didn't match those bookings' time.
  const unassignedOutsideWindowCount = useMemo(() => {
    if (!shiftWindow || unassigned.length > 0) return 0;
    return rows.filter((r) => NEEDS_TABLE_STATUSES.has(r.status) && !r.tableId).length;
  }, [rows, shiftWindow, unassigned.length]);

  const bookingsByTableId = useMemo(() => {
    const map: Record<string, FloorBooking[]> = {};
    for (const b of assigned) {
      if (!b.tableId) continue;
      (map[b.tableId] ??= []).push(b);
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return map;
  }, [assigned]);

  const allTablesByRoom = useMemo(
    () => rooms.map((r) => ({ roomId: r.id, roomName: r.name, tables: r.tables })),
    [rooms],
  );

  // Tables already booked for the exact slot of the reservation being
  // dragged — excluded from the "compatible" highlight even if big enough
  // (brief sections 16/17: don't invite a drop that's doomed to conflict).
  const occupiedTableIdsForDrag = useMemo(() => {
    if (!draggingBooking) return new Set<string>();
    const ids = new Set<string>();
    for (const b of assigned) {
      if (!b.tableId) continue;
      if (bookingsOverlap(draggingBooking.startsAt, draggingBooking.durationMin, b.startsAt, b.durationMin)) ids.add(b.tableId);
    }
    return ids;
  }, [draggingBooking, assigned]);

  const selectedTable = activeRoom?.tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedBooking = selectedTable ? bookingsByTableId[selectedTable.id]?.[0] ?? null : null;
  const assignPickerBooking = unassigned.find((b) => b.id === assignPickerBookingId) ?? assigned.find((b) => b.id === assignPickerBookingId) ?? null;
  const assignBookingForTable = activeRoom?.tables.find((t) => t.id === assignBookingForTableId) ?? null;

  function showBanner(message: string) {
    setBanner(message);
    setTimeout(() => setBanner((cur) => (cur === message ? null : cur)), 4000);
  }

  async function callAssign(bookingId: string, tableId: string, force: boolean): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(`/api/bookings/${bookingId}/assign-table`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId, force }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.error === "capacity_mismatch" && !force) {
        return { ok: false, message: "capacity_mismatch" };
      }
      return { ok: false, message: body?.message ?? "Impossibile assegnare il tavolo." };
    }
    const raw = await res.json();
    // JSON has no Date type — startsAt comes back as a string, which would
    // silently break formatTime()/overlap checks on every subsequent render
    // once this booking sits back in the shared `rows` state.
    const updated: Row = { ...raw, startsAt: new Date(raw.startsAt) };
    onBookingUpdated(updated);
    return { ok: true };
  }

  async function handleAssignFromDialog(tableId: string, opts: { force?: boolean }) {
    if (!assignPickerBooking) return { ok: false };
    return callAssign(assignPickerBooking.id, tableId, !!opts.force);
  }

  async function handleAssignBookingFromDialog(bookingId: string, opts: { force?: boolean }) {
    if (!assignBookingForTable) return { ok: false };
    return callAssign(bookingId, assignBookingForTable.id, !!opts.force);
  }

  async function handleRemoveTable() {
    if (!selectedBooking) return { ok: false };
    const res = await fetch(`/api/bookings/${selectedBooking.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tableId: null }),
    });
    if (!res.ok) return { ok: false, message: "Impossibile rimuovere il tavolo. Riprova." };
    onBookingUpdated({ ...selectedBooking, tableId: null, table: null });
    setSelectedTableId(null);
    return { ok: true };
  }

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { type: string; bookingId: string; partySize: number } | undefined;
    if (data?.type !== "booking") return;
    const booking = unassigned.find((b) => b.id === data.bookingId);
    if (!booking) return;
    setDraggingBooking({ id: booking.id, partySize: booking.partySize, startsAt: booking.startsAt, durationMin: booking.durationMin });
  }

  async function onDragEnd(event: DragEndEvent) {
    const dragged = draggingBooking;
    setDraggingBooking(null);
    if (!dragged || !event.over) return;
    const tableData = event.over.data.current as { type: string; tableId: string; seats: number } | undefined;
    if (tableData?.type !== "table") return;

    if (tableData.seats < dragged.partySize) {
      const table = activeRoom?.tables.find((t) => t.id === tableData.tableId);
      setDropConfirm({ bookingId: dragged.id, tableId: tableData.tableId, tableLabel: table?.label ?? "", tableSeats: tableData.seats });
      return;
    }
    const result = await callAssign(dragged.id, tableData.tableId, false);
    if (!result.ok) showBanner(result.message ?? "Impossibile assegnare il tavolo.");
  }

  if (!activeRoom) {
    return <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">Nessuna sala configurata.</div>;
  }

  const draggingBookingObj = draggingBooking ? unassigned.find((b) => b.id === draggingBooking.id) : null;

  return (
    <DndContext
      sensors={sensors}
      // The draggable card is much bigger than a table's drop zone, so the
      // default rectIntersection (whole-card-rect vs. table-rect) often
      // finds zero overlap even when the cursor is squarely over the table.
      // pointerWithin checks the cursor position instead, matching what a
      // user actually expects "dropping onto a table" to mean.
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingBooking(null)}
    >
      <div className="flex h-[calc(100vh-260px)] min-h-[480px] flex-col gap-2">
        {banner && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{banner}</p>}

        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="ghost" onClick={() => goToRoom(-1)} disabled={rooms.length <= 1} aria-label="Sala precedente">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium text-card-foreground">{activeRoom.name}</p>
          <Button type="button" size="icon" variant="ghost" onClick={() => goToRoom(1)} disabled={rooms.length <= 1} aria-label="Sala successiva">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {rooms.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {activeIndex + 1} / {rooms.length}
            </span>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 sm:flex-row">
          <div className="surface min-h-[320px] flex-1 overflow-hidden rounded-xl sm:min-h-0" style={{ flexBasis: "72%" }}>
            <BookingsFloorCanvas
              tables={activeRoom.tables}
              bookingsByTableId={bookingsByTableId}
              floorPlanUrl={activeRoom.floorPlanUrl}
              activeLayoutMode={activeRoom.activeLayoutMode}
              roomLayoutElements={activeRoom.roomLayoutElements}
              width={activeRoom.width}
              height={activeRoom.height}
              roomId={activeRoom.id}
              selectedTableId={selectedTableId}
              onSelectTable={(tableId) => {
                if (!tableId) {
                  setSelectedTableId(null);
                  return;
                }
                const hasBooking = !!bookingsByTableId[tableId]?.length;
                if (hasBooking) {
                  setSelectedTableId(tableId);
                  return;
                }
                // Flusso inverso TAVOLO -> PRENOTAZIONE (brief section 26) —
                // read-only viewers can still see the table, just can't act.
                if (canManage) setAssignBookingForTableId(tableId);
              }}
              draggingPartySize={draggingBooking?.partySize ?? null}
              occupiedTableIds={occupiedTableIdsForDrag}
            />
          </div>
          <div className="min-h-0 overflow-hidden rounded-xl sm:flex-1" style={{ flexBasis: "28%" }}>
            <UnassignedPanel
              bookings={unassigned}
              collapsed={panelCollapsed}
              onToggleCollapsed={() => setPanelCollapsed((v) => !v)}
              onAssignClick={setAssignPickerBookingId}
              draggingBookingId={draggingBooking?.id ?? null}
              canManage={canManage}
              hiddenByServiceCount={unassignedOutsideWindowCount}
            />
          </div>
        </div>
      </div>

      <DragOverlay>
        {draggingBookingObj && (
          <div className="w-56 rounded-md border border-accent bg-card p-2.5 shadow-xl">
            <p className="text-xs font-medium text-accent-strong">{formatTime(draggingBookingObj.startsAt)}</p>
            <p className="text-sm font-semibold text-card-foreground">
              {draggingBookingObj.guest ? `${draggingBookingObj.guest.firstName} ${draggingBookingObj.guest.lastName ?? ""}`.trim() : "Walk-in"}
            </p>
            <p className="text-xs text-muted-foreground">{draggingBookingObj.partySize} persone</p>
          </div>
        )}
      </DragOverlay>

      <AssignTableDialog
        open={!!assignPickerBooking}
        onOpenChange={(next) => !next && setAssignPickerBookingId(null)}
        booking={assignPickerBooking}
        tablesByRoom={allTablesByRoom}
        assignedBookings={assigned}
        onAssign={handleAssignFromDialog}
      />

      <AssignBookingDialog
        open={!!assignBookingForTable}
        onOpenChange={(next) => !next && setAssignBookingForTableId(null)}
        table={assignBookingForTable}
        unassignedBookings={unassigned}
        onAssign={handleAssignBookingFromDialog}
      />

      <BookingDetailDialog
        open={!!selectedBooking}
        onOpenChange={(next) => !next && setSelectedTableId(null)}
        booking={selectedBooking}
        tableLabel={selectedTable?.label ?? ""}
        canManage={canManage}
        onChangeTable={() => {
          if (selectedBooking) setAssignPickerBookingId(selectedBooking.id);
          setSelectedTableId(null);
        }}
        onRemoveTable={handleRemoveTable}
      />

      <Dialog open={!!dropConfirm} onOpenChange={(next) => !next && setDropConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pochi posti disponibili</DialogTitle>
          </DialogHeader>
          {dropConfirm && (
            <>
              <p className="text-sm text-card-foreground">
                Il tavolo {dropConfirm.tableLabel} ha {dropConfirm.tableSeats} posti, ma la prenotazione è per{" "}
                {unassigned.find((b) => b.id === dropConfirm.bookingId)?.partySize} persone.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDropConfirm(null)}>
                  Annulla
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={async () => {
                    const result = await callAssign(dropConfirm.bookingId, dropConfirm.tableId, true);
                    if (!result.ok) showBanner(result.message ?? "Impossibile assegnare il tavolo.");
                    setDropConfirm(null);
                  }}
                >
                  Assegna comunque
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}
