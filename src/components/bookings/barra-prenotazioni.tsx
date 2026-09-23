"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarRange, Check, ChevronDown, List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/*
  ────────────────────────────────────────────────────────────────────────────
  Le misure della barra, scritte una volta sola.

  Il difetto che questa barra aveva non era il disordine: era che **tutto
  pesava uguale**. Data, servizio, filtri, vista e «Nuova prenotazione»
  avevano lo stesso fondo, lo stesso bordo e lo stesso peso di testo, quindi
  l'occhio non aveva un punto da cui iniziare. Sette controlli tutti
  importanti sono sette controlli nessuno dei quali è importante.

  La gerarchia, dal più al meno evidente:

  1. **La chiamata** — «Nuova prenotazione», pillola crema. È l'unica cosa qui
     dentro che *scrive* qualcosa, ed è l'unica che può essere la più chiara
     della barra (DESIGN.md, «La Regola della Chiamata Crema»).
  2. **La vista scelta** — «Elenco», contorno oro e testo oro: dice *dove sei*,
     che è il lavoro del terracotta.
  3. **I comandi secondari** — data, servizio, filtri: stesso fondo verde,
     stesso bordo sottile, nessuno prevale sugli altri.
  4. **«Oggi»** — il più tenue di tutti: è una scorciatoia, non una decisione.

  E tre misure, non sette: l'altezza, il raggio e il passo sono gli stessi per
  ogni controllo, così la differenza che resta è **solo** quella di gerarchia.
  ────────────────────────────────────────────────────────────────────────────
*/

/**
 * L'altezza di ogni controllo della barra.
 *
 * Cresce a scaglioni invece di restare fissa: 52 px sono giusti su uno schermo
 * largo e non ci starebbero su un portatile da tredici pollici, dove la barra
 * andrebbe a capo. Sotto 1440 px si scende a 48, sotto 1024 a 44 — e si
 * stringono **prima i passi e i fianchi**, poi l'altezza. Il testo non scende
 * mai sotto i 15 px: una barra minuscola pur di farla entrare non è una barra
 * che si usa.
 */
export const ALTEZZA = "h-11 lg:h-12 min-[1440px]:h-[52px]";
/*
  Tre soglie, e tutte e tre muovono lo **spazio** prima della dimensione.

  A 1500 px arrivano i passi generosi fra i gruppi — 20 px invece di 12 — ed è
  la misura che la barra vorrebbe avere sempre. A 1440 crescono **altezza e
  corpo del testo**: i passi restano stretti perché a 1440 esatti la riga più
  lunga possibile — «Mercoledì 23 settembre», la parola più lunga della
  settimana — sforava di nove pixel e la barra andava a capo.

  A 1280, la terza: sotto quella soglia si stringono di due pixel per lato i
  fianchi di ogni comando e di quattro i passi fra i gruppi. Una quarantina di
  pixel in tutto, che non si vedono a occhio ma spostano da ~1150 a ~1100 il
  punto in cui la barra va a capo. È l'ordine che questa barra segue ovunque:
  prima i passi, poi i fianchi, poi l'altezza, e il corpo del testo mai —
  stringere l'aria non si vede, un testo da dodici punti sì.
*/
const TESTO = "text-[0.9375rem] min-[1440px]:text-base";

/** Il fondo comune dei comandi secondari: verde di scheda, bordo sottile. */
const SECONDARIO =
  "rounded-full border border-border/70 bg-card/70 text-foreground transition-colors hover:bg-veil-6 hover:border-border-strong/70";
const FUOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * La barra dei comandi: **un oggetto solo**, non sette appoggiati in fila.
 *
 * Il pannello di vetro è quello che li tiene insieme. Senza, sette pillole
 * sospese sul fondo della pagina si leggono come sette oggetti indipendenti —
 * ed è esattamente così che la barra era arrivata a sembrare confusa.
 *
 * Dentro, tre macro-gruppi separati da più spazio di quanto ne corra
 * all'interno di ognuno: **quando guardi** (data e Oggi), **cosa guardi**
 * (servizio e filtri), **come lo guardi e cosa crei** (vista e chiamata).
 * Il passo interno è 10-12 px, quello fra i gruppi 32-40 — è la distanza a
 * dire che sono tre cose diverse, prima ancora del divisore.
 */
