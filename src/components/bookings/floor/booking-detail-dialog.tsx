"use client";

import Link from "next/link";
import { useState } from "react";
import { Phone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge, SourceBadge } from "@/components/bookings/status-badge";
import { formatTime } from "@/lib/utils";
import type { FloorBooking } from "./booking-table-node";

/**
 * Deliberately NOT the full booking form (brief section 13: "NON duplicare
 * tutta la scheda prenotazione") — just enough to confirm who's at the
 * table and act, with "Apri prenotazione" for anything more.
 */
export function BookingDetailDialog({
  open,
  onOpenChange,
  booking,
  tableLabel,
  canManage,
  onChangeTable,
  onRemoveTable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: FloorBooking | null;
  tableLabel: string;
  canManage: boolean;
  onChangeTable: () => void;
  onRemoveTable: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const [removing, setRemoving] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!booking) return null;
  const guestName = booking.guest ? `${booking.guest.firstName} ${booking.guest.lastName ?? ""}`.trim() : "Walk-in";

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    const result = await onRemoveTable();
    setRemoving(false);
    if (!result.ok) {
      setError(result.message ?? "Impossibile rimuovere il tavolo. Riprova.");
      return;
    }
    setConfirmingRemove(false);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setConfirmingRemove(false);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tavolo {tableLabel}</DialogTitle>
          <DialogDescription>{formatTime(booking.startsAt)} · {booking.partySize} persone</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-base font-semibold text-card-foreground">{guestName}</p>
          {booking.guest?.phone && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {booking.guest.phone}
            </p>
          )}
          <div className="flex items-center gap-2">
            <SourceBadge source={booking.source} />
            <StatusBadge status={booking.status} />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {confirmingRemove ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="text-sm text-card-foreground">Rimuovere questo tavolo dalla prenotazione?</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmingRemove(false)} disabled={removing}>
                Annulla
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={handleRemove} disabled={removing}>
                {removing ? "Rimuovo…" : "Rimuovi tavolo"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/bookings/${booking.id}`}>Apri prenotazione</Link>
            </Button>
            {canManage && (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onChangeTable}>
                  Cambia tavolo
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmingRemove(true)}>
                  Rimuovi tavolo
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
