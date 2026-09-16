"use client";

import { CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { oraInVenue } from "@/lib/venue-time";
import type { ProfiloTavolo } from "@/server/profilo-tavolo";
import { Gruppo } from "./sezione";

/** Come Stripe chiama i metodi, come li chiamiamo noi. */
const METODO: Record<string, string> = {
  card: "Carta",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  link: "Link",
};

/**
 * Il dettaglio del conto: **quello che il riquadro in alto non dice**.
 *
 * Il residuo — la cifra che fa alzare qualcuno dalla cassa — sta nel riquadro
 * dello stato, dove si legge insieme a chi c'è e da quanto. Qui c'è il resto:
 * quanto è stato consumato, cosa è già entrato, e chi ha pagato quanto. Sono
 * informazioni da **consultare**, non da intercettare, e hanno il peso che
 * meritano.
 *
 * ## Perché i pagamenti sono righe vere e non «quote»
 *
 * Un conto diviso in quattro non esiste nel database finché qualcuno non paga:
 * `Payment` è un **importo incassato**, non una persona con una quota
 * assegnata. Scrivere «Quota 2 · 30 € · da pagare» vorrebbe dire inventare tre
 * righe che nessuno ha creato, e farle sembrare impegni presi. Qui si elenca
 * quello che è successo davvero — chi ha pagato quanto, quando, come.
 */
export function ContoTavolo({ profilo }: { profilo: ProfiloTavolo }) {
  const { conto, currency, timezone } = profilo;
  if (!conto) return null;

  const euro = (c: number) => formatCurrency(c, currency);

  return (
    <Gruppo
      titolo="Conto"
      contatore={
        conto.righe === 0
          ? undefined
          : `${conto.righe} ${conto.righe === 1 ? "riga" : "righe"}`
      }
    >
      <div className="rounded-lg border border-border bg-card-sunken/60 p-3">
        {conto.righe === 0 ? (
          // Zero righe su un tavolo seduto non è «zero euro»: è un conto
          // aperto e ancora vuoto, e sono due cose diverse per chi deve
          // decidere se quel tavolo sta per liberarsi.
          <p className="text-sm text-muted-foreground">Aperto, ancora nulla battuto.</p>
        ) : (
          <dl className="space-y-1">
            <Voce etichetta="Totale" valore={euro(conto.totaleCents)} forte />
            {conto.scontiCents > 0 && (
              <Voce etichetta="Gift card e punti" valore={`− ${euro(conto.scontiCents)}`} />
            )}
            {conto.pagatoCents > 0 && <Voce etichetta="Già pagato" valore={euro(conto.pagatoCents)} />}
            {conto.inCorsoCents > 0 && (
              <Voce
                etichetta="In pagamento ora"
                valore={euro(conto.inCorsoCents)}
                className="text-accent-strong"
              />
            )}
            {conto.manceCents > 0 && <Voce etichetta="Mance" valore={euro(conto.manceCents)} />}
          </dl>
        )}

        {conto.quote.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
            {conto.quote.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 t-nota">
                  <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {q.stato === "PAGATA"
                      ? `${q.quando ? oraInVenue(q.quando, timezone) : ""} · ${METODO[q.metodo ?? ""] ?? "dal telefono"}`
                      : "sta pagando…"}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {euro(q.importoCents)}
                  {q.manciaCents > 0 && (
                    <span className="ml-1 t-nota">+{euro(q.manciaCents)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 t-nota">{conto.riferimento}</p>
      </div>
    </Gruppo>
  );
}

function Voce({
  etichetta,
  valore,
  forte = false,
  className,
}: {
  etichetta: string;
  valore: string;
  forte?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className ?? ""}`}>
      <dt className={forte ? "text-sm" : "t-nota"}>{etichetta}</dt>
      <dd className={forte ? "text-base font-medium tabular-nums" : "text-sm tabular-nums text-muted-foreground"}>
        {valore}
      </dd>
    </div>
  );
}
