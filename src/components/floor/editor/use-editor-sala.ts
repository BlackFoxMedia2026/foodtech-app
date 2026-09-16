"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Table, TableShape } from "@prisma/client";
import {
  DEFAULT_ROOM_LAYERS,
  boundingBox,
  isTableRef,
  isWall,
  type AreaType,
  type RoomElement,
  type RoomInventory,
  type RoomLayerKey,
  type RoomLayers,
  type RoomMeta,
  type InventoryShape,
} from "@/lib/room-layout";
import { DIMENSIONE_TAVOLO, dimensioneDisegnata } from "@/lib/tavolo-geometria";
import { useRoomCamera } from "@/components/floor/use-room-camera";
import { useHistory } from "./use-storia";
import { snapPointToWalls, type Point } from "./aggancio";
import { calcolaGuide, type Guida, type Rettangolo } from "./guide";

export type TavoloLocale = Table & { dirty?: boolean };
export type StatoEditor = { elements: RoomElement[]; tables: TavoloLocale[] };

/** Cosa si può far cadere sulla piantina dalla colonna di sinistra. */
export type TipoStrutturale = "WALL" | "DIVIDER" | "DOOR" | "WINDOW" | "COLUMN";
export type TipoTrascinabile =
  | { genere: "tavolo"; shape: TableShape }
  | { genere: "struttura"; tipo: TipoStrutturale }
  | { genere: "area"; tipo: AreaType }
  | { genere: "testo" }
  | { genere: "libero" };

export type EsitoSalvataggio = "ok" | "errore" | "niente";

const PASSO_TASTIERA = 4;
const PASSO_TASTIERA_FINE = 1;

