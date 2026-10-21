"use client";

import { useCallback, useMemo, useState } from "react";
import { Lock, LockOpen, Maximize2, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_ZOOM, MIN_ZOOM } from "@/components/floor/use-room-camera";
import { useViewportGestures } from "@/components/floor/use-viewport-gestures";
import { RoomTableNode } from "@/components/floor/operational/room-table-node";
import type { TableStaffMap } from "@/components/floor/table-node";
import type { TableOperationalStatus } from "@/lib/table-status";
import {
  DIMENSIONE_TAVOLO,
  dimensioneDisegnata,
  improntaTavolo,
  SPORGENZA_SEDIA,
  type PianoNelMondo,
} from "@/lib/tavolo-geometria";
import { PiantinaRenderer } from "./piantina-renderer";
import { TavoloEditorNode } from "./tavolo-editor-node";
import type { EditorSala, TipoTrascinabile } from "./use-editor-sala";
import { isSegment, isTableRef } from "@/lib/room-layout";

export type ModalitaCanvas = "modifica" | "anteprima" | "originale";

/**
 * Il canvas.
 *
 * Una sola superficie con tre stati, non tre schermate: la telecamera, lo
 * zoom e la posizione **non si azzerano** passando da Modifica ad Anteprima.
 * Chi sta guardando l'angolo nord della sala vuole continuare a guardare
 * quello anche quando toglie le maniglie di mezzo, e ricentrare la vista a
 * ogni cambio di linguetta è il modo più veloce per far perdere il filo.
 */
