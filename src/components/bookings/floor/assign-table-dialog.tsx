"use client";

import { useMemo, useState } from "react";
import type { Table } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { bookingsOverlap } from "@/lib/booking-time";
import type { FloorBooking } from "./booking-table-node";

/**
 * Click-based alternative to dragging a card onto a table (brief section
 * 19: drag & drop must never be the only way) — also reused as the "Cambia
 * tavolo" flow from the detail dialog. Shows every table venue-wide (not
 * just the currently viewed room), flags capacity and same-slot conflicts
 * up front, and requires an explicit confirm only for a genuine mismatch
 * (brief section 28: normal assignment to a free, big-enough table needs no
 * confirmation at all).
 */
export function AssignTableDialog({
  open,
  onOpenChange,
  booking,
  tablesByRoom,
  assignedBookings,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: FloorBooking | null;
  tablesByRoom: { roomId: string; roomName: string; tables: Table[] }[];
  assignedBookings: FloorBooking[];
  onAssign: (tableId: string, opts: { force?: boolean }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [pendingTableId, setPendingTableId] = useState<string | null>(null);
  const [confirmTable, setConfirmTable] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);

  const occupiedTableIds = useMemo(() => {
    if (!booking) return new Set<string>();
    const ids = new Set<string>();
    for (const b of assignedBookings) {
      if (!b.tableId || b.id === booking.id) continue;
      if (bookingsOverlap(booking.startsAt, booking.durationMin, b.startsAt, b.durationMin)) ids.add(b.tableId);
    }
    return ids;
  }, [booking, assignedBookings]);

  if (!booking) return null;

  async function doAssign(table: Table, force: boolean) {
    setPendingTableId(table.id);
    setError(null);
    const result = await onAssign(table.id, { force });
    setPendingTableId(null);
    if (!result.ok) {
      setError(result.message ?? "Impossibile assegnare il tavolo. Riprova.");
      return;
    }
    setConfirmTable(null);
    onOpenChange(false);
  }

  function handlePick(table: Table) {
    setError(null);
    if (table.seats < (booking?.partySize ?? 0)) {
      setConfirmTable(table);
      return;
    }
    doAssign(table, false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[75vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assegna tavolo</DialogTitle>
          <DialogDescription>
            {booking.partySize} persone · richiede almeno {booking.partySize} posti
          </DialogDescription>
        </DialogHeader>

        {confirmTable ? (
          <div className="space-y-3">
            <p className="text-sm text-card-foreground">
              Il tavolo {confirmTable.label} ha {confirmTable.seats} posti, ma la prenotazione è per {booking.partySize} persone.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmTable(null)}>
                Annulla
              </Button>
              <Button type="button" variant="accent" disabled={pendingTableId === confirmTable.id} onClick={() => doAssign(confirmTable, true)}>
                {pendingTableId === confirmTable.id ? "Assegno…" : "Assegna comunque"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {tablesByRoom.map((room) => (
              <div key={room.roomId} className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{room.roomName}</p>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {room.tables.map((t) => {
                    const compatible = t.seats >= booking.partySize;
                    const occupied = occupiedTableIds.has(t.id);
                    const disabled = !t.active || occupied || pendingTableId !== null;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => handlePick(t)}
                        className={cn(
                          "flex flex-col items-start gap-1 rounded-md border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                          compatible ? "border-border hover:bg-secondary" : "border-dashed border-border hover:bg-secondary",
                        )}
                      >
                        <span className="text-sm font-semibold text-card-foreground">{t.label}</span>
                        <span className="text-xs text-muted-foreground">{t.seats} posti</span>
                        {occupied && <Badge tone="warning">Occupato</Badge>}
                        {!occupied && !compatible && <Badge tone="neutral">Pochi posti</Badge>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
