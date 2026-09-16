"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { readApiError } from "@/lib/api-client";
import { durataUmana } from "@/lib/durata";
import { formatCurrency } from "@/lib/utils";
import { oraInVenue } from "@/lib/venue-time";
import type { ProfiloTavolo, ServizioPassato } from "@/server/profilo-tavolo";
import { Gruppo } from "./sezione";

/** «10 set», dal giorno di servizio. Formattato in UTC perché la chiave è già
 *  una data pura nel fuso del locale: riformattarla in un altro fuso la
 *  sposterebbe di un giorno per chi guarda da lontano. */
const GIORNO = new Intl.DateTimeFormat("it-IT", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

function etichettaGiorno(chiave: string): string {
  return GIORNO.format(new Date(`${chiave}T12:00:00.000Z`));
}

/**
 * Cos'è già successo su questo tavolo — **in fondo, e va bene così**.
 *
 * ## Perché pesa meno di prima
 *
 * Perché è l'unica parte del pannello che non riguarda adesso. Prendeva quasi
 * metà dell'altezza con lo stesso trattamento di «chi è seduto e quanto deve»,
 * e un pannello in cui il passato pesa quanto il presente è un pannello che si
 * legge tutto o non si legge.
 *
 * ## Tre livelli in tre righe
 *
 * Ogni servizio è una riga con una gerarchia dichiarata, non sette fatti
 * allineati:
 *
 * 1. **data e totale** — le due cose che si scorrono con l'occhio quando si
 *    cerca «gira, questo tavolo?»;
 * 2. **servizio e ospiti** — di che pasto si parla e quanti erano;
 * 3. **orari, durata, chi c'era** — il dettaglio, per chi si ferma su una riga.
 *
 * Nessuna riga di separazione fra i servizi: basta lo spazio, perché le tre
 * righe di un servizio stanno vicine fra loro e lontane dal successivo.
 *
 * ## Non si aggiorna da solo
 *
 * È passato, non cambia. Quando il profilo si ricarica perché qualcuno ha
 * pagato, le righe già aperte con «vedi tutto» restano dove sono.
 */
export function StoricoTavolo({ profilo }: { profilo: ProfiloTavolo }) {
  const [righe, setRighe] = useState<ServizioPassato[]>(profilo.storico);
  const [caricando, setCaricando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const tutto = righe.length >= profilo.storicoTotale;

  async function altri() {
    setCaricando(true);
    setErrore(null);
    const res = await fetch(`/api/tables/${profilo.tavolo.id}/storico?limit=20&offset=${righe.length}`, {
      cache: "no-store",
    });
    setCaricando(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non riusciamo a leggere lo storico."));
      return;
    }
    const { righe: nuove } = (await res.json()) as { righe: ServizioPassato[] };
    setRighe((prec) => [...prec, ...nuove]);
  }

  if (profilo.storicoTotale === 0) {
    return (
      <Gruppo titolo="Storico">
        <p className="t-nota">
          Nessun servizio ancora chiuso su questo tavolo. Comparirà qui appena se ne libera uno.
        </p>
      </Gruppo>
    );
  }

  return (
    <Gruppo
      titolo="Storico"
      contatore={`${profilo.storicoTotale} ${profilo.storicoTotale === 1 ? "servizio" : "servizi"}`}
      azione={
        !tutto ? (
          <button
            type="button"
            disabled={caricando}
            onClick={altri}
            className="inline-flex items-center gap-1 text-sm text-accent-strong underline-offset-4 hover:underline disabled:opacity-50"
          >
            {caricando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Vedi tutto
          </button>
        ) : undefined
      }
    >
      <ul className="space-y-3">
        {righe.map((s) => (
          <RigaServizio key={s.bookingId} servizio={s} profilo={profilo} />
        ))}
      </ul>

      {errore && (
        <p role="alert" className="mt-2 text-sm text-destructive-soft">
          {errore}
        </p>
      )}
    </Gruppo>
  );
}

function RigaServizio({
  servizio: s,
  profilo,
}: {
  servizio: ServizioPassato;
  profilo: ProfiloTavolo;
}) {
  const ora = (iso: string) => oraInVenue(iso, profilo.timezone);

  return (
    <li>
      {/* Livello 1 — data e totale: quello che si scorre con l'occhio. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium tabular-nums">
          {etichettaGiorno(s.giorno)}
          {s.servizio && (
            <span className="ml-1.5 font-normal text-muted-foreground">{s.servizio}</span>
          )}
        </span>
        {/* Un servizio senza conto battuto mostra un trattino: «0,00 €»
            sarebbe un numero al posto di un fatto. */}
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {s.totaleCents > 0 ? formatCurrency(s.totaleCents, profilo.currency) : "—"}
        </span>
      </div>

      {/* Livello 2 — quanti erano e quando. */}
      <p className="t-nota">
        {s.coperti} {s.coperti === 1 ? "ospite" : "ospiti"}
        {" · "}
        {ora(s.arrivo)}
        {s.liberato && `–${ora(s.liberato)}`}
        {s.durataMin != null && ` · ${durataUmana(s.durataMin)}`}
      </p>

      {/* Livello 3 — chi c'era. Il cliente è un collegamento quando il CRM lo
          conosce: da uno storico si risale a una persona, ed è metà del
          motivo per cui uno storico serve. */}
      <p className="t-nota">
        {s.ospite ? (
          s.ospite.guestId ? (
            <Link
              href={`/guests/${s.ospite.guestId}`}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {s.ospite.nome}
            </Link>
          ) : (
            s.ospite.nome
          )
        ) : (
          "cliente non registrato"
        )}
        {s.personale.length > 0 && ` · ${s.personale.join(", ")}`}
        {s.manceCents > 0 && ` · ${formatCurrency(s.manceCents, profilo.currency)} di mancia`}
      </p>
    </li>
  );
}
