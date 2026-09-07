"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  Cake,
  Check,
  CircleUser,
  CreditCard,
  Phone,
  Timer,
  UserX,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ServiceBooking } from "@/server/service";
import { TablePickerDialog } from "@/components/service/table-picker-dialog";

const OCCASIONE: Record<string, string> = {
  BIRTHDAY: "Compleanno",
  ANNIVERSARY: "Anniversario",
  BUSINESS: "Lavoro",
  DATE: "Romantica",
  CELEBRATION: "Celebrazione",
  OTHER: "Occasione",
};

/**
 * Una riga della modalità Servizio.
 *
 * I pulsanti cambiano con lo stato, e sono pochi di proposito: chi accoglie
 * non sceglie fra otto azioni, fa **la** cosa che va fatta adesso. Chi deve
 * arrivare si segna arrivato; chi è arrivato si accomoda; chi è seduto si
 * chiude. Il resto — cambiare tavolo, chiamare, aprire la scheda — sta a
 * fianco, più piccolo.
 */
export function ServiceBookingCard({
  booking,
  timezone,
  canManage,
  onChanged,
}: {
  booking: ServiceBooking;
  timezone: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<"seat" | "move" | null>(null);

  const ora = new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(booking.startsAt));

  async function cambiaStato(nome: string, status: string) {
    setBusy(nome);
    setError(null);
    const res = await fetch(`/api/bookings/${booking.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad aggiornare. Riprova."));
      return;
    }
    onChanged();
  }

  /** Accomodare richiede un tavolo: se non ce n'è uno, prima si scegli. */
  async function accomoda() {
    if (!booking.tableId) {
      setPickerFor("seat");
      return;
    }
    await cambiaStato("seat", "SEATED");
  }

  return (
    <article
      className={cn(
        "surface rounded-md border p-3",
        booking.lateBy > 0
          ? "border-accent/60"
          : booking.status === "SEATED" && (booking.minutesToFree ?? 1) <= 0
            ? "border-border-strong"
            : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-display text-lg tabular-nums">{ora}</span>
            <span className="truncate font-medium">{booking.guestName}</span>
            {booking.isVip && (
              <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px]">VIP</span>
            )}
            {booking.tableLabel ? (
              <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">
                {booking.tableLabel}
              </span>
            ) : (
              <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-tertiary-foreground">
                senza tavolo
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            {booking.partySize} {booking.partySize === 1 ? "persona" : "persone"}
            {booking.status === "SEATED" && booking.minutesToFree !== null && (
              <>
                {" · "}
                <span className={cn((booking.minutesToFree ?? 0) <= 0 && "text-accent")}>
                  {booking.minutesToFree > 0
                    ? `libero fra ~${booking.minutesToFree} min`
                    : `oltre di ${Math.abs(booking.minutesToFree)} min`}
                </span>
              </>
            )}
            {booking.lateBy > 0 && (
              <>
                {" · "}
                <span className="text-accent">in ritardo di {booking.lateBy} min</span>
              </>
            )}
            {booking.status !== "SEATED" &&
              booking.lateBy === 0 &&
              booking.minutesToArrival > 0 && <> · fra {booking.minutesToArrival} min</>}
          </p>

          {(booking.allergies || booking.occasion || booking.notes || booking.depositCents > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {booking.allergies && (
                <span className="flex items-center gap-1 text-accent">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {booking.allergies}
                </span>
              )}
              {booking.occasion && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Cake className="h-3 w-3" aria-hidden="true" />
                  {OCCASIONE[booking.occasion] ?? booking.occasion}
                </span>
              )}
              {booking.depositCents > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CreditCard className="h-3 w-3" aria-hidden="true" />
                  caparra {(booking.depositCents / 100).toFixed(0)} €
                </span>
              )}
              {booking.notes && <span className="text-tertiary-foreground">{booking.notes}</span>}
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {(booking.status === "CONFIRMED" || booking.status === "PENDING") && (
              <>
                <Button
                  size="sm"
                  variant="accent"
                  disabled={busy !== null}
                  onClick={() => cambiaStato("arrived", "ARRIVED")}
                >
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {busy === "arrived" ? "…" : "Arrivato"}
                </Button>
                {booking.lateBy > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => cambiaStato("noshow", "NO_SHOW")}
                  >
                    <UserX className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {busy === "noshow" ? "…" : "No-show"}
                  </Button>
                )}
              </>
            )}

            {booking.status === "ARRIVED" && (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={accomoda}>
                <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "seat" ? "…" : "Accomoda"}
              </Button>
            )}

            {booking.status === "SEATED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => cambiaStato("done", "COMPLETED")}
              >
                <Timer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "done" ? "…" : "Libera tavolo"}
              </Button>
            )}

            <div className="flex items-center gap-0.5">
              {booking.tableId && booking.status !== "COMPLETED" && (
                <button
                  type="button"
                  onClick={() => setPickerFor("move")}
                  aria-label="Cambia tavolo"
                  title="Cambia tavolo"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {booking.phone && (
                <a
                  href={`tel:${booking.phone}`}
                  aria-label={`Chiama ${booking.guestName}`}
                  title="Chiama"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              {booking.guestId && (
                <Link
                  href={`/guests/${booking.guestId}`}
                  aria-label={`Apri la scheda di ${booking.guestName}`}
                  title="Apri scheda ospite"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
                >
                  <CircleUser className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {pickerFor && (
        <TablePickerDialog
          open
          onOpenChange={(v) => !v && setPickerFor(null)}
          bookingId={booking.id}
          partySize={booking.partySize}
          titolo={pickerFor === "seat" ? `Accomoda ${booking.guestName}` : `Sposta ${booking.guestName}`}
          /** Accomodando, dopo l'assegnazione si segna anche seduto. */
          seatAfter={pickerFor === "seat"}
          onDone={() => {
            setPickerFor(null);
            onChanged();
          }}
        />
      )}
    </article>
  );
}
