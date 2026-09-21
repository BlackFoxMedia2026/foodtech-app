"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { avanzamentoTurno } from "@/lib/avanzamento-turno";

/**
 * **A che punto è il servizio.**
 *
 * Una barra sottile dentro la card del turno, non un widget: la domanda
 * «quanto manca?» merita una risposta in un colpo d'occhio, non una sezione.
 *
 * ## Perché è un componente client, che è la scelta scomoda
 *
 * Tutto il resto di questa Home è renderizzato sul server, e va bene: un
 * tavolo che cambia stato lo si scopre riaprendo la schermata. Un orologio
 * no. Una pagina lasciata aperta sul bancone per quaranta minuti mostrerebbe
 * una barra ferma a quaranta minuti fa, e una barra ferma è peggio di nessuna
 * barra — perché la si crede.
 *
 * ## Il fuso, e perché l'ora arriva da fuori
 *
 * `oraMinuti` lo calcola il server nel fuso **del locale**
 * (`server/staff-app/turno.ts`). Qui non si chiama mai `getHours()`: nel
 * browser darebbe il fuso del telefono, che per chi ha l'orologio sbagliato o
 * è appena atterrato non è quello della sala. Il tempo che passa invece lo si
 * misura in locale — un delta fra due `Date.now()` è la stessa quantità in
 * ogni fuso del mondo — e si somma a quello che ha detto il server.
 *
 * Questo tiene anche l'idratazione pulita: il primo disegno del client usa
 * esattamente il valore del server, e si muove solo dopo.
 *
 * ## Perché «4h 12m rimanenti» non è più scritto
 *
 * C'era, sotto la barra, ed era la barra detta a parole. Due volte la
 * stessa informazione in due centimetri: chi guarda la barra non legge la
 * riga, chi legge la riga non guarda la barra, e intanto la card cresceva
 * di venti pixel.
 *
 * Resta **nell'etichetta accessibile**, e lì non è ridondante: a chi legge
 * con uno screen reader la posizione di un pallino su un binario non dice
 * niente, e «42 per cento del turno, 4h 12m rimanenti» è l'unica forma in
 * cui quell'informazione esiste.
 */

/** Ogni mezzo minuto: la barra avanza di un pixel ogni due minuti scarsi. */
const PASSO_MS = 30_000;

export function AvanzamentoServizio({
  inizioMinuti,
  fineMinuti,
  oraMinuti,
  inizio,
  fine,
}: {
  inizioMinuti: number | null;
  fineMinuti: number | null;
  /** L'ora corrente in minuti da mezzanotte, nel fuso del locale. */
  oraMinuti: number;
  /** Le etichette già formattate: «17:00», «02:00». */
  inizio: string;
  fine: string;
}) {
  const [ora, setOra] = useState(oraMinuti);

  useEffect(() => {
    const montato = Date.now();
    const id = setInterval(() => {
      setOra(oraMinuti + (Date.now() - montato) / 60_000);
    }, PASSO_MS);
    return () => clearInterval(id);
  }, [oraMinuti]);

  const a = avanzamentoTurno(inizioMinuti, fineMinuti, ora);
  if (!a) return null;

  const percento = Math.min(100, Math.max(0, a.frazione * 100));

  return (
    <div className="mt-2.5 flex items-center gap-2.5">
      <span className="sa-nota shrink-0 tabular-nums">{inizio}</span>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={a.percentuale}
        aria-valuetext={`${a.percentuale}% del turno, ${a.testo.toLowerCase()}`}
        aria-label="Avanzamento del turno"
        className="relative h-1.5 min-w-0 flex-1 rounded-full bg-card-sunken"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
            /* Concluso in salvia e non in terracotta: il terracotta di questa
               app vuol dire «alzati», e un turno finito non chiede niente. */
            a.stato === "finito" ? "bg-sage/70" : "bg-accent-strong",
          )}
          style={{ width: `${percento}%` }}
        />
        {a.stato === "in-corso" && (
          /*
            Il pallino di «adesso».

            Sta dentro una fascia rientrata di sei pixel per lato, così a
            inizio e fine turno non sporge oltre il binario. Il bordo scuro è
            quello che lo stacca dal riempimento su cui scorre: senza, a metà
            barra un cerchio crema su una barra crema non si vede.
          */
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1.5 right-1.5">
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground transition-[left] duration-500 ease-out motion-reduce:transition-none"
              style={{ left: `${percento}%` }}
            />
          </span>
        )}
      </div>
      <span className="sa-nota shrink-0 tabular-nums">{fine}</span>
    </div>
  );
}
