"use client";

import { Archive, Copy, MoreHorizontal, Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accorda } from "@/lib/accordo";
import { categoriaDi, condizioniDi, statoDi } from "@/lib/coupon-vista";
import { cn } from "@/lib/utils";
import type { CouponView } from "@/server/coupons";

/**
 * Un coupon, in una scheda.
 *
 * La riga di prima diceva undici cose con lo stesso peso — nome, tipo,
 * descrizione, valore, codice, copia, usi, disponibilità, stato, pausa,
 * archivia — e dove tutto pesa uguale non c'è niente da cui iniziare a
 * leggere. Undici schede così sono un muro.
 *
 * Qui l'ordine è dichiarato, e da sinistra a destra è anche l'ordine in cui
 * un ristoratore fa le domande:
 *
 * 1. **quale coupon è** — il nome, l'unica cosa in corpo pieno;
 * 2. **cosa dà** — il beneficio, l'unica cosa colorata della scheda;
 * 3. **quanto sta girando** — il numero degli utilizzi, con la barra solo
 *    dove c'è un tetto da consumare;
 * 4. **come si detta** — il codice, sotto la sua etichetta, deliberatamente
 *    più piccolo del nome: è un dato da copiare, non da riconoscere;
 * 5. **vale adesso?** — la pillola;
 * 6. **cosa ci faccio** — «Gestisci», e tutto il resto dentro il menu.
 *
 * Le condizioni scendono in seconda riga, grigie, sotto il nome: sono il
 * motivo per cui un coupon **non** vale oggi, quindi non possono sparire, ma
 * non sono quello che si cerca arrivando qui. La descrizione libera esce
 * proprio dalla scheda — vedi `condizioniDi`.
 *
 * Da `lg` in giù la stessa scheda si impila: nome e stato, beneficio,
 * utilizzi e codice appaiati, condizioni, comandi. Nessuna colonna da far
 * scorrere di lato.
 */