export function useEditorSala({
  roomId,
  elementiIniziali,
  tavoliIniziali,
  larghezzaIniziale,
  altezzaIniziale,
  layersIniziali,
  inventarioIniziale,
  metaIniziale,
  abilitato,
  onSalvato,
}: {
  roomId: string;
  elementiIniziali: RoomElement[];
  tavoliIniziali: Table[];
  larghezzaIniziale: number;
  altezzaIniziale: number;
  layersIniziali: RoomLayers;
  inventarioIniziale: RoomInventory;
  metaIniziale: RoomMeta;
  /** In anteprima e in «Vedi originale» le scorciatoie da tastiera non devono
   * cancellare niente: la stessa sala si guarda anche solo per guardarla. */
  abilitato: boolean;
  onSalvato?: () => void;
}) {
  const history = useHistory<StatoEditor>({
    elements: elementiIniziali,
    tables: tavoliIniziali.map((t) => ({ ...t })),
  });
  const statoRef = useRef(history.state);
  statoRef.current = history.state;

  const [dims, setDims] = useState({ width: larghezzaIniziale, height: altezzaIniziale });
  const dimsRef = useRef(dims);
  dimsRef.current = dims;

  const [layers, setLayersState] = useState<RoomLayers>(layersIniziali);
  const [inventario, setInventarioState] = useState<RoomInventory>(inventarioIniziale);
  const [meta, setMetaState] = useState<RoomMeta>(metaIniziale);
  /** Layer, inventario e meta non stanno nella storia: annullare deve
   * riportare indietro la **piantina**, non riaccendere un livello che
   * qualcuno aveva spento per vedere meglio. Restano però modifiche da
   * salvare, e questo flag è ciò che lo ricorda. */
  const [impostazioniSporche, setImpostazioniSporche] = useState(false);

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [guide, setGuide] = useState<Guida[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [appenaSalvato, setAppenaSalvato] = useState(false);
  const timerSalvato = useRef<ReturnType<typeof setTimeout> | null>(null);

  const camera = useRoomCamera({ roomWidth: dims.width, roomHeight: dims.height });

  // Il mondo cresce quando la piantina cresce, e non si restringe mai da solo:
  // rimpicciolire il canvas mentre qualcuno sta trascinando un muro verso
  // l'esterno gli sposterebbe sotto le dita tutto il resto.
  useEffect(() => {
    const box = boundingBox(history.state.elements);
    const margine = 100;
    setDims((prev) => ({
      width: Math.max(prev.width, Math.round(box.maxX + margine)),
      height: Math.max(prev.height, Math.round(box.maxY + margine)),
    }));
  }, [history.state.elements]);

  useEffect(() => () => { if (timerSalvato.current) clearTimeout(timerSalvato.current); }, []);

  /* ─────────────────────── selezione ─────────────────────── */

  const seleziona = useCallback((id: string, additivo: boolean) => {
    setSelectedIds((prev) => {
      if (!additivo) return prev.size === 1 && prev.has(id) ? prev : new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const deseleziona = useCallback(() => setSelectedIds((prev) => (prev.size === 0 ? prev : new Set())), []);

  const elementiSelezionati = useMemo(
    () => history.state.elements.filter((e) => selectedIds.has(e.id)),
    [history.state.elements, selectedIds],
  );
  const tavoliSelezionati = useMemo(
    () => history.state.tables.filter((t) => selectedIds.has(t.id)),
    [history.state.tables, selectedIds],
  );

  /* ─────────────────────── transazioni ─────────────────────── */

  const inizioRef = useRef<StatoEditor | null>(null);
  const apri = useCallback(() => {
    inizioRef.current = statoRef.current;
  }, []);
  const chiudi = useCallback(() => {
    if (inizioRef.current) {
      history.commit(inizioRef.current, statoRef.current);
      inizioRef.current = null;
    }
    setGuide([]);
  }, [history]);

  const aggiornaElemento = useCallback(
    (id: string, patch: Partial<RoomElement>, commit = false) => {
      const next: StatoEditor = {
        ...statoRef.current,
        elements: statoRef.current.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as RoomElement) : e)),
      };
      if (commit) history.commit(statoRef.current, next);
      else history.setLive(next);
    },
    [history],
  );

  const aggiornaTavolo = useCallback(
    (id: string, patch: Partial<TavoloLocale>, commit = false) => {
      const next: StatoEditor = {
        ...statoRef.current,
        tables: statoRef.current.tables.map((t) => (t.id === id ? { ...t, ...patch, dirty: true } : t)),
      };
      if (commit) history.commit(statoRef.current, next);
      else history.setLive(next);
    },
    [history],
  );

  /* ─────────────────────── inventario ─────────────────────── */

  const idPosizionati = useMemo(
    () => new Set(history.state.elements.filter(isTableRef).map((e) => e.tableId)),
    [history.state.elements],
  );

  const tavoliSullaPiantina = useMemo(
    () => history.state.tables.filter((t) => idPosizionati.has(t.id)),
    [history.state.tables, idPosizionati],
  );

  const tavoliFuoriPiantina = useMemo(
    () => history.state.tables.filter((t) => !idPosizionati.has(t.id)),
    [history.state.tables, idPosizionati],
  );

  /**
   * La disponibilità per forma.
   *
   * `dichiarati` è quello che il ristoratore ha detto di possedere;
   * `posizionati` è quanti ne ha già messi sulla piantina. La differenza è
   * quello che la libreria mostra. Se non ha dichiarato niente per quella
   * forma, `dichiarati` è `null` e la libreria resta un catalogo aperto: non
   * si blocca nessuno perché non ha compilato un campo.
   */
  const disponibilita = useMemo(() => {
    const out = {} as Record<InventoryShape, { dichiarati: number | null; posizionati: number; disponibili: number | null }>;
    for (const forma of ["SQUARE", "ROUND", "RECT", "OVAL", "CUSTOM"] as InventoryShape[]) {
      const dichiarati = inventario[forma] ?? null;
      const posizionati = tavoliSullaPiantina.filter((t) => t.shape === forma).length;
      out[forma] = {
        dichiarati,
        posizionati,
        disponibili: dichiarati === null ? null : Math.max(0, dichiarati - posizionati),
      };
    }
    return out;
  }, [inventario, tavoliSullaPiantina]);

  /* ─────────────────────── creazione ─────────────────────── */

  function nuovoId(prefisso: string) {
    return `${prefisso}-${crypto.randomUUID()}`;
  }

  function prossimaEtichetta() {
    const esistenti = new Set(statoRef.current.tables.map((t) => t.label));
    let n = statoRef.current.tables.length + 1;
    while (esistenti.has(`T${n}`)) n += 1;
    return `T${n}`;
  }

  const creaElementoA = useCallback(
    (tipo: TipoTrascinabile, punto: Point) => {
      const muri = statoRef.current.elements.filter(isWall);
      let el: RoomElement;

      if (tipo.genere === "struttura") {
        if (tipo.tipo === "WALL" || tipo.tipo === "DIVIDER") {
          // Un muro nuovo nasce già lungo: un segmento di due pixel da
          // allungare a mano sarebbe un bersaglio impossibile da afferrare.
          const lunghezza = 200;
          el = {
            id: nuovoId(tipo.tipo.toLowerCase()),
            type: tipo.tipo,
            startX: Math.round(punto.x - lunghezza / 2),
            startY: Math.round(punto.y),
            endX: Math.round(punto.x + lunghezza / 2),
            endY: Math.round(punto.y),
            thickness: tipo.tipo === "WALL" ? 12 : 6,
          };
        } else if (tipo.tipo === "COLUMN") {
          el = { id: nuovoId("col"), type: "COLUMN", x: punto.x - 20, y: punto.y - 20, width: 40, height: 40, rotation: 0 };
        } else {
          const larghezza = tipo.tipo === "DOOR" ? 90 : 120;
          const agganciato = snapPointToWalls(punto, muri);
          el = {
            id: nuovoId(tipo.tipo.toLowerCase()),
            type: tipo.tipo,
            wallId: agganciato?.wallId ?? null,
            x: Math.round(agganciato?.point.x ?? punto.x),
            y: Math.round(agganciato?.point.y ?? punto.y),
            width: larghezza,
            rotation: agganciato?.angle ?? 0,
          };
        }
      } else if (tipo.genere === "area") {
        el = {
          id: nuovoId("area"),
          type: tipo.tipo,
          x: Math.round(punto.x - 90),
          y: Math.round(punto.y - 60),
          width: 180,
          height: 120,
          rotation: 0,
          label: null,
        };
      } else if (tipo.genere === "testo") {
        el = { id: nuovoId("txt"), type: "TEXT", x: Math.round(punto.x), y: Math.round(punto.y), text: "Testo", fontSize: 14, rotation: 0 };
      } else {
        el = {
          id: nuovoId("free"),
          type: "FREE",
          x: Math.round(punto.x - 30),
          y: Math.round(punto.y - 30),
          width: 60,
          height: 60,
          rotation: 0,
          label: null,
        };
      }

      history.commit(statoRef.current, { ...statoRef.current, elements: [...statoRef.current.elements, el] });
      setSelectedIds(new Set([el.id]));
    },
    [history],
  );

  /**
   * Mettere un tavolo sulla piantina.
   *
   * Prima cerca fra i tavoli di questa sala **già esistenti e non ancora
   * posizionati**: se il locale ha dieci tavoli nel gestionale e ne ha
   * disposti sette, trascinare un quadrato deve mettere giù uno dei tre che
   * mancano, non crearne un undicesimo. Solo quando non ce ne sono si crea
   * una riga nuova — e solo se la disponibilità dichiarata lo consente.
   */
  const piazzaTavolo = useCallback(
    async (shape: TableShape, punto: Point): Promise<"ok" | "esauriti" | "errore"> => {
      const misura = DIMENSIONE_TAVOLO[shape];
      const posX = Math.round(Math.max(0, punto.x - misura.w / 2));
      const posY = Math.round(Math.max(0, punto.y - misura.h / 2));

      const idGiaSulPiano = new Set(statoRef.current.elements.filter(isTableRef).map((e) => e.tableId));
      const riusabile = statoRef.current.tables.find((t) => t.shape === shape && !idGiaSulPiano.has(t.id));

      if (riusabile) {
        history.commit(statoRef.current, {
          elements: [...statoRef.current.elements, { id: nuovoId("tref"), type: "TABLE", tableId: riusabile.id }],
          tables: statoRef.current.tables.map((t) =>
            t.id === riusabile.id ? { ...t, posX, posY, dirty: true } : t,
          ),
        });
        setSelectedIds(new Set([riusabile.id]));
        return "ok";
      }

      const dichiarati = inventario[shape as InventoryShape];
      if (dichiarati !== undefined) {
        const posizionati = statoRef.current.tables.filter((t) => t.shape === shape && idGiaSulPiano.has(t.id)).length;
        if (posizionati >= dichiarati) return "esauriti";
      }

      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: prossimaEtichetta(), seats: postiPredefiniti(shape), shape, roomId, posX, posY }),
      });
      if (!res.ok) return "errore";
      const creato = (await res.json()) as Table;

      history.commit(statoRef.current, {
        elements: [...statoRef.current.elements, { id: nuovoId("tref"), type: "TABLE", tableId: creato.id }],
        tables: [...statoRef.current.tables, { ...creato, posX, posY, dirty: true }],
      });
      setSelectedIds(new Set([creato.id]));
      return "ok";
    },
    [history, inventario, roomId],
  );

  /** Un tavolo creato altrove — dal modulo «Nuovo tavolo» in testata —
   * entra nella piantina già posizionato: crearlo e poi doverlo cercare fra
   * i disponibili sarebbe un secondo gesto per finire il primo. */
  const aggiungiTavoloEsistente = useCallback(
    (tavolo: Table, punto: Point) => {
      const misura = DIMENSIONE_TAVOLO[tavolo.shape];
      const posX = Math.round(Math.max(0, punto.x - misura.w / 2));
      const posY = Math.round(Math.max(0, punto.y - misura.h / 2));
      const senzaDuplicati = statoRef.current.tables.filter((t) => t.id !== tavolo.id);
      history.commit(statoRef.current, {
        elements: [...statoRef.current.elements, { id: nuovoId("tref"), type: "TABLE", tableId: tavolo.id }],
        tables: [...senzaDuplicati, { ...tavolo, posX, posY, dirty: true }],
      });
      setSelectedIds(new Set([tavolo.id]));
    },
    [history],
  );

  /**
   * Un punto libero vicino a quello chiesto.
   *
   * Serve a chi posiziona **con un clic** invece che trascinando: il punto
   * chiesto è sempre il centro della vista, e senza questo cinque clic di
   * fila impilano cinque tavoli esattamente uno sopra l'altro — si vede solo
   * l'ultimo, e sembra che i primi quattro non siano stati creati. Chi
   * trascina non passa di qui: lì il punto lo sceglie la mano.
   */
  const puntoLibero = useCallback((punto: Point): Point => {
    const occupati = [
      ...statoRef.current.tables
        .filter((t) => idPosizionati.has(t.id))
        .map((t) => {
          const d = dimensioneDisegnata(t);
          return { x: t.posX + d.w / 2, y: t.posY + d.h / 2 };
        }),
      ...statoRef.current.elements.flatMap((el) =>
        "x" in el && "width" in el && "height" in el ? [{ x: el.x + el.width / 2, y: el.y + el.height / 2 }] : [],
      ),
    ];

    const PASSO = 44;
    for (let giro = 0; giro < 12; giro++) {
      for (let i = 0; i < Math.max(1, giro * 6); i++) {
        const angolo = (2 * Math.PI * i) / Math.max(1, giro * 6);
        const candidato = {
          x: punto.x + Math.cos(angolo) * PASSO * giro,
          y: punto.y + Math.sin(angolo) * PASSO * giro,
        };
        if (!occupati.some((o) => Math.hypot(o.x - candidato.x, o.y - candidato.y) < PASSO * 0.8)) {
          return { x: Math.round(candidato.x), y: Math.round(candidato.y) };
        }
      }
    }
    return punto;
  }, [idPosizionati]);

  /* ─────────────────────── eliminazione ─────────────────────── */

  /**
   * Cancellare, dalla piantina.
   *
   * Un elemento strutturale sparisce e basta. Un tavolo no: **torna
   * disponibile**. La riga del gestionale resta, con le sue prenotazioni e i
   * suoi turni, perché «l'ho tolto dalla mappa» e «non esiste più» sono due
   * frasi diverse e solo la seconda si può fare per sbaglio con il tasto
   * Canc. Eliminarlo davvero si fa dal pannello Proprietà, con una conferma.
   */
  const eliminaSelezione = useCallback(() => {
    if (selectedIds.size === 0) return;
    const next: StatoEditor = {
      elements: statoRef.current.elements.filter(
        (e) => !selectedIds.has(e.id) && !(isTableRef(e) && selectedIds.has(e.tableId)),
      ),
      tables: statoRef.current.tables,
    };
    history.commit(statoRef.current, next);
    setSelectedIds(new Set());
  }, [history, selectedIds]);

  const eliminaTavoloDavvero = useCallback(
    async (tableId: string) => {
      history.commit(statoRef.current, {
        elements: statoRef.current.elements.filter((e) => !(isTableRef(e) && e.tableId === tableId)),
        tables: statoRef.current.tables.filter((t) => t.id !== tableId),
      });
      setSelectedIds(new Set());
      await fetch(`/api/tables/${tableId}`, { method: "DELETE" });
    },
    [history],
  );

  /* ─────────────────────── trascinamento ─────────────────────── */

  function rettangoloTavolo(t: TavoloLocale): Rettangolo {
    const d = dimensioneDisegnata(t);
    return { x: t.posX, y: t.posY, w: d.w, h: d.h };
  }

  const trascina = useCallback(
    (
      e: React.PointerEvent,
      opzioni: {
        /** Chiamata a ogni movimento con lo spostamento cumulato, in pixel
         * del mondo (già divisi per lo zoom). */
        onMuovi: (dx: number, dy: number, e: PointerEvent) => void;
      },
    ) => {
      // `Element` non dichiara gli eventi puntatore nella libreria DOM di
      // TypeScript: il bersaglio è sempre un nodo HTML o SVG, ed è quello che
      // va detto per poter ascoltare `pointermove`.
      const bersaglio = e.currentTarget as unknown as HTMLElement;
      bersaglio.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const y0 = e.clientY;
      const zoom = camera.getZoom();
      apri();

      function muovi(ev: PointerEvent) {
        opzioni.onMuovi((ev.clientX - x0) / zoom, (ev.clientY - y0) / zoom, ev);
      }
      function su() {
        bersaglio.removeEventListener("pointermove", muovi);
        bersaglio.removeEventListener("pointerup", su);
        bersaglio.removeEventListener("pointercancel", su);
        chiudi();
      }
      bersaglio.addEventListener("pointermove", muovi);
      bersaglio.addEventListener("pointerup", su);
      bersaglio.addEventListener("pointercancel", su);
    },
    [camera, apri, chiudi],
  );

  const spostaTavolo = useCallback(
    (id: string, e: React.PointerEvent) => {
      const t = statoRef.current.tables.find((x) => x.id === id);
      if (!t) return;
      const baseX = t.posX;
      const baseY = t.posY;
      const misura = dimensioneDisegnata(t);
      const altri = statoRef.current.tables.filter((x) => x.id !== id && idPosizionati.has(x.id)).map(rettangoloTavolo);

      trascina(e, {
        onMuovi: (dx, dy, ev) => {
          const { width, height } = dimsRef.current;
          let x = Math.max(0, Math.min(width - misura.w, baseX + dx));
          let y = Math.max(0, Math.min(height - misura.h, baseY + dy));
          // Alt tiene fermo l'aggancio: qualche volta un tavolo va messo
          // esattamente dove le guide non vogliono.
          if (!ev.altKey) {
            const g = calcolaGuide({ x, y, w: misura.w, h: misura.h }, altri, statoRef.current.elements);
            x += g.dx;
            y += g.dy;
            setGuide(g.guide);
          } else {
            setGuide([]);
          }
          aggiornaTavolo(id, { posX: Math.round(x), posY: Math.round(y) });
        },
      });
    },
    [trascina, aggiornaTavolo, idPosizionati],
  );

  const ruotaTavolo = useCallback(
    (id: string, e: React.PointerEvent) => {
      const t = statoRef.current.tables.find((x) => x.id === id);
      const rect = camera.viewportRef.current?.getBoundingClientRect();
      if (!t || !rect) return;
      const misura = dimensioneDisegnata(t);
      const cx = t.posX + misura.w / 2;
      const cy = t.posY + misura.h / 2;
      const cam = camera.camera;
      const schermoX = rect.left + cam.x + cx * cam.zoom;
      const schermoY = rect.top + cam.y + cy * cam.zoom;

      trascina(e, {
        onMuovi: (_dx, _dy, ev) => {
          const rad = Math.atan2(ev.clientY - schermoY, ev.clientX - schermoX);
          let gradi = (rad * 180) / Math.PI + 90;
          // Senza Shift si scatta di 15°: una sala dove ogni tavolo è storto
          // di tre gradi diversi non è una sala, è un disegno mosso.
          if (!ev.shiftKey) gradi = Math.round(gradi / 15) * 15;
          gradi = ((Math.round(gradi) % 360) + 360) % 360;
          aggiornaTavolo(id, { rotation: gradi });
        },
      });
    },
    [camera, trascina, aggiornaTavolo],
  );

  const ridimensionaTavolo = useCallback(
    (id: string, angolo: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => {
      const t = statoRef.current.tables.find((x) => x.id === id);
      if (!t) return;
      const base = dimensioneDisegnata(t);
      const segnoX = angolo === "ne" || angolo === "se" ? 1 : -1;
      const segnoY = angolo === "sw" || angolo === "se" ? 1 : -1;

      trascina(e, {
        onMuovi: (dx, dy) => {
          const w = Math.round(Math.max(30, Math.min(600, base.w + dx * segnoX * 2)));
          const h = Math.round(Math.max(30, Math.min(600, base.h + dy * segnoY * 2)));
          // Il tavolo cresce attorno al proprio centro, così ridimensionarlo
          // non lo fa anche scivolare via da dove era stato messo.
          aggiornaTavolo(id, {
            width: w,
            height: h,
            posX: Math.round(t.posX - (w - base.w) / 2),
            posY: Math.round(t.posY - (h - base.h) / 2),
          });
        },
      });
    },
    [trascina, aggiornaTavolo],
  );

  const spostaElemento = useCallback(
    (id: string, e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el) return;
      const iniziale = { ...el } as RoomElement;

      trascina(e, {
        onMuovi: (dx, dy) => {
          if ("startX" in iniziale) {
            aggiornaElemento(id, {
              startX: Math.round(iniziale.startX + dx),
              startY: Math.round(iniziale.startY + dy),
              endX: Math.round(iniziale.endX + dx),
              endY: Math.round(iniziale.endY + dy),
            } as Partial<RoomElement>);
          } else if ("x" in iniziale) {
            aggiornaElemento(id, {
              x: Math.round(iniziale.x + dx),
              y: Math.round(iniziale.y + dy),
            } as Partial<RoomElement>);
          }
        },
      });
    },
    [trascina, aggiornaElemento],
  );

  const ridimensionaElemento = useCallback(
    (id: string, e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el || !("width" in el)) return;
      const larghezza0 = el.width;
      const altezza0 = "height" in el ? el.height : 0;

      trascina(e, {
        onMuovi: (dx, dy) => {
          const patch: Record<string, number> = { width: Math.round(Math.max(20, larghezza0 + dx)) };
          if ("height" in el) patch.height = Math.round(Math.max(20, altezza0 + dy));
          aggiornaElemento(id, patch as Partial<RoomElement>);
        },
      });
    },
    [trascina, aggiornaElemento],
  );

  const spostaEstremo = useCallback(
    (id: string, estremo: "start" | "end", e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el || !("startX" in el)) return;
      const x0 = estremo === "start" ? el.startX : el.endX;
      const y0 = estremo === "start" ? el.startY : el.endY;

      trascina(e, {
        onMuovi: (dx, dy) => {
          const patch =
            estremo === "start"
              ? { startX: Math.round(x0 + dx), startY: Math.round(y0 + dy) }
              : { endX: Math.round(x0 + dx), endY: Math.round(y0 + dy) };
          aggiornaElemento(id, patch as Partial<RoomElement>);
        },
      });
    },
    [trascina, aggiornaElemento],
  );

  /* ─────────────────────── layer / meta / inventario ─────────────────────── */

  const cambiaLayer = useCallback((chiave: RoomLayerKey, valore: boolean) => {
    setLayersState((prev) => ({ ...prev, [chiave]: valore }));
    setImpostazioniSporche(true);
  }, []);

  const cambiaMeta = useCallback((patch: RoomMeta) => {
    setMetaState((prev) => ({ ...prev, ...patch }));
    setImpostazioniSporche(true);
  }, []);

  const cambiaInventario = useCallback((forma: InventoryShape, quantita: number | null) => {
    setInventarioState((prev) => {
      const next = { ...prev };
      if (quantita === null) delete next[forma];
      else next[forma] = Math.max(0, Math.min(999, Math.round(quantita)));
      return next;
    });
    setImpostazioniSporche(true);
  }, []);

  /** Sostituisce l'intera piantina — è quello che fa «usa il risultato
   * dell'analisi». Passa dalla storia, quindi si annulla con Ctrl+Z come
   * qualunque altra modifica: un riconoscimento che non piace non deve
   * costare il lavoro fatto prima. */
  const sostituisciPiantina = useCallback(
    (elementi: RoomElement[], larghezza: number, altezza: number) => {
      const riferimentiTavoli = statoRef.current.elements.filter(isTableRef);
      history.commit(statoRef.current, {
        ...statoRef.current,
        elements: [...elementi, ...riferimentiTavoli],
      });
      setDims({ width: larghezza, height: altezza });
      setSelectedIds(new Set());
      requestAnimationFrame(() => camera.fitRoom(true));
    },
    [history, camera],
  );

  /* ─────────────────────── salvataggio ─────────────────────── */

  const sporco = history.canUndo || impostazioniSporche || history.state.tables.some((t) => t.dirty);

  const salva = useCallback(async (): Promise<EsitoSalvataggio> => {
    if (!sporco) return "niente";
    setSalvando(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/layout`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          elements: statoRef.current.elements,
          width: dimsRef.current.width,
          height: dimsRef.current.height,
          layers,
          inventory: inventario,
          meta,
        }),
      });
      if (!res.ok) return "errore";

      const daSalvare = statoRef.current.tables.filter((t) => t.dirty);
      const esiti = await Promise.all(
        daSalvare.map((t) =>
          fetch(`/api/tables/${t.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              posX: t.posX,
              posY: t.posY,
              rotation: t.rotation,
              seats: t.seats,
              label: t.label,
              shape: t.shape,
              width: t.width,
              height: t.height,
              active: t.active,
            }),
          }).then((r) => r.ok),
        ),
      );
      if (!esiti.every(Boolean)) return "errore";

      history.reset({
        elements: statoRef.current.elements,
        tables: statoRef.current.tables.map((t) => ({ ...t, dirty: false })),
      });
      setImpostazioniSporche(false);
      setAppenaSalvato(true);
      if (timerSalvato.current) clearTimeout(timerSalvato.current);
      timerSalvato.current = setTimeout(() => setAppenaSalvato(false), 2400);
      onSalvato?.();
      return "ok";
    } finally {
      setSalvando(false);
    }
  }, [sporco, roomId, layers, inventario, meta, history, onSalvato]);

  /* ─────────────────────── tastiera ─────────────────────── */

  useEffect(() => {
    if (!abilitato) return;
    function onKeyDown(e: KeyboardEvent) {
      const bersaglio = e.target as HTMLElement | null;
      // Canc dentro un campo cancella un carattere, non un tavolo.
      if (bersaglio && (bersaglio.tagName === "INPUT" || bersaglio.tagName === "TEXTAREA" || bersaglio.isContentEditable)) {
        return;
      }
      if (e.key === "Escape") {
        deseleziona();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) {
          e.preventDefault();
          eliminaSelezione();
        }
        return;
      }
      const frecce: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = frecce[e.key];
      if (dir && selectedIds.size > 0) {
        e.preventDefault();
        const passo = e.shiftKey ? PASSO_TASTIERA : PASSO_TASTIERA_FINE;
        const prima = statoRef.current;
        let dopo = prima;
        for (const id of Array.from(selectedIds)) {
          const t = dopo.tables.find((x) => x.id === id);
          if (t) {
            dopo = {
              ...dopo,
              tables: dopo.tables.map((x) =>
                x.id === id ? { ...x, posX: x.posX + dir[0] * passo, posY: x.posY + dir[1] * passo, dirty: true } : x,
              ),
            };
            continue;
          }
          dopo = {
            ...dopo,
            elements: dopo.elements.map((el) => {
              if (el.id !== id) return el;
              if ("startX" in el) {
                return {
                  ...el,
                  startX: el.startX + dir[0] * passo,
                  startY: el.startY + dir[1] * passo,
                  endX: el.endX + dir[0] * passo,
                  endY: el.endY + dir[1] * passo,
                };
              }
              if ("x" in el) return { ...el, x: el.x + dir[0] * passo, y: el.y + dir[1] * passo };
              return el;
            }),
          };
        }
        history.commit(prima, dopo);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [abilitato, selectedIds, deseleziona, eliminaSelezione, history]);

  /* ─────────────────────── coordinate ─────────────────────── */

  const alMondo = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = camera.viewportRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const cam = camera.camera;
      return { x: (clientX - rect.left - cam.x) / cam.zoom, y: (clientY - rect.top - cam.y) / cam.zoom };
    },
    [camera],
  );

  return {
    // stato
    elements: history.state.elements,
    tables: history.state.tables,
    tavoliSullaPiantina,
    tavoliFuoriPiantina,
    idPosizionati,
    dims,
    layers,
    inventario,
    meta,
    disponibilita,
    guide,
    sporco,
    salvando,
    appenaSalvato,

    // camera
    camera,

    // selezione
    selectedIds,
    seleziona,
    deseleziona,
    elementiSelezionati,
    tavoliSelezionati,

    // modifiche
    aggiornaElemento,
    aggiornaTavolo,
    creaElementoA,
    aggiungiTavoloEsistente,
    puntoLibero,
    piazzaTavolo,
    eliminaSelezione,
    eliminaTavoloDavvero,
    sostituisciPiantina,
    cambiaLayer,
    cambiaMeta,
    cambiaInventario,

    // interazione
    spostaTavolo,
    ruotaTavolo,
    ridimensionaTavolo,
    spostaElemento,
    ridimensionaElemento,
    spostaEstremo,
    alMondo,

    // storia
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,

    salva,
  };
}

export type EditorSala = ReturnType<typeof useEditorSala>;

function postiPredefiniti(shape: TableShape) {
  switch (shape) {
    case "RECT":
      return 6;
    case "OVAL":
      return 6;
    case "BOOTH":
      return 4;
    case "LOUNGE":
      return 4;
    default:
      return 4;
  }
}
