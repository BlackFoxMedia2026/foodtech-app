"use client";

import { useState } from "react";
import type { TableShape } from "@prisma/client";
import {
  ArrowLeftRight,
  ChefHat,
  Columns2,
  DoorOpen,
  Droplet,
  PanelTop,
  RectangleHorizontal,
  Lightbulb,
  Minus,
  Square as SquareIcon,
  StretchHorizontal,
  Type as TypeIcon,
  Warehouse,
  Wine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS } from "@/lib/room-layout";
import type { AreaType, InventoryShape } from "@/lib/room-layout";
import type { EditorSala, TipoTrascinabile } from "./use-editor-sala";

/**
 * La colonna degli elementi.
 *
 * Quattro gruppi, in ordine di frequenza d'uso: i tavoli si mettono ogni
 * settimana, la struttura si corregge il primo giorno, le aree quasi mai, il
 * testo una volta sola. È la stessa ragione per cui il riquadro col
 * suggerimento sta in fondo e non in cima: serve la prima volta, e la prima
 * volta si legge tutta la colonna.
 *
 * Ogni riga si può **trascinare** o **cliccare**: trascinare è il gesto
 * naturale col mouse, cliccare è l'unico che funziona da tastiera e su un
 * tablet dove il trascinamento compete con lo scorrimento del pannello.
 */

const TAVOLI: { shape: TableShape; label: string }[] = [
  { shape: "SQUARE", label: "Tavolo quadrato" },
  { shape: "ROUND", label: "Tavolo rotondo" },
  { shape: "RECT", label: "Tavolo rettangolare" },
  { shape: "OVAL", label: "Tavolo ovale" },
  { shape: "CUSTOM", label: "Tavolo personalizzato" },
];

const STRUTTURA: { tipo: "WALL" | "DIVIDER" | "DOOR" | "WINDOW" | "COLUMN"; label: string; icona: IconaComponente }[] = [
  { tipo: "WALL", label: "Parete", icona: Minus },
  { tipo: "DIVIDER", label: "Divisorio", icona: StretchHorizontal },
  { tipo: "DOOR", label: "Porta", icona: DoorOpen },
  { tipo: "WINDOW", label: "Finestra", icona: PanelTop },
  { tipo: "COLUMN", label: "Colonna", icona: Columns2 },
];

const AREE: { tipo: AreaType; icona: IconaComponente }[] = [
  { tipo: "AREA_ZONE", icona: SquareIcon },
  { tipo: "AREA_KITCHEN", icona: ChefHat },
  { tipo: "AREA_BAR", icona: Wine },
  { tipo: "AREA_STAIRS", icona: ArrowLeftRight },
  { tipo: "AREA_ENTRANCE", icona: DoorOpen },
  { tipo: "AREA_WC", icona: Droplet },
  { tipo: "AREA_STORAGE", icona: Warehouse },
];

type IconaComponente = React.ComponentType<{ className?: string }>;

