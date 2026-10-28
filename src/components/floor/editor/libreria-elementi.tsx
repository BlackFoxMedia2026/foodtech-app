"use client";

import { useState } from "react";
import type { TableShape } from "@prisma/client";
import {
  Armchair,
  ArrowLeftRight,
  BrickWall,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Columns2,
  DoorOpen,
  Droplet,
  PanelTop,
  RectangleHorizontal,
  Lightbulb,
  Minus,
  Square as SquareIcon,
  StretchHorizontal,
  Trash2,
  Type as TypeIcon,
  Warehouse,
  Wine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAvvisi } from "@/components/ui/avvisi";
import { AREA_LABELS, pxToMeters } from "@/lib/room-layout";
import type { AreaType, InventoryShape } from "@/lib/room-layout";
import type { EditorSala, TipoTrascinabile } from "./use-editor-sala";

/**
 * La colonna degli elementi.
 *
 * Una colonna di sezioni, in ordine di frequenza d'uso: i tavoli si mettono
 * ogni settimana, la struttura (con le aree) si corregge il primo giorno, il
 * testo una volta sola. Si entra in una sezione per vederne l'elenco, così la
 * colonna resta corta invece di essere un catalogo da scorrere. È la stessa
 * ragione per cui il riquadro col suggerimento sta in fondo e non in cima:
 * serve la prima volta, e la prima volta si legge tutta la colonna.
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

/** Le due sezioni che hanno un elenco dentro. Testo, sedia ed elemento
 * libero sono un elemento solo: si trascinano dalla colonna principale. */
type Sezione = "tavoli" | "struttura";

const SEZIONI: Record<Sezione, string> = { tavoli: "Tavoli", struttura: "Struttura" };

export function LibreriaElementi({
  editor,
  onPosiziona,
}: {
  editor: EditorSala;
  /** Posiziona al centro della piantina — è la strada del clic, quella che
   * funziona anche senza trascinare. */
  onPosiziona: (tipo: TipoTrascinabile) => void;
}) {
  const [sezione, setSezione] = useState<Sezione | null>(null);
  const [dichiarazioneAperta, setDichiarazioneAperta] = useState(false);
  const nonPosizionati = editor.tavoliFuoriPiantina.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-3">
        {sezione ? (
          <>
            <button
              type="button"
              onClick={() => setSezione(null)}
              aria-label="Torna agli elementi"
              className="-ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="t-titolo-scheda">{SEZIONI[sezione]}</h2>
          </>
        ) : (
          <h2 className="t-titolo-scheda">Elementi</h2>
        )}
      </div>

      <div className="vi-scorre min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/*
          La colonna principale: un bottone per sezione. Tavoli e struttura
          hanno un elenco e ci si entra; gli altri tre sono un elemento solo,
          e il bottone è già l'elemento da trascinare — entrare in una sezione
          per trovarci una riga sola sarebbe un clic regalato.
        */}
        {sezione === null && (
          <div className="flex h-full flex-col gap-2 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1">
            <VoceSezione
              label="Tavoli"
              dettaglio={nonPosizionati > 0 ? `${nonPosizionati} da posizionare` : "Forme e predefiniti"}
              evidenzia={nonPosizionati > 0}
              icona={<GlifoTavolo shape="ROUND" grande />}
              onApri={() => setSezione("tavoli")}
            />
            <VoceSezione
              label="Struttura"
              dettaglio="Pareti, porte, aree"
              icona={<BrickWall className="h-6 w-6" />}
              onApri={() => setSezione("struttura")}
            />
            <Riga
              grande
              label="Testo"
              icona={<TypeIcon className="h-6 w-6" />}
              tipo={{ genere: "testo" }}
              onPosiziona={onPosiziona}
            />
            <Riga
              grande
              label="Sedia"
              icona={<Armchair className="h-6 w-6" />}
              tipo={{ genere: "sedia" }}
              onPosiziona={onPosiziona}
            />
            <Riga
              grande
              label="Elemento libero"
              icona={<RectangleHorizontal className="h-6 w-6" />}
              tipo={{ genere: "libero" }}
              onPosiziona={onPosiziona}
            />
          </div>
        )}

        {sezione === "tavoli" && (
          <>
            <Gruppo
              titolo="Forme"
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
              I tavoli predefiniti: le misure che il locale usa davvero, salvate
              dal modulo «Nuovo tavolo». Trascinarne uno crea subito un tavolo
              con quella forma, quei posti e quella misura, e il nome lo sceglie
              il server: è il gesto che si ripete dieci volte allestendo una sala,
              e non deve passare ogni volta da un modulo.
            */}
            {editor.predefiniti.length > 0 && (
              <Gruppo titolo="Predefiniti">
                {editor.predefiniti.map((p) => {
                  const disp = editor.disponibilita[p.shape as InventoryShape];
                  const esaurito = disp?.disponibili === 0;
                  return (
                    <Riga
                      key={p.id}
                      label={p.label}
                      icona={<GlifoTavolo shape={p.shape} />}
                      disabilitato={esaurito}
                      coda={
                        <span className="tabular-nums text-tertiary-foreground">
                          {p.seats} p · {Math.round(pxToMeters(p.width) * 100)}×{Math.round(pxToMeters(p.height) * 100)}
                        </span>
                      }
                      tipo={{
                        genere: "tavolo",
                        shape: p.shape,
                        modello: { seats: p.seats, width: p.width, height: p.height, chairSides: p.chairSides },
                      }}
                      onPosiziona={onPosiziona}
                    />
                  );
                })}
              </Gruppo>
            )}

            {/*
              I tavoli che esistono nel gestionale ma non sono sulla piantina.

              Senza questa sezione sono invisibili: hanno prenotazioni, turni e un
              nome, ma nessun posto dove vederli. Trascinandone uno si posiziona
              **quello**, non una copia — è la differenza fra rimettere a posto un
              tavolo e crearne un altro con lo stesso nome.
            */}
            {nonPosizionati > 0 && (
              <Gruppo titolo={`Non posizionati (${nonPosizionati})`}>
                {editor.tavoliFuoriPiantina.slice(0, 40).map((t) => (
                  <RigaNonPosizionato key={t.id} editor={editor} tavolo={t} onPosiziona={onPosiziona} />
                ))}
              </Gruppo>
            )}
          </>
        )}

        {sezione === "struttura" && (
          <>
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
          </>
        )}
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

