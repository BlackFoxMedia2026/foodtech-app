"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";

/**
 * Assegnare a un locale il numero a cui farà deviare le telefonate.
 *
 * ## Perché questo campo è qui e non nel gestionale del cliente
 *
 * Perché il numero **non è suo**: è nostro, e sta nel centralino insieme al
 * trunk che lo consegna. Il ristoratore lo legge nella sua procedura di
 * collegamento e lo detta al proprio operatore telefonico — quindi è un dato
 * che decide chi gestisce la piattaforma, non chi gestisce il ristorante.
 *
 * ## Quello che si può sbagliare qui
 *
 * Un numero assegnato al cliente sbagliato manda le telefonate di un
 * ristorante nel gestionale di un altro. Per questo il pulsante non c'è quando
 * il centralino non si è ancora presentato per quel locale: l'assegnazione si
 * fa per identificativo, non per somiglianza del nome.
 */
export function LineeLocale({
  venueId,
  linee,
  tenantCentralino,
  collegato,
}: {
  venueId: string;
  linee: { numero: string; etichetta: string | null }[];
  tenantCentralino: string | null;
  /** Il collegamento al centralino è configurato su questa installazione? */
  collegato: boolean;
}) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function assegna(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/admin/servizi/${venueId}/linee`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ numero: numero.trim() }),
    });
    setInCorso(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti ad assegnare il numero."));
      return;
    }
    setNumero("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {linee.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {linee.map((l) => (
            <li
              key={l.numero}
              className="rounded-full border border-border px-2.5 py-1 font-mono text-xs"
            >
              {l.numero}
              {l.etichetta && <span className="ml-1.5 font-sans text-muted-foreground">{l.etichetta}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-nota">
          Nessuna linea. Finché non gliene assegni una, nella sua procedura di collegamento non
          compare nessun numero da dettare all&apos;operatore.
        </p>
      )}

      {/* Quello che non si può fare si dice a parole, non con un pulsante che
          fallisce: sono due impedimenti diversi e portano a due gesti diversi. */}
      {!collegato ? (
        <p className="t-nota">
          Il collegamento al centralino non è configurato su questa installazione: il numero va
          assegnato dal centralino.
        </p>
      ) : !tenantCentralino ? (
        <p className="t-nota">
          Il centralino non si è ancora presentato per questo locale. Salva il collegamento del
          gestionale dal centralino: da lì ci dice chi è, e poi il numero si assegna da qui.
        </p>
      ) : (
        <form onSubmit={assegna} className="flex flex-wrap items-center gap-2">
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Il numero da assegnargli"
            inputMode="tel"
            className="max-w-[14rem]"
          />
          <Button type="submit" variant="outline" size="sm" disabled={inCorso || !numero.trim()}>
            {inCorso ? "Assegno…" : "Assegna la linea"}
          </Button>
        </form>
      )}

      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
    </div>
  );
}
