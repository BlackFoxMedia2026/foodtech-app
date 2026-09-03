"use client";

import { useState } from "react";
import type { Table } from "@prisma/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/utils";
import type { FloorBooking } from "./booking-table-node";

/**
 * The reverse of AssignTableDialog: click a FREE table first, then pick
 * which unassigned reservation goes there (brief section 26 — "flusso
 * inverso TAVOLO → PRENOTAZIONE"). Same confirm-only-on-mismatch rule as the
 * booking-first flow.
 */
export function AssignBookingDialog({
  open,
  onOpenChange,
  table,
  unassignedBookings,
  onAssign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: Table | null;
  unassignedBookings: FloorBooking[];
  onAssign: (bookingId: string, opts: { force?: boolean }) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [confirmBooking, setConfirmBooking] = useState<FloorBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!table) return null;

  async function doAssign(booking: FloorBooking, force: boolean) {
    setPendingBookingId(booking.id);
    setError(null);
    const result = await onAssign(booking.id, { force });
    setPendingBookingId(null);
    if (!result.ok) {
      setError(result.message ?? "Impossibile assegnare la prenotazione. Riprova.");
      return;
    }
    setConfirmBooking(null);
    onOpenChange(false);
  }

  function handlePick(booking: FloorBooking) {
    setError(null);
    if (table!.seats < booking.partySize) {
      setConfirmBooking(booking);
      return;
    }
    doAssign(booking, false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[75vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assegna una prenotazione</DialogTitle>
          <DialogDescription>
            Tavolo {table.label} · {table.seats} posti
          </DialogDescription>
        </DialogHeader>

        {confirmBooking ? (
          <div className="space-y-3">
            <p className="text-sm text-card-foreground">
              Il tavolo {table.label} ha {table.seats} posti, ma la prenotazione è per {confirmBooking.partySize} persone.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmBooking(null)}>
                Annulla
              </Button>
              <Button type="button" variant="accent" disabled={pendingBookingId === confirmBooking.id} onClick={() => doAssign(confirmBooking, true)}>
                {pendingBookingId === confirmBooking.id ? "Assegno…" : "Assegna comunque"}
              </Button>
            </div>
          </div>
        ) : unassignedBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna prenotazione senza tavolo al momento.</p>
        ) : (
          <div className="space-y-1.5">
            {unassignedBookings.map((b) => {
              const guestName = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
              const compatible = table.seats >= b.partySize;
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={pendingBookingId !== null}
                  onClick={() => handlePick(b)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-2.5 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-accent-strong">{formatTime(b.startsAt)}</p>
                    <p className="truncate text-sm font-semibold text-card-foreground">{guestName}</p>
                    <p className="text-xs text-muted-foreground">{b.partySize} persone{!compatible ? " · pochi posti" : ""}</p>
                  </div>
                </button>
              );
            })}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