/**
 * Le tessere della colonna principale: icona sopra, nome sotto, centrati.
 *
 * L'icona si solleva e si inclina appena quando ci passa sopra il puntatore:
 * è il segno che la tessera si può prendere, lo stesso che fa una carta
 * quando la si sfiora. Con «riduci movimento» resta ferma.
 *
 * Le cinque tessere si dividono l'altezza della colonna in parti uguali:
 * sono tutto quello che c'è, e una colonna che scorre per mostrarne
 * l'ultima nasconderebbe proprio l'elemento libero.
 */
const TESSERA =
  "group relative flex min-h-0 w-full flex-1 basis-0 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border border-border px-3 py-2 text-center transition-[border-color,background-color,box-shadow] duration-200 hover:border-accent-strong/60 hover:bg-secondary hover:shadow-sm";

function IconaTessera({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl [@media(max-height:820px)]:h-9 [@media(max-height:820px)]:w-9 bg-secondary/70 text-accent-strong transition-[transform,background-color] duration-300 ease-out group-hover:bg-accent-strong/15 motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:-rotate-6 motion-safe:group-hover:scale-110 motion-safe:group-active:scale-95">
      {children}
    </span>
  );
}

/** Una tessera che apre una sezione: come quella trascinabile, ma con la
 * freccia nell'angolo — ci si entra, non la si trascina. */
function VoceSezione({
  label,
  dettaglio,
  evidenzia,
  icona,
  onApri,
}: {
  label: string;
  dettaglio: string;
  evidenzia?: boolean;
  icona: React.ReactNode;
  onApri: () => void;
}) {
  return (
    <button type="button" onClick={onApri} className={TESSERA}>
      <ChevronRight className="absolute right-2.5 top-2.5 h-4 w-4 text-tertiary-foreground transition-transform duration-200 motion-safe:group-hover:translate-x-0.5" />
      <IconaTessera>{icona}</IconaTessera>
      <span className="flex min-w-0 max-w-full flex-col">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className={cn("truncate text-[10px]", evidenzia ? "text-accent-strong" : "text-tertiary-foreground")}>
          {dettaglio}
        </span>
      </span>
    </button>
  );
}