export function CanvasSala({
  editor,
  modalita,
  urlOriginale,
  nomeSala,
  staffByTableId,
  statusByTableId,
  onApriProfilo,
}: {
  editor: EditorSala;
  modalita: ModalitaCanvas;
  urlOriginale: string | null;
  nomeSala: string;
  staffByTableId?: Record<string, TableStaffMap>;
  statusByTableId?: Record<string, TableOperationalStatus>;
  /** In anteprima il clic su un tavolo apre il suo profilo, esattamente come
   * faceva la Sala di prima: quella strada non si tocca. */
  onApriProfilo?: (tableId: string) => void;
}) {
  const { camera } = editor;
  // Per ogni tavolo, i piani dei tavoli che stanno in un'unione con lui: le
  // sedie che ci finirebbero sotto non si disegnano.
  const tavoliPiazzati = editor.tavoliSullaPiantina;
  const unioniSala = editor.unioni;
  const viciniDiUnione = useMemo(() => {
    const perId = new Map(tavoliPiazzati.map((t) => [t.id, t]));
    const piano = (t: (typeof tavoliPiazzati)[number]): PianoNelMondo => {
      const imp = improntaTavolo(t);
      const p = dimensioneDisegnata(t);
      return { cx: t.posX + imp.w / 2, cy: t.posY + imp.h / 2, w: p.w, h: p.h, rotazione: t.rotation };
    };
    const mappa = new Map<string, PianoNelMondo[]>();
    for (const u of unioniSala) {
      for (const id of u.tableIds) {
        if (!perId.has(id)) continue;
        const altri = u.tableIds.filter((a) => a !== id && perId.has(a)).map((a) => piano(perId.get(a)!));
        mappa.set(id, [...(mappa.get(id) ?? []), ...altri]);
      }
    }
    return mappa;
  }, [tavoliPiazzati, unioniSala]);

  const [fantasma, setFantasma] = useState<{ x: number; y: number; tipo: TipoTrascinabile } | null>(null);
  const inModifica = modalita === "modifica";

  const gestures = useViewportGestures({
    viewportRef: camera.viewportRef,
    getZoom: camera.getZoom,
    panBy: camera.panBy,
    zoomAt: camera.zoomAt,
    onBackgroundClick: () => editor.deseleziona(),
  });

  const leggiTrascinato = useCallback((e: React.DragEvent): TipoTrascinabile | null => {
    const raw = e.dataTransfer.getData("application/x-elemento-sala");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TipoTrascinabile;
    } catch {
      return null;
    }
  }, []);

  function onDragOver(e: React.DragEvent) {
    if (!inModifica) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // `getData` non è leggibile durante il dragover (lo vieta la specifica):
    // il tipo del fantasma arriva dal primo drop-enter e resta finché il
    // trascinamento non finisce.
    const punto = editor.alMondo(e.clientX, e.clientY);
    setFantasma((prec) => (prec ? { ...prec, x: punto.x, y: punto.y } : prec));
  }

  function onDragEnter(e: React.DragEvent) {
    if (!inModifica) return;
    const tipo = leggiTrascinato(e);
    const punto = editor.alMondo(e.clientX, e.clientY);
    setFantasma({ x: punto.x, y: punto.y, tipo: tipo ?? { genere: "libero" } });
  }

  async function onDrop(e: React.DragEvent) {
    if (!inModifica) return;
    e.preventDefault();
    setFantasma(null);
    const tipo = leggiTrascinato(e);
    if (!tipo) return;
    const punto = editor.alMondo(e.clientX, e.clientY);
    if (tipo.genere === "tavolo") await editor.piazzaTavolo(tipo.shape, punto, tipo.modello, tipo.tavoloId);
    else editor.creaElementoA(tipo, punto);
  }

  return (
    <div
      ref={camera.viewportRef}
      data-testid="canvas-sala"
      className={cn(
        "relative h-full w-full touch-none select-none overflow-hidden rounded-xl bg-background",
        gestures.isPanning ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={() => setFantasma(null)}
      onDrop={onDrop}
    >
      <div
        ref={camera.worldRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: editor.dims.width,
          height: editor.dims.height,
          transform: `translate(${camera.camera.x}px, ${camera.camera.y}px) scale(${camera.camera.zoom})`,
        }}
      >
        {/* ── L'ORIGINALE ─────────────────────────────────────────────── */}
        {urlOriginale && (modalita === "originale" || editor.layers.original) && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={urlOriginale}
            alt={modalita === "originale" ? `Piantina caricata di ${nomeSala}` : ""}
            aria-hidden={modalita === "originale" ? undefined : true}
            className="pointer-events-none absolute left-0 top-0 h-full w-full object-contain"
            style={{
              // In «Vedi originale» la scansione si guarda: piena, su fondo
              // chiaro, senza ritocchi. Come livello di sfondo invece è una
              // traccia da ricalcare, e deve stare sotto la piantina senza
              // competerci.
              opacity: modalita === "originale" ? 1 : 0.22,
              background: modalita === "originale" ? "#F4EFE4" : undefined,
            }}
            draggable={false}
          />
        )}

        {modalita !== "originale" && (
          <>
            <PiantinaRenderer
              elements={editor.elements}
              width={editor.dims.width}
              height={editor.dims.height}
              layers={editor.layers}
              interazione={
                inModifica
                  ? {
                      selectedIds: editor.selectedIds,
                      onSelezione: editor.seleziona,
                      onInizioSpostamento: editor.spostaElemento,
                      onInizioRidimensiona: editor.ridimensionaElemento,
                      onInizioEstremo: editor.spostaEstremo,
                      onInizioAllunga: editor.allungaApertura,
                      bloccati: editor.idBloccati,
                    }
                  : undefined
              }
            />

            {/* ── UNIONI ───────────────────────────────────────────────── */}
            {editor.layers.tables && <ContornoUnioni editor={editor} />}

            {/* ── TAVOLI ───────────────────────────────────────────────── */}
            {editor.layers.tables &&
              editor.tavoliSullaPiantina.map((t) =>
                inModifica ? (
                  <TavoloEditorNode
                    key={t.id}
                    table={t}
                    vicini={viciniDiUnione.get(t.id)}
                    bloccato={editor.idBloccati.has(t.id)}
                    selezionato={editor.selectedIds.has(t.id)}
                    onSelezione={editor.seleziona}
                    onInizioSpostamento={editor.spostaTavolo}
                    onInizioRotazione={editor.ruotaTavolo}
                  />
                ) : (
                  <RoomTableNode
                    key={t.id}
                    table={t}
                    mode="STAFF"
                    status={statusByTableId?.[t.id]}
                    isSelected={editor.selectedIds.has(t.id)}
                    staff={staffByTableId?.[t.id]}
                    lod={camera.camera.zoom > 0.7 ? "full" : camera.camera.zoom > 0.45 ? "medium" : "low"}
                    onSelect={(id) => {
                      editor.seleziona(id, false);
                      onApriProfilo?.(id);
                    }}
                  />
                ),
              )}

            {/* ── GUIDE ────────────────────────────────────────────────── */}
            {inModifica && editor.guide.length > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0 overflow-visible"
                width={editor.dims.width}
                height={editor.dims.height}
                aria-hidden
              >
                {editor.guide.map((g, i) => (
                  <line
                    key={i}
                    x1={g.orientamento === "v" ? g.posizione : g.da}
                    y1={g.orientamento === "v" ? g.da : g.posizione}
                    x2={g.orientamento === "v" ? g.posizione : g.a}
                    y2={g.orientamento === "v" ? g.a : g.posizione}
                    stroke="#B07A45"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}

            {/* ── LUCCHETTI ────────────────────────────────────────────── */}
            {inModifica && <Lucchetti editor={editor} zoom={camera.camera.zoom} />}

            {/* ── FANTASMA ─────────────────────────────────────────────── */}
            {inModifica && fantasma && <Fantasma fantasma={fantasma} />}
          </>
        )}
      </div>

      {/* ── STRUMENTI IN ALTO A SINISTRA ─────────────────────────────── */}
      {inModifica && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1 riquadro bg-card/90 p-1 shadow-lg backdrop-blur-sm">
          <div className="pointer-events-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="tocco-comodo h-9 w-9"
              onClick={editor.undo}
              disabled={!editor.canUndo}
              aria-label="Annulla"
              title="Annulla (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="tocco-comodo h-9 w-9"
              onClick={editor.redo}
              disabled={!editor.canRedo}
              aria-label="Ripeti"
              title="Ripeti (Ctrl+Shift+Z)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="tocco-comodo h-9 w-9 text-destructive hover:text-destructive"
              onClick={editor.eliminaSelezione}
              disabled={editor.selectedIds.size === 0}
              aria-label="Elimina selezione"
              title="Rimuovi dalla piantina (Canc)"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── ZOOM IN ALTO A DESTRA ───────────────────────────────────── */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1 riquadro bg-card/90 p-1 shadow-lg backdrop-blur-sm">
        <div className="pointer-events-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="tocco-comodo h-9 w-9"
            onClick={() => camera.stepZoom(-1)}
            disabled={camera.camera.zoom <= MIN_ZOOM}
            aria-label="Riduci zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <button
            type="button"
            className="tocco-comodo h-9 w-12 text-center text-xs tabular-nums text-muted-foreground hover:text-foreground"
            onClick={() => camera.reset100()}
            title="Dimensione reale (100%)"
          >
            {Math.round(camera.camera.zoom * 100)}%
          </button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="tocco-comodo h-9 w-9"
            onClick={() => camera.stepZoom(1)}
            disabled={camera.camera.zoom >= MAX_ZOOM}
            aria-label="Aumenta zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="tocco-comodo h-9 w-9"
            onClick={() => camera.fitRoom(true)}
            aria-label="Adatta alla sala"
            title="Adatta alla sala"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * L'anteprima che segue il puntatore mentre si trascina.
 *
 * Non prova a disegnare l'elemento vero: è un ingombro con il bordo
 * tratteggiato, cioè la promessa «cadrà qui, grande così». Disegnare il
 * tavolo finito richiederebbe di crearlo prima di sapere se verrà lasciato
 * cadere sulla piantina o fuori.
 */
function Fantasma({ fantasma }: { fantasma: { x: number; y: number; tipo: TipoTrascinabile } }) {
  const { tipo } = fantasma;
  const misura =
    tipo.genere === "tavolo"
      ? tipo.modello
        ? { w: tipo.modello.width, h: tipo.modello.height }
        : DIMENSIONE_TAVOLO[tipo.shape]
      : tipo.genere === "area"
        ? { w: 180, h: 120 }
        : tipo.genere === "struttura" && (tipo.tipo === "WALL" || tipo.tipo === "DIVIDER")
          ? { w: 200, h: 12 }
          : tipo.genere === "sedia"
            ? { w: 22, h: 16 }
            : tipo.genere === "struttura" && tipo.tipo === "COLUMN"
            ? { w: 40, h: 40 }
            : tipo.genere === "struttura"
              ? { w: tipo.tipo === "DOOR" ? 90 : 120, h: 14 }
              : { w: 60, h: 60 };

  const tondo = tipo.genere === "tavolo" && (tipo.shape === "ROUND" || tipo.shape === "OVAL");

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute border-2 border-dashed border-accent-strong bg-accent-strong/15"
      style={{
        left: fantasma.x - misura.w / 2,
        top: fantasma.y - misura.h / 2,
        width: misura.w,
        height: misura.h,
        borderRadius: tondo ? 9999 : 6,
      }}
    />
  );
}

/**
 * Il contorno delle unioni previste: un tratteggio attorno ai tavoli che si
 * accostano, con il nome e i posti sopra. Sta **sotto** i tavoli e non
 * intercetta i clic: è un'indicazione, non un oggetto da spostare.
 *
 * Si accende quando uno dei suoi tavoli è selezionato, così chi sistema la
 * sala vede subito con chi va un tavolo prima di allontanarlo.
 */
function ContornoUnioni({ editor }: { editor: EditorSala }) {
  const perId = new Map(editor.tavoliSullaPiantina.map((t) => [t.id, t]));
  const MARGINE = 10;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={editor.dims.width}
      height={editor.dims.height}
      aria-hidden
    >
      {editor.unioni.map((u) => {
        const tavoli = u.tableIds.map((id) => perId.get(id)).filter((t) => t !== undefined);
        if (tavoli.length < 2) return null;
        const rettangoli = tavoli.map((t) => ({ x: t.posX, y: t.posY, ...improntaTavolo(t) }));
        const x = Math.min(...rettangoli.map((r) => r.x)) - MARGINE;
        const y = Math.min(...rettangoli.map((r) => r.y)) - MARGINE;
        const w = Math.max(...rettangoli.map((r) => r.x + r.w)) + MARGINE - x;
        const h = Math.max(...rettangoli.map((r) => r.y + r.h)) + MARGINE - y;
        const attiva = tavoli.some((t) => editor.selectedIds.has(t.id));
        const testo = `${u.label ? `${u.label} · ` : ""}${u.posti} posti`;
        return (
          <g key={u.id} opacity={attiva ? 1 : 0.55}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={14}
              fill="var(--control-fill, #2c5545)"
              fillOpacity={attiva ? 0.08 : 0.04}
              stroke="var(--control-fill, #2c5545)"
              strokeWidth={attiva ? 2 : 1.5}
              strokeDasharray="6 5"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x + 10}
              y={y - 6}
              fontSize={12}
              fontWeight={600}
              fill="var(--control-fill, #2c5545)"
              style={{ paintOrder: "stroke", stroke: "var(--room-floor, #ded7c6)", strokeWidth: 3 }}
            >
              {testo}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

type Riquadro = { x: number; y: number; w: number; h: number };

/** Il riquadro dritto che contiene un oggetto della piantina (un tavolo o
 * un elemento), in coordinate del mondo. Serve solo a sapere dove appoggiare
 * il lucchetto: un'approssimazione larga va bene, una che taglia no. */
function riquadroOggetto(editor: EditorSala, id: string): Riquadro | null {
  const t = editor.tavoliSullaPiantina.find((x) => x.id === id);
  if (t) {
    // Il piano con le sedie, non l'impronta standard della forma: su un
    // tavolo da due l'impronta è il doppio del piano, e il lucchetto finiva
    // lontano dal tavolo a cui si riferisce.
    const imp = improntaTavolo(t);
    const piano = dimensioneDisegnata(t);
    const w = piano.w + 2 * SPORGENZA_SEDIA;
    const h = piano.h + 2 * SPORGENZA_SEDIA;
    return { x: t.posX + (imp.w - w) / 2, y: t.posY + (imp.h - h) / 2, w, h };
  }
  const el = editor.elements.find((x) => x.id === id);
  if (!el || isTableRef(el)) return null;
  if (isSegment(el)) {
    const m = el.thickness / 2;
    const x = Math.min(el.startX, el.endX) - m;
    const y = Math.min(el.startY, el.endY) - m;
    return { x, y, w: Math.abs(el.endX - el.startX) + 2 * m, h: Math.abs(el.endY - el.startY) + 2 * m };
  }
  if (el.type === "DOOR" || el.type === "WINDOW") {
    const r = (el.rotation * Math.PI) / 180;
    const dx = Math.abs(Math.cos(r)) * (el.width / 2) + 7;
    const dy = Math.abs(Math.sin(r)) * (el.width / 2) + 7;
    return { x: el.x - dx, y: el.y - dy, w: 2 * dx, h: 2 * dy };
  }
  if (el.type === "TEXT") {
    const w = el.text.length * el.fontSize * 0.64 + 12;
    return { x: el.x - w / 2, y: el.y - el.fontSize, w, h: el.fontSize * 2 };
  }
  if ("width" in el && "height" in el) {
    // Ruotato, il riquadro dritto è quello che contiene i quattro spigoli.
    const r = (el.rotation * Math.PI) / 180;
    const w = Math.abs(el.width * Math.cos(r)) + Math.abs(el.height * Math.sin(r));
    const h = Math.abs(el.width * Math.sin(r)) + Math.abs(el.height * Math.cos(r));
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  return null;
}

/**
 * Il lucchetto.
 *
 * Su un oggetto selezionato compare un pulsante tondo all'angolo in alto a
 * destra: un tocco blocca la posizione, un altro la sblocca. Sugli oggetti
 * bloccati non selezionati resta un lucchetto piccolo e pallido, che non
 * riceve clic: dice «questo non si muove» senza coprire la piantina.
 *
 * Sta nel mondo (segue la piantina mentre si scorre) ma ha una misura fissa
 * sullo schermo: a 50% di zoom un pulsante che si rimpicciolisce con la sala
 * non si prende più.
 */
function Lucchetti({ editor, zoom }: { editor: EditorSala; zoom: number }) {
  const scala = 1 / Math.max(zoom, 0.05);
  const selezionato = editor.selectedIds.size === 1 ? [...editor.selectedIds][0] : null;

  const piccoli = [...editor.idBloccati]
    .filter((id) => id !== selezionato)
    .map((id) => ({ id, r: riquadroOggetto(editor, id) }))
    .filter((x): x is { id: string; r: Riquadro } => x.r !== null);

  const rSel = selezionato ? riquadroOggetto(editor, selezionato) : null;
  const bloccatoSel = selezionato ? editor.idBloccati.has(selezionato) : false;

  return (
    <>
      {piccoli.map(({ id, r }) => (
        <div
          key={id}
          aria-hidden="true"
          className="pointer-events-none absolute grid h-[18px] w-[18px] place-items-center rounded-full bg-[color:var(--control-fill,#2c5545)] text-[color:var(--control-ink,#f7f3ea)] opacity-80 shadow-sm"
          style={{
            left: r.x + r.w,
            top: r.y,
            transform: `translate(-50%, -50%) scale(${scala})`,
            zIndex: 20,
          }}
        >
          <Lock className="h-2.5 w-2.5" />
        </div>
      ))}

      {selezionato && rSel && (
        <button
          type="button"
          aria-pressed={bloccatoSel}
          aria-label={bloccatoSel ? "Sblocca la posizione" : "Blocca la posizione"}
          title={bloccatoSel ? "Sblocca la posizione" : "Blocca la posizione"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            editor.bloccaOggetto(selezionato);
          }}
          className={cn(
            "absolute grid h-7 w-7 place-items-center rounded-full border shadow-md transition-colors",
            bloccatoSel
              ? "border-transparent bg-[color:var(--control-fill,#2c5545)] text-[color:var(--control-ink,#f7f3ea)]"
              : "border-border bg-card text-foreground hover:bg-secondary",
          )}
          style={{
            left: rSel.x + rSel.w,
            top: rSel.y,
            transform: `translate(-30%, -70%) scale(${scala})`,
            zIndex: 21,
          }}
        >
          {bloccatoSel ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </button>
      )}
    </>
  );
}