export function BarraPrenotazioni({
  giorno,
  servizio,
  filtro,
  vista,
  azione,
}: {
  /** Gruppo A: la navigazione del giorno, «Oggi» compreso. */
  giorno: ReactNode;
  servizio: ReactNode;
  filtro: ReactNode;
  vista: ReactNode;
  azione: ReactNode;
}) {
  return (
    <div
      className={cn(
        // `vetro` è il vetro del prodotto, scritto una volta in globals.css:
        // una velatura bianca al 5%, un filo di luce in alto e un bordo
        // interno in gradiente. Nessun alone colorato: il bagliore resta alla
        // navigazione, qui serve una superficie **solida**.
        "vetro fissa flex flex-wrap items-center rounded-[28px] bg-card/35 p-1.5 shadow-[0_18px_40px_-32px_rgba(0,0,0,0.55)]",
        // I passi si stringono **prima** dell'altezza e molto prima del testo:
        // è l'ordine che tiene la barra su una riga sola fino a 1280 px senza
        // farla diventare minuscola.
        "gap-x-2 gap-y-2 min-[1280px]:gap-x-3 min-[1500px]:gap-x-5 min-[1500px]:p-2",
      )}
    >
      {giorno}

      {/* Il divisore fa il lavoro che lo spazio da solo non riesce a fare su
          uno schermo stretto: dice dove finisce «quando» e comincia «cosa».
          Sparisce quando la barra va a capo, dove non separerebbe più niente. */}
      <span className="hidden h-6 w-px shrink-0 bg-border/70 lg:block" aria-hidden="true" />

      <div className="flex shrink-0 items-center gap-2 min-[1500px]:gap-3">
        {servizio}
        {filtro}
      </div>

      {/*
        Su telefono la vista e la chiamata non stanno in 358 px: il gruppo va a
        capo al suo interno invece di far sporgere la pillola crema oltre il
        bordo del pannello. `justify-end` tiene la chiamata allineata a destra
        in entrambi i casi.
      */}
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 min-[1500px]:gap-3">
        {vista}
        {azione}
      </div>
    </div>
  );
}

/**
 * «Oggi»: il controllo più tenue della barra.
 *
 * Stava **dentro** la capsula della data, dopo un divisore, e sembrava la
 * terza freccia di quel gruppo. Non lo è: la data si naviga avanti e indietro,
 * «Oggi» è una scorciatoia che si usa una volta ogni tanto. Fuori dalla
 * capsula, in tono minore, si legge per quello che è.
 *
 * Quando il giorno mostrato **è** oggi il pulsante prende una velatura calda:
 * è anche l'unica cosa nella barra che lo dica, perché «Lunedì 14 settembre»
 * da solo non distingue oggi da un lunedì qualunque.
 */
export function BottoneOggi({ attivo, onClick }: { attivo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={attivo ? "date" : undefined}
      title={attivo ? "Stai guardando oggi" : "Torna a oggi"}
      className={cn(
        ALTEZZA,
        TESTO,
        FUOCO,
        "shrink-0 rounded-full border px-2.5 font-medium transition-colors min-[1280px]:px-3 min-[1500px]:px-4",
        attivo
          ? "border-accent/40 bg-accent/10 text-foreground"
          : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-veil-6 hover:text-foreground",
      )}
    >
      Oggi
    </button>
  );
}

/* ─────────────────────────── vista ─────────────────────────── */

type Vista = "elenco" | "mappa" | "settimana";

const VISTE: { chiave: Vista; label: string; icona: typeof List }[] = [
  { chiave: "elenco", label: "Elenco", icona: List },
  { chiave: "mappa", label: "Mappa", icona: MapIcon },
  { chiave: "settimana", label: "Settimana", icona: CalendarRange },
];

/**
 * Elenco · Mappa · Settimana come **un** controllo.
 *
 * Il solco — un contorno solo attorno a tutti e tre — è ciò che dice «queste
 * sono alternative, e una è già scelta». Tre pillole affiancate direbbero «tre
 * cose che puoi fare», che è un'altra frase.
 *
 * Lo stato scelto porta il contorno oro, una velatura calda e il testo in oro:
 * il terracotta del tema segnala *dove sei*, e una vista è esattamente quello.
 * Era una pillola **crema piena**, cioè la cosa più chiara della schermata per
 * un controllo che non è la cosa più importante della schermata — e il crema,
 * qui, è già preso dalla chiamata all'azione.
 *
 * La differenza non è solo di colore: lo scelto ha anche un contorno che gli
 * altri non hanno e un peso di testo più alto, così si riconosce anche da chi
 * il colore non lo distingue.
 */
