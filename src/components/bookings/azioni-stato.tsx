"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { readApiError } from "@/lib/api-client";
import { STATUS_LABELS } from "@/components/bookings/status-badge";
import type { BookingStatus } from "@prisma/client";

/** I sette stati, nell'ordine in cui una prenotazione li attraversa. */
export const STATI: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "ARRIVED",
  "SEATED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
];

/**
 * Cambiare lo stato di una prenotazione.
 *
 * Stava scritto **dentro** la tabella delle prenotazioni, e la pagina intera
 * della prenotazione — quella che si apre da un link condiviso — non aveva
 * nessuna azione: si poteva leggere e non fare. Nel codice della tabella c'era
 * anche scritto «la pagina intera resta raggiungibile: da qui si va a tutto il
 * resto», che non era vero.
 *
 * Ora è un componente solo, usato dai due posti: due copie della stessa
 * azione sono due copie che un giorno divergono — è già successo oggi con la
 * cella dei numeri del servizio.
 *
 * Il verde di «Approva» era `bg-green-600`, fuori tavolozza e sotto soglia
 * (4,14 : 1 col testo più scuro possibile). Ora è `sage-deep` col crema:
 * 6,16 : 1, e il verde è quello del prodotto.
 */
export function AzioniStato({
  bookingId,
  stato,
  nome,
  className,
}: {
  bookingId: string;
  stato: BookingStatus;
  /** Serve nell'etichetta accessibile: su tredici righe uguali dice quale. */
  nome: string;
  className?: string;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<BookingStatus | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function cambia(nuovo: BookingStatus) {
    setErrore(null);
    setInCorso(nuovo);
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nuovo }),
    });
    setInCorso(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non è stato possibile cambiare lo stato. Riprova."));
      return;
    }
    router.refresh();
  }

  const attesa = stato === "PENDING";

  return (
    <div className={className}>
      <div className="flex items-center justify-end gap-2">
        {attesa ? (
          <>
            <Button
              size="sm"
              className="bg-sage-deep text-cream hover:bg-sage-deep/90"
              disabled={inCorso !== null}
              onClick={() => cambia("CONFIRMED")}
            >
              {inCorso === "CONFIRMED" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Approva
            </Button>
            <Button size="sm" variant="outline" disabled={inCorso !== null} onClick={() => cambia("CANCELLED")}>
              Rifiuta
            </Button>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="tocco-comodo"
                aria-label={`Cambia lo stato di ${nome}`}
                title="Cambia stato"
              >
                {inCorso ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATI.map((k) => (
                <DropdownMenuItem key={k} onSelect={() => cambia(k)}>
                  <span className="flex-1">{STATUS_LABELS[k]}</span>
                  {stato === k && <Check className="ml-2 h-3.5 w-3.5" aria-hidden="true" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {errore && <p className="mt-2 text-sm font-medium text-destructive-soft">{errore}</p>}
    </div>
  );
}
