"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FiltroCosti } from "@/lib/stati-costo";

/**
 * I filtri della tabella costi.
 *
 * Stanno nell'indirizzo e non in uno stato del componente: così una schermata
 * si può incollare in chat («guarda i critici di settembre») e chi la apre vede
 * la stessa cosa. È anche il motivo per cui l'impaginazione e l'ordinamento
 * vivono nel server: la pagina è una funzione dell'indirizzo, non di quello
 * che è successo nel browser.
 */

const VOCI: { chiave: FiltroCosti; testo: string }[] = [
  { chiave: "tutti", testo: "Tutti" },
  { chiave: "normali", testo: "Regolari" },
  { chiave: "attenzione", testo: "Attenzione" },
  { chiave: "critici", testo: "Critici" },
  { chiave: "bloccati", testo: "Bloccati" },
  { chiave: "previsione", testo: "Previsione oltre budget" },
  { chiave: "override", testo: "Override attivi" },
];

export function FiltriCosti({
  filtro,
  ricerca,
  cicli,
  cicloAttivo,
  piani,
  pianoAttivo,
}: {
  filtro: FiltroCosti;
  ricerca: string;
  cicli: { valore: string; testo: string }[];
  cicloAttivo: string;
  /** I piani che esistono davvero, letti dal database: nessun nome nel codice. */
  piani: { slug: string; nome: string }[];
  pianoAttivo: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [testo, setTesto] = useState(ricerca);
  const [inCorso, avvia] = useTransition();

  function vaiA(modifiche: Record<string, string | null>) {
    const nuovi = new URLSearchParams(params.toString());
    for (const [chiave, valore] of Object.entries(modifiche)) {
      if (valore === null || valore === "") nuovi.delete(chiave);
      else nuovi.set(chiave, valore);
    }
    // Cambiare filtro riporta alla prima pagina: restare alla settima di un
    // elenco che ora ne ha due è il modo più veloce di vedere una tabella vuota
    // e crederla un guasto.
    nuovi.delete("pagina");
    avvia(() => router.push(`/admin/costi?${nuovi.toString()}`));
  }

  return (
    <div className={cn("space-y-3", inCorso && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        {VOCI.map((v) => (
          <button
            key={v.chiave}
            type="button"
            onClick={() => vaiA({ filtro: v.chiave === "tutti" ? null : v.chiave })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition-colors",
              filtro === v.chiave
                ? "border-accent bg-pill-selected text-ink"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {v.testo}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && vaiA({ q: testo })}
          onBlur={() => testo !== ricerca && vaiA({ q: testo })}
          placeholder="Cerca un cliente"
          className="h-9 w-56"
        />
        <select
          value={pianoAttivo}
          onChange={(e) => vaiA({ piano: e.target.value || null })}
          className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          aria-label="Piano"
        >
          <option value="">Tutti i piani</option>
          {piani.map((p) => (
            <option key={p.slug} value={p.slug}>{p.nome}</option>
          ))}
        </select>
        <select
          value={cicloAttivo}
          onChange={(e) => vaiA({ ciclo: e.target.value })}
          className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
          aria-label="Periodo"
        >
          {cicli.map((c) => (
            <option key={c.valore} value={c.valore}>{c.testo}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
