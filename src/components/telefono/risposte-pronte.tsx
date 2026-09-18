"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { RispostaPronta } from "@/server/voice/conoscenza";

/**
 * «Si può portare il cane?» — la risposta, mentre la persona è al telefono.
 *
 * ## Perché sta qui e non in una pagina di aiuto
 *
 * Perché il momento in cui serve è **questo**: qualcuno sta aspettando in
 * linea. Una risposta che sta in una pagina da cercare è una risposta che chi
 * risponde inventa, o va a chiedere in cucina mettendo il cliente in attesa.
 *
 * ## Cerca in locale, non sul server
 *
 * Le risposte di un ristorante sono dieci o venti frasi corte: arrivano tutte
 * insieme con la pagina, e la ricerca è un filtro su quelle. Una richiesta al
 * server a ogni lettera, mentre si parla al telefono, aggiungerebbe un'attesa
 * a un momento che non ne ha.
 *
 * ## Quando non trova niente lo dice
 *
 * «Questo non è scritto» e non un elenco vuoto: chi sta al telefono deve
 * sapere in mezzo secondo se deve dire «glielo faccio verificare». Un vuoto
 * senza spiegazione lo si legge come un guasto e si riprova a cercare.
 */

const NOME_CATEGORIA: Record<string, string> = {
  ORARI: "Orari",
  LOCALE: "Il locale",
  MENU: "Carta",
  ALLERGIE: "Allergie",
  PARCHEGGIO: "Parcheggio",
  ANIMALI: "Animali",
  BAMBINI: "Bambini",
  ACCESSIBILITA: "Accessibilità",
  GRUPPI: "Gruppi",
  EVENTI: "Eventi",
  PAGAMENTI: "Pagamenti",
  ALTRO: "Altro",
};

const DIACRITICI = /[̀-ͯ]/g;

function normalizza(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(DIACRITICI, "");
}

export function RispostePronte({ risposte }: { risposte: RispostaPronta[] }) {
  const [cerca, setCerca] = useState("");

  const attive = useMemo(() => risposte.filter((r) => r.attivo), [risposte]);

  const trovate = useMemo(() => {
    const q = normalizza(cerca).trim();
    if (!q) return [];
    return attive
      .filter((r) => {
        const dentro =
          r.argomenti.some((a) => normalizza(a).includes(q)) ||
          normalizza(r.risposta).includes(q) ||
          normalizza(NOME_CATEGORIA[r.categoria] ?? "").includes(q);
        return dentro;
      })
      .slice(0, 6);
  }, [attive, cerca]);

  /* Senza risposte scritte il riquadro non c'è: un campo di ricerca che non
     può trovare niente è un posto in più dove provare. Dove si scrivono lo
     dice Impostazioni → Telefono, che è dove si va a guardare. */
  if (attive.length === 0) return null;

  return (
    <section
      aria-label="Cosa rispondere"
      className="fissa riquadro space-y-2 p-3"
    >
      <label
        htmlFor="cerca-risposta"
        className="flex items-center gap-2 t-etichetta"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        Cosa rispondere
      </label>
      <Input
        id="cerca-risposta"
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        placeholder="cane, parcheggio, glutine…"
        className="h-8 text-xs"
        autoComplete="off"
      />

      {cerca.trim().length > 0 &&
        (trovate.length === 0 ? (
          <p className="t-nota">
            Questo non è scritto: al cliente si può dire «glielo faccio
            verificare».
          </p>
        ) : (
          <ul className="space-y-2">
            {trovate.map((r) => (
              <li key={r.id}>
                <p className="t-etichetta">
                  {NOME_CATEGORIA[r.categoria] ?? r.categoria}
                </p>
                {/* La risposta come l'ha scritta il locale, per intero: è una
                    frase da leggere a voce, e tagliarla a metà con i puntini
                    la rende inutile proprio nel momento in cui serve. */}
                <p className="text-sm">{r.risposta}</p>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
