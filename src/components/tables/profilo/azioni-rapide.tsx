"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Plus, Receipt, Timer, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PannelloAzioni } from "@/components/ui/pannello";
import { readApiError } from "@/lib/api-client";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";

/**
 * Le azioni del tavolo, su **due livelli e mai due volte**.
 *
 * A un tavolo per volta se ne può fare una sola: a uno prenotato si segna
 * l'arrivo, a uno arrivato lo si accomoda, a uno seduto si apre il conto.
 * Quella è la **principale** e sta nella fascia in fondo, che non scorre — su
 * un telefono è dove arriva il pollice, e il profilo di un tavolo occupato è
 * più lungo di uno schermo.
 *
 * Tutto il resto — liberare il tavolo, aprire la prenotazione — è
 * **secondario** e sta dentro il riquadro dello stato, accanto ai fatti che lo
 * giustificano. Non è una scelta estetica: mettere le stesse azioni in tutti e
 * due i posti avrebbe ricreato i tre puntini in forma moderna — due strade per
 * lo stesso gesto, e nessuna delle due evidente.
 *
 * Quello che **non** è qui: assegnare il personale e mostrare il QR. Hanno la
 * loro piastrella, a due centimetri, e quella è già un bersaglio da toccare.
 *
 * ## Il tavolo libero fa eccezione
 *
 * Su un tavolo libero non c'è niente da aggiornare: l'unica cosa da fare è
 * **prenotarlo**, e quella non è la conclusione di ciò che si sta leggendo —
 * è la ragione per cui si è aperto il pannello. In fondo a una colonna di
 * storico arrivava dopo diciotto servizi passati, cioè dopo la risposta a una
 * domanda che non era stata fatta. Sale nella testata, accanto al nome del
 * tavolo, dove sta la domanda («questo tavolo») invece che dopo la risposta.
 *
 * Resta **una sola volta**: quando il pulsante è in testa, la fascia in fondo
 * non c'è proprio.
 */

/** Il cambio di stato di una prenotazione, condiviso fra le due fasce. */
export function useAzioniTavolo(profilo: ProfiloTavolo, onChanged: () => void) {
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const bookingId = profilo.corrente?.bookingId ?? null;

  const cambiaStato = useCallback(
    async (chiave: string, status: string) => {
      if (!bookingId) return;
      setInCorso(chiave);
      setErrore(null);
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setInCorso(null);
      if (!res.ok) {
        setErrore(await readApiError(res, "Non siamo riusciti ad aggiornare. Riprova."));
        return;
      }
      onChanged();
    },
    [bookingId, onChanged],
  );

  return { inCorso, errore, cambiaStato };
}

export type AzioniTavolo = ReturnType<typeof useAzioniTavolo>;

/* -------------------------------------------------------------------------- */
/*  Secondarie — dentro il riquadro dello stato                               */
/* -------------------------------------------------------------------------- */

export function AzioniContestuali({
  profilo,
  azioni,
  puoPrenotazioni,
}: {
  profilo: ProfiloTavolo;
  azioni: AzioniTavolo;
  puoPrenotazioni: boolean;
}) {
  const corrente = profilo.corrente;
  const prenotazioneId = corrente?.bookingId ?? profilo.prossima?.bookingId ?? null;

  // Liberare un tavolo è l'unica azione secondaria che scrive: senza il
  // permesso resta solo il collegamento alla scheda, che è di sola lettura.
  const puoLiberare = puoPrenotazioni && corrente?.status === "SEATED";
  if (!prenotazioneId && !puoLiberare) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-current/10 pt-3">
      {prenotazioneId && (
        <Link
          href={`/bookings/${prenotazioneId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
        >
          Apri prenotazione
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
      {puoLiberare && (
        <button
          type="button"
          disabled={azioni.inCorso !== null}
          onClick={() => azioni.cambiaStato("libera", "COMPLETED")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          {azioni.inCorso === "libera" ? "…" : "Libera tavolo"}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Principale — la fascia in fondo                                           */
/* -------------------------------------------------------------------------- */

export function AzioniRapide({
  profilo,
  azioni,
  puoPrenotazioni,
  onApriConto,
}: {
  profilo: ProfiloTavolo;
  azioni: AzioniTavolo;
  /** `manage_bookings`: senza, il pannello si legge e non si tocca. */
  puoPrenotazioni: boolean;
  onApriConto: () => void;
}) {
  const corrente = profilo.corrente;

  // Senza il permesso sulle prenotazioni non resta niente da fare qui dentro:
  // meglio nessuna fascia che una fascia di pulsanti che rispondono «non puoi».
  if (!puoPrenotazioni) return null;

  // Tavolo libero: l'unica azione è «prenota», e quella sta in testa
  // (`AzionePrenota`). Qui non resta niente, e una fascia vuota è una riga di
  // bordo che toglie spazio allo storico senza dire niente.
  if (!corrente) return null;

  return (
    <PannelloAzioni className="flex-col items-stretch">
      {azioni.errore && (
        <p role="alert" className="text-sm text-destructive-soft">
          {azioni.errore}
        </p>
      )}

      {corrente?.status === "SEATED" ? (
        <Button type="button" variant="accent" className="tocco-comodo w-full" onClick={onApriConto}>
          <Receipt className="h-4 w-4" /> Apri conto
        </Button>
      ) : corrente?.status === "ARRIVED" ? (
        <Button
          type="button"
          variant="accent"
          className="tocco-comodo w-full"
          disabled={azioni.inCorso !== null}
          onClick={() => azioni.cambiaStato("accomoda", "SEATED")}
        >
          <UtensilsCrossed className="h-4 w-4" />
          {azioni.inCorso === "accomoda" ? "…" : "Accomoda"}
        </Button>
      ) : (
        <Button
          type="button"
          variant="accent"
          className="tocco-comodo w-full"
          disabled={azioni.inCorso !== null}
          onClick={() => azioni.cambiaStato("arrivati", "ARRIVED")}
        >
          <Check className="h-4 w-4" />
          {azioni.inCorso === "arrivati" ? "…" : "Segna arrivati"}
        </Button>
      )}
    </PannelloAzioni>
  );
}

/* -------------------------------------------------------------------------- */
/*  Principale — in testa, quando il tavolo è libero                          */
/* -------------------------------------------------------------------------- */

/**
 * «Prenota», accanto al nome del tavolo.
 *
 * Scritto corto di proposito: il nome del tavolo è due centimetri a sinistra,
 * quindi «Nuova prenotazione» ripeterebbe in tre parole quello che la testata
 * dice già. Per chi naviga a voce il nome lungo resta nell'etichetta
 * accessibile.
 *
 * Nullo quando il tavolo è occupato: lì l'azione del momento è un'altra —
 * segnare l'arrivo, accomodare, battere il conto — e sta nella fascia in
 * fondo, sotto i fatti che la giustificano.
 */
export function AzionePrenota({
  profilo,
  puoPrenotazioni,
}: {
  profilo: ProfiloTavolo;
  puoPrenotazioni: boolean;
}) {
  if (!puoPrenotazioni || profilo.corrente) return null;

  return (
    <Button asChild variant="accent" size="sm" className="tocco-comodo shrink-0">
      <Link href="/bookings/new" aria-label="Nuova prenotazione">
        <Plus className="h-4 w-4" aria-hidden="true" /> Prenota
      </Link>
    </Button>
  );
}
