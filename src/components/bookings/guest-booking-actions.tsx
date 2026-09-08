"use client";

import { useState } from "react";
import { CalendarCheck, CalendarX, CheckCircle2, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import type { GuestBookingView } from "@/server/guest-actions";

/**
 * Quello che vede un ospite quando apre il link del promemoria: la sua
 * prenotazione e un solo gesto da fare.
 *
 * Il token è legato all'azione, quindi la pagina non offre scelte che il link
 * non permette: chi ha cliccato «non riesco a venire» vede il pulsante per
 * annullare, non un modulo da compilare.
 */
export function GuestBookingActions({
  token,
  booking,
}: {
  token: string;
  booking: GuestBookingView;
}) {
  const [esito, setEsito] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const annulla = booking.action === "cancel";

  const giorno = new Intl.DateTimeFormat("it-IT", {
    timeZone: booking.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(booking.startsAt));

  const ora = new Intl.DateTimeFormat("it-IT", {
    timeZone: booking.timezone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(booking.startsAt));

  async function agisci() {
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/public/booking-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    setInCorso(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a registrare la tua risposta. Riprova."));
      return;
    }
    const body = await res.json();
    setEsito(body.message as string);
  }

  return (
    <div className="surface riquadro p-6">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{booking.venueName}</p>
      <h1 className="mt-1 text-display text-2xl">
        {booking.guestName ? `Ciao ${booking.guestName}` : "La tua prenotazione"}
      </h1>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-tertiary-foreground" aria-hidden="true" />
          <dt className="sr-only">Quando</dt>
          <dd>
            {/* `capitalize` maiuscolava ogni parola: "Lunedì 7 Settembre Alle 14:51". */}
            <span className="first-letter:uppercase">{giorno}</span> alle {ora}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-tertiary-foreground" aria-hidden="true" />
          <dt className="sr-only">Persone</dt>
          <dd>
            {booking.partySize} {booking.partySize === 1 ? "persona" : "persone"}
          </dd>
        </div>
      </dl>

      {esito ? (
        <p className="mt-6 flex items-start gap-2 rounded-md bg-current/10 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
          {esito}
        </p>
      ) : booking.closed ? (
        <p className="mt-6 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Questa prenotazione è già stata chiusa.
          {booking.venuePhone && <> Se ti serve una mano, chiama il {booking.venuePhone}.</>}
        </p>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {annulla
              ? "Confermi di volerla annullare? Il tavolo torna disponibile per altri."
              : "Confermi che ci sarai? Ci aiuta a tenere il tavolo pronto per te."}
          </p>

          <Button
            type="button"
            variant={annulla ? "outline" : "accent"}
            className="mt-4 w-full"
            disabled={inCorso}
            onClick={agisci}
          >
            {annulla ? (
              <CalendarX className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <CalendarCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {inCorso ? "Un istante…" : annulla ? "Sì, annulla la prenotazione" : "Sì, ci sarò"}
          </Button>

          {booking.venuePhone && (
            <p className="mt-4 text-center text-xs text-tertiary-foreground">
              Ti serve cambiare orario o numero di persone? Chiamaci allo {booking.venuePhone}.
            </p>
          )}
        </>
      )}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
