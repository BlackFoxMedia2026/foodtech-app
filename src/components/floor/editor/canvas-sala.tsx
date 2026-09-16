"use client";

import { useCallback, useState } from "react";
import { Maximize2, Redo2, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_ZOOM, MIN_ZOOM } from "@/components/floor/use-room-camera";
import { useViewportGestures } from "@/components/floor/use-viewport-gestures";
import { RoomTableNode } from "@/components/floor/operational/room-table-node";
import type { TableStaffMap } from "@/components/floor/table-node";
import type { TableOperationalStatus } from "@/lib/table-status";
import { DIMENSIONE_TAVOLO } from "@/lib/tavolo-geometria";
import { PiantinaRenderer } from "./piantina-renderer";
import { TavoloEditorNode } from "./tavolo-editor-node";
import type { EditorSala, TipoTrascinabile } from "./use-editor-sala";

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
    if (tipo.genere === "tavolo") await editor.piazzaTavolo(tipo.shape, punto);
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
                    }
                  : undefined
              }
            />

            {/* ── TAVOLI ───────────────────────────────────────────────── */}
            {editor.layers.tables &&
              editor.tavoliSullaPiantina.map((t) =>
                inModifica ? (
                  <TavoloEditorNode
                    key={t.id}
                    table={t}
                    selezionato={editor.selectedIds.has(t.id)}
                    onSelezione={editor.seleziona}
                    onInizioSpostamento={editor.spostaTavolo}
                    onInizioRidimensiona={editor.ridimensionaTavolo}
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
      ? DIMENSIONE_TAVOLO[tipo.shape]
      : tipo.genere === "area"
        ? { w: 180, h: 120 }
        : tipo.genere === "struttura" && (tipo.tipo === "WALL" || tipo.tipo === "DIVIDER")
          ? { w: 200, h: 12 }
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
