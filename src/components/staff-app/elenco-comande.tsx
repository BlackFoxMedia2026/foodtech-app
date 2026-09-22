"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { euro } from "@/lib/euro";
import { chiedi } from "@/lib/staff-fetch";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { useAvvisi } from "@/components/ui/avvisi";
import type { ComandaInElenco } from "@/server/comande/comande";
import type { PermessoStaff } from "@/lib/permessi-staff";

/**
 * **La schermata Comande** — §29.
 *
 * Linguette per stato, e i piatti pronti hanno priorità visiva. Le linguette
 * sono cinque e stanno su una riga a 375 px perché le etichette sono corte;
 * ognuna porta il suo conteggio, che è l'informazione che si cerca guardandole
 * («ce ne sono?») prima ancora di sceglierne una.
 *
 * ## «Pronte» è la prima, non «Tutte»
 *
 * Il brief elenca «Tutte» per prima. Qui la linguetta aperta all'arrivo è
 * **Pronte** quando ce n'è almeno una, e questo è l'unico punto in cui mi
 * sono scostato: chi apre questa schermata durante il servizio la apre per
 * sapere cosa portare in sala, e farglielo trovare dietro un tap in più
 * sarebbe il passaggio inutile del §36. Senza niente di pronto si apre su
 * «Tutte», che è quello che dice il brief.
 */

type Linguetta = "tutte" | "in_cucina" | "in_preparazione" | "pronte" | "servite";

const LINGUETTE: { chiave: Linguetta; etichetta: string; stati: string[] }[] = [
  { chiave: "tutte", etichetta: "Tutte", stati: [] },
  { chiave: "in_cucina", etichetta: "In cucina", stati: ["INVIATA", "RICEVUTA"] },
  { chiave: "in_preparazione", etichetta: "In prep.", stati: ["IN_PREPARAZIONE"] },
  { chiave: "pronte", etichetta: "Pronte", stati: ["PRONTA"] },
  { chiave: "servite", etichetta: "Servite", stati: ["SERVITA"] },
];