export function LibreriaElementi({
  editor,
  onPosiziona,
}: {
  editor: EditorSala;
  /** Posiziona al centro della piantina — è la strada del clic, quella che
   * funziona anche senza trascinare. */
  onPosiziona: (tipo: TipoTrascinabile) => void;
}) {
  const [dichiarazioneAperta, setDichiarazioneAperta] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="t-titolo-scheda">Elementi</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Gruppo
          titolo="Tavoli"
          azione={
            <button
              type="button"
              onClick={() => setDichiarazioneAperta((v) => !v)}
              aria-expanded={dichiarazioneAperta}
              className="text-[10px] font-medium normal-case tracking-normal text-accent-strong hover:underline"
            >
              {dichiarazioneAperta ? "Fatto" : "Dichiara"}
            </button>
          }
        >
          {/*
            Quanti tavoli possiede il locale.

            È l'unica informazione di questa colonna che non si può ricavare
            guardando la piantina, ed è quella che rende la libreria una
            libreria invece di un catalogo infinito: senza, «Tavolo quadrato»
            è un bottone che ne crea uno nuovo per sempre, e nessuno si accorge
            di averne messi nove quando ne ha otto.
          */}
          {dichiarazioneAperta && (
            <div className="mb-1 flex flex-col gap-1.5 rounded-lg bg-secondary/40 p-2">
              <p className="text-[10px] leading-snug text-tertiary-foreground">
                Quanti ne possiedi, per forma. Lascia vuoto se non vuoi un limite.
              </p>
              {TAVOLI.map(({ shape, label }) => {
                const disp = editor.disponibilita[shape as InventoryShape];
                return (
                  <label key={shape} className="flex items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate">{label.replace("Tavolo ", "")}</span>
                    <span className="shrink-0 tabular-nums text-tertiary-foreground">{disp.posizionati} in sala</span>
                    <input
                      type="number"
                      min={0}
                      max={999}
                      inputMode="numeric"
                      value={disp.dichiarati ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        editor.cambiaInventario(shape as InventoryShape, e.target.value === "" ? null : Number(e.target.value))
                      }
                      className="h-7 w-14 shrink-0 rounded-md border border-input bg-background px-1.5 text-center text-[11px] tabular-nums"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {TAVOLI.map(({ shape, label }) => {
            const disp = editor.disponibilita[shape as InventoryShape];
            const esaurito = disp?.disponibili === 0;
            return (
              <Riga
                key={shape}
                label={label}
                icona={<GlifoTavolo shape={shape} />}
                disabilitato={esaurito}
                coda={
                  disp?.dichiarati === null ? null : (
                    <span className={cn("tabular-nums", esaurito ? "text-destructive" : "text-tertiary-foreground")}>
                      {disp.disponibili} disponibil{disp.disponibili === 1 ? "e" : "i"}
                    </span>
                  )
                }
                tipo={{ genere: "tavolo", shape }}
                onPosiziona={onPosiziona}
              />
            );
          })}
        </Gruppo>

        {/*
          I tavoli che esistono nel gestionale ma non sono sulla piantina.

          Senza questa sezione sono invisibili: hanno prenotazioni, turni e un
          nome, ma nessun posto dove vederli. Trascinandone uno si posiziona
          **quello**, non una copia — è la differenza fra rimettere a posto un
          tavolo e crearne un altro con lo stesso nome.
        */}
        {editor.tavoliFuoriPiantina.length > 0 && (
          <Gruppo titolo={`Non posizionati (${editor.tavoliFuoriPiantina.length})`}>
            {editor.tavoliFuoriPiantina.slice(0, 40).map((t) => (
              <Riga
                key={t.id}
                label={t.label}
                icona={<GlifoTavolo shape={t.shape} />}
                coda={<span className="text-tertiary-foreground">{t.seats} posti</span>}
                tipo={{ genere: "tavolo", shape: t.shape }}
                onPosiziona={onPosiziona}
              />
            ))}
          </Gruppo>
        )}

        <Gruppo titolo="Struttura">
          {STRUTTURA.map(({ tipo, label, icona: Icona }) => (
            <Riga
              key={tipo}
              label={label}
              icona={<Icona className="h-4 w-4" />}
              tipo={{ genere: "struttura", tipo }}
              onPosiziona={onPosiziona}
            />
          ))}
        </Gruppo>

        <Gruppo titolo="Aree">
          {AREE.map(({ tipo, icona: Icona }) => (
            <Riga
              key={tipo}
              label={AREA_LABELS[tipo]}
              icona={<Icona className="h-4 w-4" />}
              tipo={{ genere: "area", tipo }}
              onPosiziona={onPosiziona}
            />
          ))}
        </Gruppo>

        <Gruppo titolo="Altro">
          <Riga
            label="Testo"
            icona={<TypeIcon className="h-4 w-4" />}
            tipo={{ genere: "testo" }}
            onPosiziona={onPosiziona}
          />
          <Riga
            label="Elemento libero"
            icona={<RectangleHorizontal className="h-4 w-4" />}
            tipo={{ genere: "libero" }}
            onPosiziona={onPosiziona}
          />
        </Gruppo>
      </div>

      {/*
        Il suggerimento: piccolo, in fondo, senza bordo d'allarme. Non è un
        avviso — non è successo niente — è la riga che spiega il gesto a chi
        apre questa schermata per la prima volta.
      */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="flex items-start gap-2.5 rounded-lg bg-secondary/40 px-2.5 py-2">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-strong/15">
            <Lightbulb className="h-3.5 w-3.5 text-accent-strong" />
          </span>
          <p className="text-[11px] leading-snug text-tertiary-foreground">
            Trascina un elemento e posizionalo sulla piantina. Usa i punti per ridimensionare e ruotare.
          </p>
        </div>
      </div>
    </div>
  );
}

function Gruppo({ titolo, azione, children }: { titolo: string; azione?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <h3 className="t-etichetta">{titolo}</h3>
        {azione}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Riga({
  label,
  icona,
  coda,
  tipo,
  disabilitato,
  onPosiziona,
}: {
  label: string;
  icona: React.ReactNode;
  coda?: React.ReactNode;
  tipo: TipoTrascinabile;
  disabilitato?: boolean;
  onPosiziona: (tipo: TipoTrascinabile) => void;
}) {
  return (
    <button
      type="button"
      draggable={!disabilitato}
      disabled={disabilitato}
      title={disabilitato ? "Hai già posizionato tutti i tavoli di questo tipo" : `${label} — trascina o clicca per posizionare`}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-elemento-sala", JSON.stringify(tipo));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => !disabilitato && onPosiziona(tipo)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left text-xs transition-colors",
        disabilitato
          ? "cursor-not-allowed opacity-45"
          : "cursor-grab hover:border-accent-strong/60 hover:bg-secondary active:cursor-grabbing",
      )}
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary/70 text-accent-strong">
        {icona}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {coda && <span className="shrink-0 text-[10px]">{coda}</span>}
    </button>
  );
}

/** Il glifo del tavolo: la forma che si sta per mettere giù, disegnata. Una
 * icona generica costringerebbe a leggere il nome per capire cosa si sta
 * trascinando, che è esattamente il lavoro che l'icona dovrebbe togliere. */
function GlifoTavolo({ shape }: { shape: TableShape }) {
  const comune = { fill: "currentColor", fillOpacity: 0.22, stroke: "currentColor", strokeWidth: 1.4 };
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {shape === "SQUARE" && <rect x="3.5" y="3.5" width="11" height="11" rx="1.5" {...comune} />}
      {shape === "ROUND" && <circle cx="9" cy="9" r="5.5" {...comune} />}
      {shape === "RECT" && <rect x="1.5" y="5" width="15" height="8" rx="1.5" {...comune} />}
      {shape === "OVAL" && <ellipse cx="9" cy="9" rx="7.5" ry="4.5" {...comune} />}
      {shape === "CUSTOM" && (
        <path d="M3 5.5 L11 3.5 L15.5 8 L13 14.5 L4.5 13.5 Z" {...comune} strokeLinejoin="round" />
      )}
    </svg>
  );
}