export function SelettoreVista({ vista, onVista }: { vista: Vista; onVista: (v: Vista) => void }) {
  return (
    <div
      role="group"
      aria-label="Come guardare la giornata"
      className={cn(
        ALTEZZA,
        "flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-card/50 p-1",
      )}
    >
      {VISTE.map((v) => {
        const Icona = v.icona;
        const attiva = vista === v.chiave;
        return (
          <button
            key={v.chiave}
            type="button"
            onClick={() => onVista(v.chiave)}
            aria-pressed={attiva}
            className={cn(
              TESTO,
              FUOCO,
              "flex h-full items-center gap-1.5 rounded-full border px-2 transition-colors min-[1280px]:px-2.5 min-[1440px]:px-3.5 min-[1500px]:gap-2 min-[1500px]:px-4",
              attiva
                ? "border-accent-strong/55 bg-accent/15 font-semibold text-accent-strong"
                : "border-transparent font-medium text-muted-foreground hover:bg-veil-6 hover:text-foreground",
            )}
          >
            <Icona className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            {/* Sotto `sm` restano le sole icone: tre parole non ci stanno, e
                il nome lo dice comunque l'etichetta accessibile. */}
            <span className="hidden sm:inline">{v.label}</span>
            <span className="sr-only sm:hidden">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── filtri ─────────────────────────── */

export type StatoFiltro = "all" | "pending" | "confirmed";

const VOCI: { chiave: StatoFiltro; label: string }[] = [
  { chiave: "all", label: "Tutte" },
  { chiave: "confirmed", label: "Confermate" },
  { chiave: "pending", label: "In sospeso" },
];

/**
 * I filtri, in un comando che si chiama **Filtri**.
 *
 * Sul pulsante c'era scritto il filtro attivo — «Tutte» — e «Tutte» da solo,
 * in una barra di comandi, non dice a cosa serva premerlo. Adesso il pulsante
 * dice cosa **è** e il conteggio dice se sta togliendo qualcosa: `Filtri`
 * quando mostra tutto, `Filtri · 1` quando la lista è ristretta. Il conteggio
 * nasce già come numero e non come parola perché di dimensioni, qui, un giorno
 * ce ne sarà più di una (sala, provenienza, cameriere).
 */
export function FiltroStato({
  attivo,
  url,
  inSospeso,
}: {
  attivo: StatoFiltro;
  url: (s: StatoFiltro) => string;
  /** Quante prenotazioni aspettano una risposta, **in tutta la giornata**. */
  inSospeso: number;
}) {
  const corrente = VOCI.find((v) => v.chiave === attivo) ?? VOCI[0];
  /* Oggi la dimensione filtrabile è una sola. Il conteggio è comunque un
     numero: quando se ne aggiungerà un'altra, qui non cambia niente. */
  const attivi = attivo === "all" ? 0 : 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            attivi > 0
              ? `Filtri, attivo: ${corrente.label}. Cambia filtro`
              : inSospeso > 0
                ? `Filtri. ${inSospeso} prenotazioni in attesa di risposta. Cambia filtro`
                : "Filtri. Cambia filtro"
          }
          className={cn(
            ALTEZZA,
            TESTO,
            FUOCO,
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-medium transition-colors min-[1280px]:px-3 min-[1500px]:gap-2 min-[1500px]:px-4",
            attivi > 0
              ? "border-accent-strong/55 bg-accent/15 text-accent-strong"
              : "border-border/70 bg-card/70 text-foreground hover:border-border-strong/70 hover:bg-veil-6",
          )}
        >
          <SlidersHorizontal
            className={cn("h-[18px] w-[18px] shrink-0", attivi === 0 && "text-accent-strong")}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap">
            Filtri
            {attivi > 0 && <span className="tabular-nums"> · {attivi}</span>}
          </span>
          {/*
            Il pallino, e perché non è un numero.

            Quante prenotazioni aspettano una risposta è la sola cosa di questa
            barra che chieda di fare qualcosa, e prima si leggeva a schermo.
            Metterla qui come cifra confliggerebbe con il «· 1» dei filtri, che
            conta un'altra cosa: il pallino dice «c'è qualcosa da vedere» senza
            fingersi lo stesso numero, e quanto sia lo dice il menu.
          */}
          {attivi === 0 && inSospeso > 0 && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-accent-strong" aria-hidden="true" />
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[212px]">
        <DropdownMenuLabel className="t-etichetta px-2.5 pb-1.5 pt-1">Mostra</DropdownMenuLabel>
        {VOCI.map((v) => {
          const scelto = attivo === v.chiave;
          return (
            <DropdownMenuItem key={v.chiave} asChild className={cn("px-2.5 py-2", scelto && "bg-accent/15")}>
              <Link href={url(v.chiave)}>
                <span className={cn("flex-1", scelto && "font-medium")}>{v.label}</span>
                {v.chiave === "pending" && inSospeso > 0 && (
                  <span className="t-nota shrink-0 tabular-nums">{inSospeso}</span>
                )}
                {scelto && <Check className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