export function ElencoComande({
  iniziali,
  permessi,
}: {
  iniziali: ComandaInElenco[];
  permessi: PermessoStaff[];
}) {
  const avvisi = useAvvisi();
  const [comande, setComande] = useState(iniziali);
  const [attiva, setAttiva] = useState<Linguetta>(
    iniziali.some((c) => c.status === "PRONTA") ? "pronte" : "tutte",
  );
  const [inCorso, setInCorso] = useState<string | null>(null);
  const fila = useRef<HTMLDivElement>(null);

  /*
    La linguetta attiva si porta sotto gli occhi.

    Le cinque linguette non stanno in 375 px, e la riga scorre. All'apertura
    quella selezionata è «Pronte», che è la quarta: restava tagliata sul bordo
    destro, cioè la schermata si apriva mostrando una scelta fatta che non si
    leggeva. Tre righe qui valgono più di etichette accorciate fino a
    diventare sigle.
  */
  useEffect(() => {
    const el = fila.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [attiva]);

  const scarica = useCallback(async () => {
    try {
      const d = await chiedi<{ comande: ComandaInElenco[] }>("/api/staff-app/comande");
      setComande(d.comande);
    } catch {
      /* La fotografia resta: vedi `lista-tavoli.tsx`. */
    }
  }, []);

  useServizioVivo(scarica);

  const conteggi = useMemo(() => {
    const m = new Map<Linguetta, number>();
    for (const l of LINGUETTE) {
      m.set(l.chiave, l.stati.length === 0 ? comande.length : comande.filter((c) => l.stati.includes(c.status)).length);
    }
    return m;
  }, [comande]);

  const visibili = useMemo(() => {
    const l = LINGUETTE.find((x) => x.chiave === attiva)!;
    const filtrate = l.stati.length === 0 ? comande : comande.filter((c) => l.stati.includes(c.status));
    /* Le pronte in cima anche dentro «Tutte»: la priorità visiva del §29 non
       è solo il colore, è la posizione. */
    return [...filtrate].sort((a, b) => {
      const pa = a.status === "PRONTA" ? 0 : 1;
      const pb = b.status === "PRONTA" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt);
    });
  }, [comande, attiva]);

  async function segnaServiti(c: ComandaInElenco) {
    setInCorso(c.id);
    try {
      await chiedi(`/api/staff-app/comande/${c.id}/servite`, { metodo: "POST", corpo: { righe: [] } });
      await scarica();
      avvisi.mostra(`Tavolo ${c.tavolo ?? "—"} · segnati come serviti`);
    } catch (e) {
      avvisi.problema(e instanceof Error ? e.message : "Non è stato possibile aggiornare.");
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="schermo">
      <div
        ref={fila}
        role="tablist"
        aria-label="Stato delle comande"
        className="fissa flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {LINGUETTE.map((l) => {
          const n = conteggi.get(l.chiave) ?? 0;
          return (
            <button
              key={l.chiave}
              role="tab"
              type="button"
              aria-selected={attiva === l.chiave}
              onClick={() => setAttiva(l.chiave)}
              className={cn(
                "min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm transition-colors",
                attiva === l.chiave
                  ? "border-cream bg-cream font-medium text-clay-ink"
                  : "border-border text-muted-foreground",
              )}
            >
              {l.etichetta}
              {n > 0 && <span className="ml-1.5 tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="fill-scroll px-4 pb-4">
        {visibili.length === 0 ? (
          <div className="riquadro tratteggiato comodo">
            <p className="t-titolo-scheda">Nessuna comanda</p>
            <p className="t-nota mt-1">
              {attiva === "tutte"
                ? "Non c'è niente in cucina in questo momento."
                : "Niente in questo stato adesso."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {visibili.map((c) => (
              <li key={c.id}>
                <CardComandaElenco
                  comanda={c}
                  inCorso={inCorso === c.id}
                  puoServire={permessi.includes("edit_orders")}
                  onServiti={() => segnaServiti(c)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const ETICHETTA: Record<string, string> = {
  INVIATA: "In cucina",
  RICEVUTA: "Ricevuta",
  IN_PREPARAZIONE: "In preparazione",
  PRONTA: "Pronta",
  SERVITA: "Servita",
  ANNULLATA: "Annullata",
};

function CardComandaElenco({
  comanda,
  inCorso,
  puoServire,
  onServiti,
}: {
  comanda: ComandaInElenco;
  inCorso: boolean;
  puoServire: boolean;
  onServiti: () => void;
}) {
  const pronta = comanda.status === "PRONTA";

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        pronta ? "border-accent/70 bg-accent/10" : "border-border bg-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg leading-none">
            {comanda.tavolo ? `Tavolo ${comanda.tavolo}` : "Senza tavolo"}
          </p>
          <p className="t-nota mt-1 tabular-nums">
            {ora(comanda.sentAt ?? comanda.createdAt)} · {comanda.articoli}{" "}
            {comanda.articoli === 1 ? "articolo" : "articoli"} · {euro(comanda.totalCents)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-xs font-medium",
            pronta ? "text-accent-strong" : "text-muted-foreground",
          )}
        >
          {ETICHETTA[comanda.status] ?? comanda.status}
        </span>
      </div>

      {pronta && (
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-accent-strong">
          <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
          {comanda.righe
            .filter((r) => r.status === "PRONTA")
            .map((r) => (r.quantita > 1 ? `${r.quantita} × ${r.nome}` : r.nome))
            .join(", ")}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {comanda.tableId && (
          <Link
            href={`/staff-app/tavolo/${comanda.tableId}`}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-border text-sm font-medium"
          >
            Apri il tavolo
          </Link>
        )}
        {pronta && puoServire && (
          <button
            type="button"
            disabled={inCorso}
            onClick={onServiti}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-cream text-sm font-medium text-clay-ink disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Serviti
          </button>
        )}
      </div>
    </div>
  );
}

function ora(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso),
  );
}