/**
 * Un tavolo che esiste ma non è sulla piantina: si trascina per metterlo
 * giù, o si elimina se è stato creato per sbaglio.
 *
 * L'eliminazione chiede conferma sul posto, come nel pannello Proprietà:
 * il tavolo esce dal gestionale, non solo da questa sala.
 */
function RigaNonPosizionato({
  editor,
  tavolo,
  onPosiziona,
}: {
  editor: EditorSala;
  tavolo: EditorSala["tables"][number];
  onPosiziona: (tipo: TipoTrascinabile) => void;
}) {
  const avvisi = useAvvisi();
  const [conferma, setConferma] = useState(false);
  const [inCorso, setInCorso] = useState(false);

  if (conferma) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2">
        <p className="text-[11px] leading-snug text-destructive">
          Eliminare {tavolo.label}? Esce dal gestionale, con le prenotazioni collegate.
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={inCorso}
            onClick={async () => {
              setInCorso(true);
              const ok = await editor.eliminaTavoloDavvero(tavolo.id);
              setInCorso(false);
              if (!ok) {
                avvisi.problema(`${tavolo.label} non è stato eliminato. Riprova fra un momento.`);
                return;
              }
              setConferma(false);
            }}
            className="h-7 flex-1 rounded-md bg-destructive px-2 text-[11px] font-medium text-destructive-foreground disabled:opacity-60"
          >
            {inCorso ? "Elimino…" : "Elimina"}
          </button>
          <button
            type="button"
            onClick={() => setConferma(false)}
            className="h-7 rounded-md px-2 text-[11px] hover:bg-secondary"
          >
            Annulla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <Riga
          label={tavolo.label}
          icona={<GlifoTavolo shape={tavolo.shape} />}
          coda={<span className="text-tertiary-foreground">{tavolo.seats} posti</span>}
          tipo={{ genere: "tavolo", shape: tavolo.shape, tavoloId: tavolo.id }}
          onPosiziona={onPosiziona}
        />
      </div>
      <button
        type="button"
        onClick={() => setConferma(true)}
        aria-label={`Elimina ${tavolo.label}`}
        title={`Elimina ${tavolo.label}`}
        className="grid h-9 w-8 shrink-0 place-items-center rounded-lg text-tertiary-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
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
  grande,
  onPosiziona,
}: {
  label: string;
  icona: React.ReactNode;
  coda?: React.ReactNode;
  tipo: TipoTrascinabile;
  disabilitato?: boolean;
  /** Nella colonna principale, accanto alle voci delle sezioni. */
  grande?: boolean;
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
        grande ? TESSERA : "flex w-full items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left text-xs transition-colors",
        disabilitato
          ? "cursor-not-allowed opacity-45"
          : "cursor-grab hover:border-accent-strong/60 hover:bg-secondary active:cursor-grabbing",
      )}
    >
      {grande ? (
        <>
          <IconaTessera>{icona}</IconaTessera>
          <span className="max-w-full truncate text-sm font-medium">{label}</span>
        </>
      ) : (
        <>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-secondary/70 text-accent-strong">
            {icona}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
          {coda && <span className="shrink-0 text-[10px]">{coda}</span>}
        </>
      )}
    </button>
  );
}

/** Il glifo del tavolo: la forma che si sta per mettere giù, disegnata. Una
 * icona generica costringerebbe a leggere il nome per capire cosa si sta
 * trascinando, che è esattamente il lavoro che l'icona dovrebbe togliere. */
function GlifoTavolo({ shape, grande }: { shape: TableShape; grande?: boolean }) {
  const comune = { fill: "currentColor", fillOpacity: 0.22, stroke: "currentColor", strokeWidth: 1.4 };
  const lato = grande ? 26 : 18;
  return (
    <svg width={lato} height={lato} viewBox="0 0 18 18" aria-hidden="true">
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