export function CouponCard({
  c,
  canEdit,
  adesso,
  inCorso,
  onApri,
  onCambiaStato,
  onDuplica,
}: {
  c: CouponView;
  canEdit: boolean;
  /**
   * L'orologio arriva dall'elenco, uno solo per tutte le schede.
   *
   * Con un `new Date()` per scheda, undici coupon con scadenza a mezzanotte
   * potrebbero raccontare due giorni diversi nella stessa schermata.
   */
  adesso: Date;
  inCorso: boolean;
  onApri: () => void;
  onCambiaStato: (status: "ACTIVE" | "PAUSED" | "ARCHIVED") => void;
  onDuplica: () => void;
}) {
  const stato = statoDi(c);
  const condizioni = condizioniDi(c, adesso);
  const categoria = categoriaDi(c);
  const conTetto = c.restanti != null && c.maxRedemptions != null;
  const quota = conTetto ? Math.min(100, Math.round((c.usi / c.maxRedemptions!) * 100)) : 0;

  return (
    <li
      className={cn(
        "surface grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 p-4 transition-colors",
        // L'hover è un grado di bordo e basta: DESIGN.md riserva il bagliore
        // alla navigazione, e undici schede che si accendono passandoci sopra
        // sarebbero la cosa più vistosa della pagina.
        "hover:border-border-strong",
        /*
          Sei colonne, due righe, e da `lg` — non da `md`.

          Con colonne libere «15% di sconto» cadeva a un'ascissa diversa su
          ogni scheda, e undici schede disallineate si leggono una per una
          invece di per colonna, che è tutto il motivo per cui si mette una
          griglia. La seconda riga esiste solo per le condizioni: tutto il
          resto la scavalca (`row-span-2`) e si centra sull'altezza intera.

          **Sotto i 1024 px la scheda si impila**, e la soglia è misurata: a
          768 px sei colonne lasciavano 178 px al nome, cioè «Dolce di
          compleanno» su due righe con la pillola della tipologia a capo e le
          condizioni incolonnate una per riga — schede da 180 px per dire
          quello che a 1440 sta in 84. Una griglia che non ha la larghezza per
          le sue colonne non è più una griglia: è un elenco storto.

          Le due colonne elastiche restano elastiche (`1.6fr` e `1fr`): a 1024
          il nome prende quello che avanza dopo le tre fisse, a 1600 il
          beneficio smette di andare a capo invece di lasciare un buco.
        */
        "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_7rem_11rem_auto_auto] xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_11rem_auto_auto] lg:gap-x-4 lg:gap-y-1 lg:px-5 lg:py-3.5 xl:gap-x-5",
        // Ciò che adesso non si può usare — e non per l'ora del giorno —
        // scende di un gradino, come le righe non assegnabili in Staff.
        stato.spento && "opacity-[0.62] hover:opacity-100",
      )}
    >
      {/* ── 1. Quale coupon è ──────────────────────────────────────────── */}
      <div className="col-start-1 row-start-1 min-w-0 lg:row-start-1 lg:self-end">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {/*
            Il nome apre la scheda. È il bersaglio che si tenta per primo —
            prima ancora di cercare un pulsante — e fino a ieri non era
            cliccabile perché non c'era niente da aprire.
          */}
          <button
            type="button"
            onClick={onApri}
            className="min-w-0 max-w-full rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* Il nome va a capo e non si taglia: è l'identità della riga. */}
            <span className="text-base font-semibold leading-snug text-card-foreground lg:text-[1.0625rem]">
              {c.name}
            </span>
          </button>
          <Badge tone="gold" className="shrink-0 uppercase tracking-wider">
            {categoria}
          </Badge>
        </div>
      </div>

      {/* ── Le condizioni, seconda riga ────────────────────────────────── */}
      {condizioni.length > 0 && (
        /*
          Testo che va a capo, non caselle affiancate.

          Con `flex flex-wrap` e un puntino come elemento a sé, andando a capo
          il puntino finisce **in testa** alla riga nuova: «Ilaria Bosisio / ·
          1 per cliente / · fino all'8 ottobre» sembrava un elenco puntato
          storto. Qui il separatore sta attaccato alla parola che lo precede
          con uno spazio unificatore, quindi il capo va dove andrebbe in una
          frase: dopo il puntino, mai prima.
        */
        <p className="col-span-2 col-start-1 row-start-4 text-xs leading-relaxed text-tertiary-foreground lg:col-span-1 lg:row-start-2 lg:self-start">
          {condizioni.map((x, i) => (
            <span key={x.testo} className={cn(x.avviso && "font-medium text-accent-strong")}>
              {i > 0 && " · "}
              {x.testo}
            </span>
          ))}
        </p>
      )}

      {/* ── 2. Cosa dà ─────────────────────────────────────────────────── */}
      {/* L'unica cosa colorata della scheda, ed è di proposito: fra undici
          coupon, quello che si cerca è «chi fa il 20%». */}
      {/* Cresce a 16 px solo da `xl`: a 1024 la colonna è 153 px e «Un dolce a
          scelta in omaggio» ci andava su tre righe, allungando la scheda di
          quaranta pixel per due parole. */}
      <p className="col-span-2 col-start-1 row-start-2 text-[0.9375rem] font-semibold leading-snug text-accent-strong lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center xl:text-base">
        {c.descrizione}
      </p>

      {/*
        Utilizzi e codice: appaiati sul telefono, due colonne sulla scrivania.

        `lg:contents` scioglie questo contenitore da `lg` in su, così i due
        blocchi diventano celle della griglia della scheda invece di restare
        impacchettati in una cella sola — e si incolonnano con quelli delle
        altre schede.
      */}
      <div className="col-span-2 col-start-1 row-start-3 flex items-start justify-between gap-4 lg:contents">
        {/* ── 3. Quanto sta girando ───────────────────────────────────── */}
        <div className="min-w-0 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-center">
          <p className="leading-none">
            <span className="text-lg font-semibold tabular-nums text-card-foreground">{c.usi}</span>{" "}
            <span className="text-xs text-muted-foreground">
              {conTetto ? `di ${c.maxRedemptions}` : accorda(["utilizzo", "utilizzi"], c.usi)}
            </span>
          </p>
          {conTetto ? (
            <>
              {/* La barra è muta: il rapporto è già scritto sopra in cifre, e
                  ripeterlo a un lettore di schermo sarebbe rumore. */}
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-cream/10" aria-hidden="true">
                <div
                  className={cn("h-full rounded-full", quota >= 100 ? "bg-accent" : "bg-sage")}
                  style={{ width: `${quota}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 t-nota">senza tetto</p>
          )}
        </div>

        {/* ── 4. Come si detta ────────────────────────────────────────── */}
        <div className="min-w-0 lg:col-start-4 lg:row-span-2 lg:row-start-1 lg:self-center">
          <p className="t-etichetta leading-none">Codice</p>
          <span className="mt-1.5 flex items-center gap-0.5">
            <code className="min-w-0 break-all rounded-md bg-cream/10 px-2 py-1 font-mono text-xs tracking-wider text-card-foreground">
              {c.code}
            </code>
            <CopyButton
              value={c.code}
              soloIcona
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground"
              aria-label={`Copia il codice ${c.code}`}
            />
          </span>
        </div>
      </div>

      {/* ── 5. Vale adesso? ────────────────────────────────────────────── */}
      <div className="col-start-2 row-start-1 justify-self-end lg:col-start-5 lg:row-span-2 lg:row-start-1 lg:self-center">
        <Badge tone={stato.tono} className="gap-1.5 whitespace-nowrap">
          <i
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              stato.concluso ? "shadow-[inset_0_0_0_1.5px_currentColor]" : "bg-current",
            )}
            aria-hidden="true"
          />
          {stato.testo}
        </Badge>
      </div>

      {/* ── 6. Cosa ci faccio ──────────────────────────────────────────── */}
      <div className="col-span-2 col-start-1 row-start-5 flex items-center gap-2 lg:col-span-1 lg:col-start-6 lg:row-span-2 lg:row-start-1 lg:justify-end lg:self-center">
        <Button variant="outline" size="sm" className="flex-1 lg:flex-none" onClick={onApri}>
          Gestisci
        </Button>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/*
                Pausa e Archivia erano due pulsanti con la stessa evidenza del
                resto della riga: ventidue comandi amministrativi su undici
                coupon, tutti sempre accesi. Archiviare in particolare è
                l'unica azione che toglie un coupon dalla vista, e non deve
                essere il bersaglio più grosso a portata di pollice.
              */}
              <Button
                variant="ghost"
                size="icon"
                disabled={inCorso}
                aria-label={`Altre azioni per ${c.name}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {c.status === "ACTIVE" && (
                <DropdownMenuItem onSelect={() => onCambiaStato("PAUSED")}>
                  <Pause className="h-4 w-4" aria-hidden="true" /> Metti in pausa
                </DropdownMenuItem>
              )}
              {c.status !== "ACTIVE" && (
                <DropdownMenuItem onSelect={() => onCambiaStato("ACTIVE")}>
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {c.status === "ARCHIVED" ? "Ripristina" : "Riattiva"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={onDuplica}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Duplica
              </DropdownMenuItem>
              {c.status !== "ARCHIVED" && (
                <DropdownMenuItem onSelect={() => onCambiaStato("ARCHIVED")}>
                  <Archive className="h-4 w-4" aria-hidden="true" /> Archivia…
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}
