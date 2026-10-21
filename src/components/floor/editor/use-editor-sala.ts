"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Table, TablePreset, TableShape } from "@prisma/client";
import {
  DEFAULT_ROOM_LAYERS,
  boundingBox,
  isArea,
  isSegment,
  isTableRef,
  isWall,
  metersToPx,
  type AreaType,
  type RoomElement,
  type RoomInventory,
  type RoomLayerKey,
  type RoomLayers,
  type RoomMeta,
  type InventoryShape,
} from "@/lib/room-layout";
import {
  dimensioneDisegnata,
  improntaTavolo,
  rettangoloIngombro,
  rispettaSpazioMinimo,
  SPAZIO_MINIMO_PASSAGGIO_PX,
} from "@/lib/tavolo-geometria";
import { useRoomCamera } from "@/components/floor/use-room-camera";
import { useHistory } from "./use-storia";
import type { UnionePrevista } from "@/server/unioni-tavoli";
import { stessoPunto, tracciatoDi } from "./perimetro";
import { calamitaAngolo, calamitaCapo, calamitaLinea, snapPointToWalls, type Point } from "./aggancio";
import {
  calcolaGuide,
  calcolaGuideBordi,
  SOGLIA_MAGNETE_MURO_PX,
  SOGLIA_MAGNETE_PX,
  type Guida,
  type Rettangolo,
} from "./guide";

export type TavoloLocale = Table & { dirty?: boolean };
export type StatoEditor = { elements: RoomElement[]; tables: TavoloLocale[] };

/** Cosa si può far cadere sulla piantina dalla colonna di sinistra. */
/** La calamita di colonne, elementi liberi e testi: più decisa di quella
 * dei tavoli (7 px), più leggera del magnete delle aree. */
const SOGLIA_CALAMITA_PX = 10;
const SOGLIA_CALAMITA_MURO_PX = 14;

export type TipoStrutturale = "WALL" | "DIVIDER" | "DOOR" | "WINDOW" | "COLUMN";
/** La misura di un tavolo predefinito: chi lo mette giù vuole **quel**
 * tavolo, non la misura standard della sua forma. */
export type ModelloTavolo = { seats: number; width: number; height: number; chairSides?: "ALL" | "LONG" };

export type TipoTrascinabile =
  | {
      genere: "tavolo";
      shape: TableShape;
      modello?: ModelloTavolo;
      /** Un tavolo che esiste già (dai «Non posizionati»): si mette giù
       * **quello**, non il primo libero della stessa forma. */
      tavoloId?: string;
    }
  | { genere: "struttura"; tipo: TipoStrutturale }
  | { genere: "area"; tipo: AreaType }
  | { genere: "testo" }
  | { genere: "libero" }
  | { genere: "sedia" };

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
  onAvviso,
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
  /** Per dire com'è andato un gesto da tastiera (copia, incolla), che non ha
   * un pulsante accanto a cui mostrare l'esito. */
  onAvviso?: (testo: string, tono: "fatto" | "problema") => void;
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
  const metaRef = useRef(meta);
  metaRef.current = meta;
  // In centimetri è una scelta di chi disegna la sala, in pixel è un numero
  // che la geometria può sommare: questa è l'unica funzione che fa il salto,
  // così i quattro punti che applicano il vincolo non lo rifanno ognuno.
  const spazioMinimoAttuale = useCallback(() => {
    const cm = metaRef.current.spazioMinimoPassaggioCm;
    return cm != null ? metersToPx(cm / 100) : SPAZIO_MINIMO_PASSAGGIO_PX;
  }, []);
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

  /**
   * I tavoli predefiniti del locale, per la colonna degli elementi.
   *
   * Valgono per tutto il locale, non per la sala: si caricano all'apertura
   * dell'editor e si ricaricano quando il modulo «Nuovo tavolo» ne salva o
   * ne cancella uno, che è l'unico posto dove succede.
   */
  const [predefiniti, setPredefiniti] = useState<TablePreset[]>([]);
  const ricaricaPredefiniti = useCallback(async () => {
    try {
      const res = await fetch("/api/table-presets", { cache: "no-store" });
      if (!res.ok) return;
      setPredefiniti((await res.json()) as TablePreset[]);
    } catch (err) {
      console.error("Caricamento tavoli predefiniti non riuscito:", err);
    }
  }, []);
  useEffect(() => {
    void ricaricaPredefiniti();
  }, [ricaricaPredefiniti]);

  /**
   * Le unioni previste di questa sala: quali tavoli si accostano per un
   * gruppo grande. Non fanno parte della piantina — non passano dal «Salva»
   * e non hanno annulla — perché non sono un disegno: sono un'informazione
   * per chi assegna i tavoli, e valgono dal momento in cui si creano.
   */
  const [unioni, setUnioni] = useState<UnionePrevista[]>([]);
  // Per chi trascina: il gesto legge le unioni al momento, non quelle di
  // quando il callback è nato.
  const unioniRef = useRef(unioni);
  unioniRef.current = unioni;

  /* ─────────────────────── copia e incolla ─────────────────────── */

  /**
   * Gli appunti dell'editor: una copia di quello che era selezionato quando
   * si è premuto Cmd/Ctrl+C. Stanno in memoria e non negli appunti di
   * sistema: un tavolo incollato in un'email non vuol dire niente, e così
   * Cmd+C dentro un campo di testo resta quello di sempre.
   *
   * `incolli` conta quante volte si è incollato: ogni copia nuova finisce un
   * passo più in là della precedente, invece che sopra.
   */
  const appuntiRef = useRef<{ tavoli: TavoloLocale[]; elementi: RoomElement[]; incolli: number } | null>(null);
  const onAvvisoRef = useRef(onAvviso);
  onAvvisoRef.current = onAvviso;

  const copia = useCallback((): number => {
    const stato = statoRef.current;
    const sulPiano = new Set(stato.elements.filter(isTableRef).map((e) => e.tableId));
    const tavoli = stato.tables.filter((t) => selectedIds.has(t.id) && sulPiano.has(t.id));
    const elementi = stato.elements.filter((el) => !isTableRef(el) && selectedIds.has(el.id));
    if (tavoli.length + elementi.length === 0) return 0;
    appuntiRef.current = { tavoli, elementi, incolli: 0 };
    return tavoli.length + elementi.length;
  }, [selectedIds]);

  const incolla = useCallback(async () => {
    const appunti = appuntiRef.current;
    if (!appunti) return;
    appunti.incolli += 1;
    const passo = 40 * appunti.incolli;
    const stato = statoRef.current;

    // Gli elementi: copie con un id nuovo, spostate, e **sbloccate** — chi
    // incolla vuole sistemare la copia, non trovarla già inchiodata.
    const nuoviElementi: RoomElement[] = appunti.elementi.map((el) => {
      const base = { ...el, id: nuovoId(el.type.toLowerCase()), locked: undefined } as RoomElement;
      if ("startX" in base) {
        return { ...base, startX: base.startX + passo, startY: base.startY + passo, endX: base.endX + passo, endY: base.endY + passo };
      }
      if ("x" in base) {
        // Una porta spostata non sta più sul suo muro.
        const staccata = "wallId" in base ? { wallId: null } : {};
        return { ...base, ...staccata, x: base.x + passo, y: base.y + passo } as RoomElement;
      }
      return base;
    });

    // I tavoli: tavoli nuovi, creati sul server (il nome lo sceglie lui), con
    // le stesse regole di chi li trascina dalla colonna: il limite dei tavoli
    // dichiarati e lo spazio minimo di passaggio.
    const sulPiano = new Set(stato.elements.filter(isTableRef).map((e) => e.tableId));
    const ingombri = stato.tables.filter((t) => sulPiano.has(t.id)).map(rettangoloIngombro);
    const perForma = new Map<string, number>();
    for (const t of stato.tables) if (sulPiano.has(t.id)) perForma.set(t.shape, (perForma.get(t.shape) ?? 0) + 1);

    const creati: TavoloLocale[] = [];
    let esauriti = 0;
    let falliti = 0;
    for (const t of appunti.tavoli) {
      const dichiarati = inventario[t.shape as InventoryShape];
      if (dichiarati !== undefined && (perForma.get(t.shape) ?? 0) >= dichiarati) {
        esauriti += 1;
        continue;
      }
      const candidato = rettangoloIngombro({ ...t, posX: t.posX + passo, posY: t.posY + passo });
      const corretto = rispettaSpazioMinimo(candidato, ingombri, spazioMinimoAttuale());
      const posX = Math.round(t.posX + passo + (corretto.x - candidato.x));
      const posY = Math.round(t.posY + passo + (corretto.y - candidato.y));
      try {
        const res = await fetch("/api/tables", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            seats: t.seats,
            shape: t.shape,
            roomId,
            posX,
            posY,
            width: t.width,
            height: t.height,
            chairSides: t.chairSides,
          }),
        });
        if (!res.ok) {
          falliti += 1;
          continue;
        }
        const nuovo = (await res.json()) as Table;
        // La rotazione si salva con la sala, come ogni altra modifica.
        const locale: TavoloLocale = { ...nuovo, posX, posY, rotation: t.rotation, dirty: true };
        creati.push(locale);
        ingombri.push(rettangoloIngombro(locale));
        perForma.set(t.shape, (perForma.get(t.shape) ?? 0) + 1);
      } catch (err) {
        console.error("Incolla tavolo non riuscito:", err);
        falliti += 1;
      }
    }

    if (creati.length + nuoviElementi.length > 0) {
      const ora = statoRef.current;
      history.commit(ora, {
        elements: [
          ...ora.elements,
          ...nuoviElementi,
          ...creati.map((t) => ({ id: nuovoId("tref"), type: "TABLE" as const, tableId: t.id })),
        ],
        tables: [...ora.tables, ...creati],
      });
      setSelectedIds(new Set([...creati.map((t) => t.id), ...nuoviElementi.map((e) => e.id)]));
    }
    if (esauriti > 0) {
      onAvvisoRef.current?.(
        `${esauriti === 1 ? "Un tavolo non è stato incollato" : `${esauriti} tavoli non sono stati incollati`}: hai già posizionato tutti quelli di quella forma che hai dichiarato.`,
        "problema",
      );
    } else if (falliti > 0) {
      onAvvisoRef.current?.("Non tutti i tavoli sono stati incollati. Riprova fra un momento.", "problema");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, inventario, roomId, spazioMinimoAttuale]);

  /* ─────────────────────── blocco ─────────────────────── */

  /** Gli oggetti bloccati: id degli elementi e id dei tavoli (il blocco di
   * un tavolo sta sul suo segnaposto `TABLE`). */
  const idBloccati = useMemo(() => {
    const bloccati = new Set<string>();
    const elementi = history.state.elements;
    for (const el of elementi) {
      if (!el.locked) continue;
      if (isTableRef(el)) bloccati.add(el.tableId);
      // Un muro bloccato blocca il suo tracciato: la stanza è una cosa sola.
      else if (el.type === "WALL") for (const m of tracciatoDi(elementi.filter(isSegment), el.id)) bloccati.add(m.id);
      else bloccati.add(el.id);
    }
    return bloccati;
  }, [history.state.elements]);

  /** I muri che si muovono insieme a `id`: il suo tracciato se è una parete,
   * sé stesso altrimenti. */
  function membriDi(id: string): string[] {
    const segmenti = statoRef.current.elements.filter(isSegment);
    const tracciato = tracciatoDi(segmenti, id);
    return tracciato.length > 0 ? tracciato.map((m) => m.id) : [id];
  }

  /** Letto al momento del gesto, non quando il callback è nato. Per un muro
   * vale il tracciato: basta un muro bloccato a tenere ferma la stanza. */
  function eBloccato(id: string) {
    const membri = new Set(membriDi(id));
    return statoRef.current.elements.some(
      (el) => el.locked && (membri.has(el.id) || (isTableRef(el) && el.tableId === id)),
    );
  }

  /**
   * Bloccare o sbloccare un oggetto (un elemento o un tavolo). Passa dalla
   * storia come ogni modifica: si annulla con Cmd+Z e si salva con la sala.
   */
  const bloccaOggetto = useCallback(
    (id: string, bloccato?: boolean) => {
      const prima = statoRef.current;
      const valore = bloccato ?? !eBloccato(id);
      // Il lucchetto di un muro chiude (e apre) tutto il suo tracciato.
      const membri = new Set(membriDi(id));
      const dopo: StatoEditor = {
        ...prima,
        elements: prima.elements.map((el) =>
          membri.has(el.id) || (isTableRef(el) && el.tableId === id) ? { ...el, locked: valore || undefined } : el,
        ),
      };
      history.commit(prima, dopo);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history],
  );
  const ricaricaUnioni = useCallback(async () => {
    try {
      const res = await fetch(`/api/table-combinations?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store" });
      if (!res.ok) return;
      setUnioni((await res.json()) as UnionePrevista[]);
    } catch (err) {
      console.error("Caricamento unioni non riuscito:", err);
    }
  }, [roomId]);
  useEffect(() => {
    void ricaricaUnioni();
  }, [ricaricaUnioni]);

  /** Unire i tavoli scelti. Restituisce il messaggio del server se dice di
   * no (sale diverse, un tavolo non unibile, un'unione già esistente). */
  const creaUnione = useCallback(
    async (tableIds: string[], label?: string): Promise<{ ok: true } | { ok: false; messaggio: string }> => {
      try {
        const res = await fetch("/api/table-combinations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomId, tableIds, label: label?.trim() || null }),
        });
        if (!res.ok) {
          const corpo = (await res.json().catch(() => null)) as { message?: string } | null;
          return { ok: false, messaggio: corpo?.message ?? "Unione non creata. Riprova fra un momento." };
        }
        const creata = (await res.json()) as UnionePrevista;
        setUnioni((prev) => [...prev, creata]);
        return { ok: true };
      } catch (err) {
        console.error("Creazione unione non riuscita:", err);
        return { ok: false, messaggio: "Unione non creata: controlla la connessione e riprova." };
      }
    },
    [roomId],
  );

  const separaUnione = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/table-combinations/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) return false;
    } catch (err) {
      console.error("Separazione unione non riuscita:", err);
      return false;
    }
    setUnioni((prev) => prev.filter((u) => u.id !== id));
    return true;
  }, []);

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
      } else if (tipo.genere === "sedia") {
        el = {
          id: nuovoId("sedia"),
          type: "CHAIR",
          x: Math.round(punto.x - 11),
          y: Math.round(punto.y - 8),
          width: 22,
          height: 16,
          rotation: 0,
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
    async (
      shape: TableShape,
      punto: Point,
      modello?: ModelloTavolo,
      tavoloId?: string,
    ): Promise<"ok" | "esauriti" | "errore"> => {
      const misura = modello
        ? { w: modello.width, h: modello.height }
        : dimensioneDisegnata({ shape, seats: postiPredefiniti(shape) });
      const posXDesiderata = Math.round(Math.max(0, punto.x - misura.w / 2));
      const posYDesiderata = Math.round(Math.max(0, punto.y - misura.h / 2));

      const idGiaSulPiano = new Set(statoRef.current.elements.filter(isTableRef).map((e) => e.tableId));
      // Lo spazio minimo di passaggio vale anche al primo posizionamento, non
      // solo quando si sposta un tavolo già sulla piantina — altrimenti
      // bastava trascinarlo dalla lista «Non posizionati» per aggirarlo.
      const altriIngombri = statoRef.current.tables.filter((t) => idGiaSulPiano.has(t.id)).map(rettangoloIngombro);
      // Da un predefinito si riusa solo un tavolo identico (forma, posti e
      // misura): uno qualunque della stessa forma non sarebbe quello scelto.
      const riusabile = tavoloId
        ? statoRef.current.tables.find((t) => t.id === tavoloId && !idGiaSulPiano.has(t.id))
        : statoRef.current.tables.find(
            (t) =>
              t.shape === shape &&
              !idGiaSulPiano.has(t.id) &&
              (!modello || (t.seats === modello.seats && t.width === modello.width && t.height === modello.height)),
          );

      if (riusabile) {
        const candidato = rettangoloIngombro({ ...riusabile, posX: posXDesiderata, posY: posYDesiderata });
        const corretto = rispettaSpazioMinimo(candidato, altriIngombri, spazioMinimoAttuale());
        const posX = Math.round(posXDesiderata + (corretto.x - candidato.x));
        const posY = Math.round(posYDesiderata + (corretto.y - candidato.y));
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

      const posti = modello?.seats ?? postiPredefiniti(shape);
      const candidatoNuovo = rettangoloIngombro({
        shape,
        seats: posti,
        width: modello?.width ?? null,
        height: modello?.height ?? null,
        posX: posXDesiderata,
        posY: posYDesiderata,
      });
      const correttoNuovo = rispettaSpazioMinimo(candidatoNuovo, altriIngombri, spazioMinimoAttuale());
      const posX = Math.round(posXDesiderata + (correttoNuovo.x - candidatoNuovo.x));
      const posY = Math.round(posYDesiderata + (correttoNuovo.y - candidatoNuovo.y));

      let res: Response;
      try {
        res = await fetch("/api/tables", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Niente nome: lo sceglie il server, che vede i tavoli di tutte le
          // sale. Da qui si vedono solo quelli di questa, e il nome è unico
          // per locale.
          body: JSON.stringify({
            seats: posti,
            shape,
            roomId,
            posX,
            posY,
            width: modello?.width ?? null,
            height: modello?.height ?? null,
            chairSides: modello?.chairSides,
          }),
        });
      } catch (err) {
        console.error("Creazione tavolo non riuscita:", err);
        return "errore";
      }
      if (!res.ok) return "errore";
      const creato = (await res.json()) as Table;

      history.commit(statoRef.current, {
        elements: [...statoRef.current.elements, { id: nuovoId("tref"), type: "TABLE", tableId: creato.id }],
        tables: [...statoRef.current.tables, { ...creato, posX, posY, dirty: true }],
      });
      setSelectedIds(new Set([creato.id]));
      return "ok";
    },
    [history, inventario, roomId, spazioMinimoAttuale],
  );

  /** Un tavolo creato altrove — dal modulo «Nuovo tavolo» in testata —
   * entra nella piantina già posizionato: crearlo e poi doverlo cercare fra
   * i disponibili sarebbe un secondo gesto per finire il primo. */
  const aggiungiTavoloEsistente = useCallback(
    (tavolo: Table, punto: Point) => {
      const misura = dimensioneDisegnata(tavolo);
      const posXDesiderata = Math.round(Math.max(0, punto.x - misura.w / 2));
      const posYDesiderata = Math.round(Math.max(0, punto.y - misura.h / 2));
      const idGiaSulPiano = new Set(statoRef.current.elements.filter(isTableRef).map((e) => e.tableId));
      const altriIngombri = statoRef.current.tables
        .filter((t) => t.id !== tavolo.id && idGiaSulPiano.has(t.id))
        .map(rettangoloIngombro);
      const candidato = rettangoloIngombro({ ...tavolo, posX: posXDesiderata, posY: posYDesiderata });
      const corretto = rispettaSpazioMinimo(candidato, altriIngombri, spazioMinimoAttuale());
      const posX = Math.round(posXDesiderata + (corretto.x - candidato.x));
      const posY = Math.round(posYDesiderata + (corretto.y - candidato.y));
      const senzaDuplicati = statoRef.current.tables.filter((t) => t.id !== tavolo.id);
      history.commit(statoRef.current, {
        elements: [...statoRef.current.elements, { id: nuovoId("tref"), type: "TABLE", tableId: tavolo.id }],
        tables: [...senzaDuplicati, { ...tavolo, posX, posY, dirty: true }],
      });
      setSelectedIds(new Set([tavolo.id]));
    },
    [history, spazioMinimoAttuale],
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
    // Bloccato vuol dire anche «non si toglie per sbaglio con Canc»: resta
    // sulla piantina, e resta selezionato perché si veda che è rimasto.
    const daTogliere = new Set([...selectedIds].filter((id) => !idBloccati.has(id)));
    if (daTogliere.size === 0) return;
    const next: StatoEditor = {
      elements: statoRef.current.elements.filter(
        (e) => !daTogliere.has(e.id) && !(isTableRef(e) && daTogliere.has(e.tableId)),
      ),
      tables: statoRef.current.tables,
    };
    history.commit(statoRef.current, next);
    setSelectedIds(new Set([...selectedIds].filter((id) => idBloccati.has(id))));
  }, [history, selectedIds, idBloccati]);

  /**
   * Eliminare un tavolo dal gestionale, non solo dalla piantina.
   *
   * Prima il server, poi la piantina: se l'eliminazione non riesce il tavolo
   * deve restare dov'è, invece di sparire dallo schermo e ricomparire al
   * prossimo caricamento come se niente fosse.
   */
  const eliminaTavoloDavvero = useCallback(
    async (tableId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/tables/${tableId}`, { method: "DELETE" });
        if (!res.ok && res.status !== 404) return false;
      } catch (err) {
        console.error("Eliminazione tavolo non riuscita:", err);
        return false;
      }
      history.commit(statoRef.current, {
        elements: statoRef.current.elements.filter((e) => !(isTableRef(e) && e.tableId === tableId)),
        tables: statoRef.current.tables.filter((t) => t.id !== tableId),
      });
      setSelectedIds((prev) => {
        if (!prev.has(tableId)) return prev;
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
      // Il server l'ha tolto anche dalle unioni: si rileggono da lì.
      void ricaricaUnioni();
      return true;
    },
    [history, ricaricaUnioni],
  );

  /* ─────────────────────── trascinamento ─────────────────────── */

  function rettangoloTavolo(t: TavoloLocale): Rettangolo {
    const d = dimensioneDisegnata(t);
    return { x: t.posX, y: t.posY, w: d.w, h: d.h };
  }

  /**
   * Il rettangolo con cui un oggetto della piantina partecipa alla calamita,
   * o null se non ne ha uno sensato.
   *
   * Muri e divisori hanno la loro calamita (i capi, vedi `aggancio.ts`), e
   * porte e finestre cercano il muro, non i vicini. Un oggetto ruotato di un
   * angolo che non sia un multiplo di 90° non ha bordi dritti da allineare:
   * una guida orizzontale su un rettangolo storto mentirebbe.
   */
  function rettangoloElemento(el: RoomElement): Rettangolo | null {
    if (isTableRef(el) || isSegment(el) || el.type === "DOOR" || el.type === "WINDOW") return null;
    let r: Rettangolo;
    if (el.type === "TEXT") {
      // Il testo è centrato sul suo punto; la larghezza è la stessa stima
      // che usa il riquadro di selezione nel disegno.
      const w = el.text.length * el.fontSize * 0.64;
      r = { x: el.x - w / 2, y: el.y - el.fontSize / 2, w, h: el.fontSize };
    } else if ("height" in el) {
      r = { x: el.x, y: el.y, w: el.width, h: el.height };
    } else {
      return null;
    }
    const giro = ((el.rotation % 180) + 180) % 180;
    if (giro === 0) return r;
    if (giro !== 90) return null;
    // Ruotato di 90° attorno al centro: larghezza e altezza si scambiano.
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return { x: cx - r.h / 2, y: cy - r.w / 2, w: r.h, h: r.w };
  }

  /** Tutti gli oggetti a cui ci si può allineare, tranne `id`. Le aree
   * guardano solo la struttura: un magnete forte che tira una cucina verso
   * i tavoli la incollerebbe al primo che passa. */
  function rettangoliVicini(id: string, conTavoli: boolean): Rettangolo[] {
    const stato = statoRef.current;
    const elementi = stato.elements
      .filter((x) => x.id !== id)
      .map(rettangoloElemento)
      .filter((r): r is Rettangolo => r !== null);
    if (!conTavoli) return elementi;
    const tavoli = stato.tables.filter((t) => t.id !== id && idPosizionati.has(t.id)).map(rettangoloTavolo);
    return [...elementi, ...tavoli];
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
      if (!t || eBloccato(id)) return;
      const baseX = t.posX;
      const baseY = t.posY;
      const misura = dimensioneDisegnata(t);
      // I tavoli uniti a questo si muovono con lui: sono attaccati, e
      // spostarne uno solo li staccherebbe. Alt sposta solo questo.
      const compagni = compagniDiUnione(id);
      const basiCompagni = new Map(
        statoRef.current.tables.filter((x) => compagni.has(x.id)).map((x) => [x.id, { x: x.posX, y: x.posY }]),
      );
      const altriTavoli = statoRef.current.tables.filter((x) => x.id !== id && idPosizionati.has(x.id));
      // Fra tavoli della stessa unione lo spazio di passaggio non vale: sono
      // accostati apposta, e nessuno ci deve passare in mezzo.
      const altriIngombriSeparati = altriTavoli.filter((x) => !compagni.has(x.id)).map(rettangoloIngombro);
      // Non solo gli altri tavoli: anche colonne, aree, elementi liberi e
      // testi. Un tavolo in fila con la colonna accanto è un allineamento
      // vero quanto uno in fila con un altro tavolo.
      const altri = rettangoliVicini(id, true);
      // Lo spazio di passaggio si misura sugli ingombri (piano + sedie), non
      // sui soli piani: un cameriere cammina fra le sedie tirate fuori, non
      // fra i bordi dei tavoli. Gli ingombri altrui non cambiano mentre si
      // trascina, quindi si calcolano una volta sola qui.
      const altriIngombri = altriTavoli.map(rettangoloIngombro);

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

          // Lo spazio minimo di passaggio invece non si disattiva mai, nemmeno
          // con Alt: è un vincolo fisico (come i muri), non un aggancio. Si
          // applica per ultimo, dopo l'eventuale aggancio: vince sempre lui.
          // Un compagno bloccato tiene ferma l'unione intera: spostarla
          // lo staccherebbe, e bloccato vuol dire che resta dov'è.
          const compagnoBloccato = [...basiCompagni.keys()].some(eBloccato);
          if (!ev.altKey && compagnoBloccato) return;
          const insieme = !ev.altKey && basiCompagni.size > 0;
          const ingombroCandidato = rettangoloIngombro({ ...t, posX: x, posY: y });
          const corretto = rispettaSpazioMinimo(
            ingombroCandidato,
            insieme ? altriIngombriSeparati : altriIngombri.filter((_, i) => !compagni.has(altriTavoli[i].id)),
            spazioMinimoAttuale(),
          );
          x += corretto.x - ingombroCandidato.x;
          y += corretto.y - ingombroCandidato.y;

          if (!insieme) {
            aggiornaTavolo(id, { posX: Math.round(x), posY: Math.round(y) });
            return;
          }
          const spostX = Math.round(x) - baseX;
          const spostY = Math.round(y) - baseY;
          history.setLive({
            ...statoRef.current,
            tables: statoRef.current.tables.map((x2) => {
              if (x2.id === id) return { ...x2, posX: baseX + spostX, posY: baseY + spostY, dirty: true };
              const base = basiCompagni.get(x2.id);
              return base ? { ...x2, posX: base.x + spostX, posY: base.y + spostY, dirty: true } : x2;
            }),
          });
        },
      });
    },
    [trascina, aggiornaTavolo, idPosizionati, spazioMinimoAttuale, history],
  );

  /** I tavoli sulla piantina che stanno in un'unione con `id`. */
  function compagniDiUnione(id: string): Set<string> {
    const compagni = new Set<string>();
    for (const u of unioniRef.current) {
      if (!u.tableIds.includes(id)) continue;
      for (const altro of u.tableIds) if (altro !== id && idPosizionati.has(altro)) compagni.add(altro);
    }
    return compagni;
  }

  /**
   * Accostare i tavoli di un'unione: in fila, piano contro piano.
   *
   * La fila corre sull'asse in cui i tavoli sono già più sparsi — chi li ha
   * messi in orizzontale li ritrova in orizzontale — e parte dal primo, che
   * resta fermo. Si ragiona sui centri e sulla mezza misura del piano lungo
   * l'asse, così un tavolo girato di 90° si accosta col lato giusto.
   * Le sedie che finirebbero sotto il vicino non si disegnano (vedi
   * `sedieCoperte`).
   */
  const accostaTavoli = useCallback(
    (ids: string[]) => {
      const tavoli = ids
        .map((tid) => statoRef.current.tables.find((t) => t.id === tid))
        .filter((t): t is TavoloLocale => !!t && idPosizionati.has(t.id));
      if (tavoli.length < 2) return;
      const centro = (t: TavoloLocale) => {
        const imp = improntaTavolo(t);
        return { x: t.posX + imp.w / 2, y: t.posY + imp.h / 2 };
      };
      const mezzo = (t: TavoloLocale, asse: "x" | "y") => {
        const p = dimensioneDisegnata(t);
        const girato = ((((t.rotation ?? 0) % 180) + 180) % 180) === 90;
        const lungoX = girato ? p.h : p.w;
        const lungoY = girato ? p.w : p.h;
        return (asse === "x" ? lungoX : lungoY) / 2;
      };
      const centri = tavoli.map(centro);
      const spread = (k: "x" | "y") => Math.max(...centri.map((c) => c[k])) - Math.min(...centri.map((c) => c[k]));
      const asse: "x" | "y" = spread("x") >= spread("y") ? "x" : "y";
      const ordinati = [...tavoli].sort((a, b) => centro(a)[asse] - centro(b)[asse]);

      const primo = centro(ordinati[0]);
      const nuovi = new Map<string, { posX: number; posY: number }>();
      let fronte = primo[asse] + mezzo(ordinati[0], asse);
      for (const t of ordinati.slice(1)) {
        const imp = improntaTavolo(t);
        const c = fronte + mezzo(t, asse);
        fronte = c + mezzo(t, asse);
        const cx = asse === "x" ? c : primo.x;
        const cy = asse === "y" ? c : primo.y;
        nuovi.set(t.id, { posX: Math.round(cx - imp.w / 2), posY: Math.round(cy - imp.h / 2) });
      }
      history.commit(statoRef.current, {
        ...statoRef.current,
        tables: statoRef.current.tables.map((t) => {
          const n = nuovi.get(t.id);
          return n ? { ...t, ...n, dirty: true } : t;
        }),
      });
    },
    [history, idPosizionati],
  );

  const ruotaTavolo = useCallback(
    (id: string, e: React.PointerEvent) => {
      const t = statoRef.current.tables.find((x) => x.id === id);
      const rect = camera.viewportRef.current?.getBoundingClientRect();
      if (!t || !rect || eBloccato(id)) return;
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
          // Vicino a 0°, 45°, 90°… il tavolo ci si mette da solo: una sala
          // dove ogni tavolo è storto di tre gradi diversi è un disegno
          // mosso. Ma è una calamita, non uno scatto: fuori dalla soglia
          // l'angolo è libero. Alt (o Shift) la spegne del tutto.
          if (!ev.altKey && !ev.shiftKey) gradi = calamitaAngolo(gradi);
          gradi = ((Math.round(gradi) % 360) + 360) % 360;
          aggiornaTavolo(id, { rotation: gradi });
        },
      });
    },
    [camera, trascina, aggiornaTavolo],
  );

  const spostaElemento = useCallback(
    (id: string, e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el || el.locked || (el.type === "WALL" && eBloccato(id))) return;
      const iniziale = { ...el } as RoomElement;
      // Le aree (Cucina, Bancone, Bagno…) si agganciano come un magnete,
      // con una soglia molto più larga di quella dei tavoli: un blocco vicino
      // a un muro deve incollarcisi, non solo sfiorarlo. Colonne, elementi
      // liberi e testi hanno una calamita media. Alt la spegne per tutti.
      const area = isArea(iniziale);
      const vicini = "x" in iniziale ? rettangoliVicini(id, !area) : [];
      const soglie = area
        ? { bordo: SOGLIA_MAGNETE_PX, muro: SOGLIA_MAGNETE_MURO_PX }
        : { bordo: SOGLIA_CALAMITA_PX, muro: SOGLIA_CALAMITA_MURO_PX };
      const rettangolo0 = rettangoloElemento(iniziale);
      const muri = statoRef.current.elements.filter(isWall);

      // Una parete si porta dietro il suo tracciato: la stanza si sposta
      // intera, invece di perdere un muro per strada.
      const tracciato =
        iniziale.type === "WALL"
          ? statoRef.current.elements.filter(isSegment).filter((m) => membriDi(id).includes(m.id))
          : [];
      const idTracciato = new Set(tracciato.map((m) => m.id));
      const altriCapi =
        "startX" in iniziale
          ? statoRef.current.elements
              .filter(isSegment)
              .filter((m) => m.id !== id && !idTracciato.has(m.id))
              .flatMap((m) => [
                { x: m.startX, y: m.startY },
                { x: m.endX, y: m.endY },
              ])
          : [];

      trascina(e, {
        onMuovi: (dx, dy, ev) => {
          if ("startX" in iniziale) {
            // Un muro spostato intero si incolla col suo capo al capo di un
            // altro, così due pareti si toccano invece di sfiorarsi. Alt lo
            // lascia dove lo si porta.
            if (!ev.altKey) {
              const extra = calamitaLinea(
                [
                  { x: iniziale.startX + dx, y: iniziale.startY + dy },
                  { x: iniziale.endX + dx, y: iniziale.endY + dy },
                ],
                altriCapi,
              );
              dx += extra.x;
              dy += extra.y;
            }
            if (tracciato.length > 1) {
              const basi = new Map(tracciato.map((m) => [m.id, m]));
              history.setLive({
                ...statoRef.current,
                elements: statoRef.current.elements.map((x) => {
                  const b = basi.get(x.id);
                  return b
                    ? ({
                        ...x,
                        startX: Math.round(b.startX + dx),
                        startY: Math.round(b.startY + dy),
                        endX: Math.round(b.endX + dx),
                        endY: Math.round(b.endY + dy),
                      } as RoomElement)
                    : x;
                }),
              });
              return;
            }
            aggiornaElemento(id, {
              startX: Math.round(iniziale.startX + dx),
              startY: Math.round(iniziale.startY + dy),
              endX: Math.round(iniziale.endX + dx),
              endY: Math.round(iniziale.endY + dy),
            } as Partial<RoomElement>);
          } else if (iniziale.type === "DOOR" || iniziale.type === "WINDOW") {
            // Porte e finestre cercano il muro anche quando si spostano, non
            // solo quando nascono: ci scivolano sopra e ne prendono l'angolo.
            // Portate lontano dal muro restano dove sono, staccate. Il verso
            // (da che parte si apre la porta) resta quello che era.
            const punto = { x: iniziale.x + dx, y: iniziale.y + dy };
            const sulMuro = ev.altKey ? null : snapPointToWalls(punto, muri);
            aggiornaElemento(id, {
              x: Math.round(sulMuro?.point.x ?? punto.x),
              y: Math.round(sulMuro?.point.y ?? punto.y),
              wallId: sulMuro?.wallId ?? null,
              rotation: sulMuro ? versoTenuto(sulMuro.angle, iniziale.rotation) : iniziale.rotation,
            } as Partial<RoomElement>);
          } else if ("x" in iniziale) {
            let x = iniziale.x + dx;
            let y = iniziale.y + dy;
            if (rettangolo0 && !ev.altKey) {
              const g = calcolaGuide(
                { ...rettangolo0, x: rettangolo0.x + dx, y: rettangolo0.y + dy },
                vicini,
                statoRef.current.elements,
                soglie,
              );
              x += g.dx;
              y += g.dy;
              setGuide(g.guide);
            } else {
              setGuide([]);
            }
            aggiornaElemento(id, {
              x: Math.round(x),
              y: Math.round(y),
            } as Partial<RoomElement>);
          }
        },
      });
    },
    [trascina, aggiornaElemento, idPosizionati, history],
  );

  const ridimensionaElemento = useCallback(
    (id: string, e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el || !("width" in el) || el.locked) return;
      const larghezza0 = el.width;
      const altezza0 = "height" in el ? el.height : 0;
      // Il bordo che si tira si aggancia agli altri oggetti e ai muri, come
      // quando si sposta. Solo per i rettangoli dritti: ruotato, il bordo
      // sotto la maniglia non è più né destro né in basso.
      const dritto = "height" in el && "rotation" in el && ((el.rotation % 360) + 360) % 360 === 0;
      const vicini = dritto ? rettangoliVicini(id, !isArea(el)) : [];
      const soglie = isArea(el)
        ? { bordo: SOGLIA_MAGNETE_PX, muro: SOGLIA_MAGNETE_MURO_PX }
        : { bordo: SOGLIA_CALAMITA_PX, muro: SOGLIA_CALAMITA_MURO_PX };

      trascina(e, {
        onMuovi: (dx, dy, ev) => {
          let w = Math.max(20, larghezza0 + dx);
          let h = Math.max(20, altezza0 + dy);
          if (dritto && "x" in el && !ev.altKey) {
            const g = calcolaGuideBordi({ x: el.x, y: el.y, w, h }, vicini, statoRef.current.elements, soglie);
            w = Math.max(20, w + g.dw);
            h = Math.max(20, h + g.dh);
            setGuide(g.guide);
          } else {
            setGuide([]);
          }
          const patch: Record<string, number> = { width: Math.round(w) };
          if ("height" in el) patch.height = Math.round(h);
          aggiornaElemento(id, patch as Partial<RoomElement>);
        },
      });
    },
    [trascina, aggiornaElemento, idPosizionati],
  );

  /**
   * Allungare una porta o una finestra tirandone un capo (`lato`: -1 il
   * sinistro, 1 il destro, nel verso dell'apertura).
   *
   * Il capo opposto resta fermo e il centro scivola lungo l'asse della
   * finestra: è quello che si aspetta chi tira una maniglia, e la finestra
   * resta sul muro perché l'asse è il muro. Il capo tirato si aggancia ai
   * capi del muro e delle altre aperture sullo stesso muro, così una
   * finestra arriva esattamente all'angolo o accanto a un'altra; Alt lo
   * lascia libero.
   */
  const allungaApertura = useCallback(
    (id: string, lato: -1 | 1, e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el || (el.type !== "WINDOW" && el.type !== "DOOR") || el.locked) return;
      const rad = (el.rotation * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const fisso = { x: el.x - lato * ux * (el.width / 2), y: el.y - lato * uy * (el.width / 2) };
      const capo0 = { x: el.x + lato * ux * (el.width / 2), y: el.y + lato * uy * (el.width / 2) };
      // I punti a cui il capo tirato si aggancia, misurati come distanza
      // lungo l'asse dal capo fermo.
      const muro = el.wallId ? statoRef.current.elements.find((x) => x.id === el.wallId) : undefined;
      const punti: Point[] = [];
      if (muro && isWall(muro)) {
        punti.push({ x: muro.startX, y: muro.startY }, { x: muro.endX, y: muro.endY });
      }
      for (const altra of statoRef.current.elements) {
        if (altra.id === id || (altra.type !== "WINDOW" && altra.type !== "DOOR")) continue;
        if (!el.wallId || altra.wallId !== el.wallId) continue;
        const r = (altra.rotation * Math.PI) / 180;
        const m = altra.width / 2;
        punti.push({ x: altra.x - Math.cos(r) * m, y: altra.y - Math.sin(r) * m });
        punti.push({ x: altra.x + Math.cos(r) * m, y: altra.y + Math.sin(r) * m });
      }
      const distanze = punti
        .map((p) => ((p.x - fisso.x) * ux + (p.y - fisso.y) * uy) * lato)
        .filter((d) => d > 0);

      trascina(e, {
        onMuovi: (dx, dy, ev) => {
          let larghezza = ((capo0.x + dx - fisso.x) * ux + (capo0.y + dy - fisso.y) * uy) * lato;
          if (!ev.altKey) {
            let migliore = SOGLIA_CALAMITA_MURO_PX;
            for (const d of distanze) {
              if (Math.abs(d - larghezza) < migliore) {
                migliore = Math.abs(d - larghezza);
                larghezza = d;
              }
            }
          }
          // I limiti sono quelli dello schema: sotto i 10 px non si afferra
          // più, sopra i 400 il salvataggio la rifiuterebbe.
          larghezza = Math.max(10, Math.min(400, larghezza));
          aggiornaElemento(id, {
            width: Math.round(larghezza),
            x: Math.round(fisso.x + lato * ux * (larghezza / 2)),
            y: Math.round(fisso.y + lato * uy * (larghezza / 2)),
          } as Partial<RoomElement>);
        },
      });
    },
    [trascina, aggiornaElemento],
  );

  const spostaEstremo = useCallback(
    (id: string, estremo: "start" | "end", e: React.PointerEvent) => {
      const el = statoRef.current.elements.find((x) => x.id === id);
      if (!el || !("startX" in el) || el.locked || (el.type === "WALL" && eBloccato(id))) return;
      const x0 = estremo === "start" ? el.startX : el.endX;
      const y0 = estremo === "start" ? el.startY : el.endY;
      // L'altro capo resta fermo: è il perno attorno a cui la linea gira.
      const fisso = estremo === "start" ? { x: el.endX, y: el.endY } : { x: el.startX, y: el.startY };
      // L'angolo è condiviso: i muri del tracciato che hanno un capo proprio
      // qui lo seguono, così la stanza resta chiusa mentre la si allarga.
      const angolo = { x: x0, y: y0 };
      const condivisi =
        el.type === "WALL"
          ? statoRef.current.elements
              .filter(isSegment)
              .filter((m) => m.id !== id && membriDi(id).includes(m.id))
              .flatMap((m) => [
                ...(stessoPunto({ x: m.startX, y: m.startY }, angolo) ? [{ id: m.id, capo: "start" as const }] : []),
                ...(stessoPunto({ x: m.endX, y: m.endY }, angolo) ? [{ id: m.id, capo: "end" as const }] : []),
              ])
          : [];
      const idCondivisi = new Set(condivisi.map((c) => c.id));
      // Chi si muove con l'angolo non può fargli da calamita: lo terrebbe
      // incollato dov'era.
      const altriCapi = statoRef.current.elements
        .filter(isSegment)
        .filter((x) => x.id !== id)
        .flatMap((x) => [
          ...(idCondivisi.has(x.id) && condivisi.some((c) => c.id === x.id && c.capo === "start")
            ? []
            : [{ x: x.startX, y: x.startY }]),
          ...(idCondivisi.has(x.id) && condivisi.some((c) => c.id === x.id && c.capo === "end")
            ? []
            : [{ x: x.endX, y: x.endY }]),
        ]);
      const altreLinee = statoRef.current.elements
        .filter(isSegment)
        .filter((x) => x.id !== id && !idCondivisi.has(x.id))
        .map((x) => ({ a: { x: x.startX, y: x.startY }, b: { x: x.endX, y: x.endY } }));

      trascina(e, {
        onMuovi: (dx, dy, ev) => {
          // La linea è attirata verso orizzontale, verticale e 45°, e il capo
          // verso i capi degli altri muri. Fuori dalle soglie va dove la si
          // porta; con Alt va dove la si porta sempre.
          const grezzo = { x: x0 + dx, y: y0 + dy };
          const p = ev.altKey ? grezzo : calamitaCapo(fisso, grezzo, altriCapi, altreLinee);
          const px = Math.round(p.x);
          const py = Math.round(p.y);
          const capoNuovo = (capo: "start" | "end") =>
            capo === "start" ? { startX: px, startY: py } : { endX: px, endY: py };
          if (condivisi.length === 0) {
            aggiornaElemento(id, capoNuovo(estremo) as Partial<RoomElement>);
            return;
          }
          history.setLive({
            ...statoRef.current,
            elements: statoRef.current.elements.map((x) => {
              if (x.id === id) return { ...x, ...capoNuovo(estremo) } as RoomElement;
              const suoi = condivisi.filter((c) => c.id === x.id);
              if (suoi.length === 0) return x;
              return suoi.reduce((acc, c) => ({ ...acc, ...capoNuovo(c.capo) }) as RoomElement, x);
            }),
          });
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trascina, aggiornaElemento, history],
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
              chairSides: t.chairSides,
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
    } catch (err) {
      // Una rete che cade a metà salvataggio (server riavviato, tab offline
      // un attimo) non deve far sparire la pagina intera dietro una
      // schermata rossa: il salvataggio fallisce, l'utente riprova — non
      // perde il lavoro fatto, che resta nella storia dell'editor.
      console.error("Salvataggio sala non riuscito:", err);
      return "errore";
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
      // Copia e incolla. Se non c'è niente di selezionato Cmd+C non si
      // intercetta: resta quello del browser.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "c" || e.key === "C")) {
        const copiati = copia();
        if (copiati > 0) {
          e.preventDefault();
          onAvvisoRef.current?.(
            copiati === 1 ? "Copiato: Cmd/Ctrl+V per incollare." : `${copiati} oggetti copiati: Cmd/Ctrl+V per incollare.`,
            "fatto",
          );
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "v" || e.key === "V")) {
        if (appuntiRef.current) {
          e.preventDefault();
          void incolla();
        }
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
        // Una parete selezionata si porta dietro il suo tracciato, come col
        // mouse.
        const daMuovere = new Set<string>();
        for (const id of Array.from(selectedIds)) for (const m of membriDi(id)) daMuovere.add(m);
        for (const id of Array.from(daMuovere)) {
          if (idBloccati.has(id)) continue;
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
  }, [abilitato, selectedIds, deseleziona, eliminaSelezione, history, idBloccati, copia, incolla]);

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
    predefiniti,
    ricaricaPredefiniti,
    unioni,
    creaUnione,
    separaUnione,
    accostaTavoli,
    eliminaSelezione,
    eliminaTavoloDavvero,
    sostituisciPiantina,
    cambiaLayer,
    cambiaMeta,
    cambiaInventario,

    // interazione
    spostaTavolo,
    ruotaTavolo,
    spostaElemento,
    ridimensionaElemento,
    spostaEstremo,
    idBloccati,
    bloccaOggetto,
    allungaApertura,
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

/** L'angolo del muro, o il suo opposto: dei due quello più vicino a come
 * l'apertura era girata. Un muro non ha un verso, una porta sì. */
function versoTenuto(angoloMuro: number, rotazione: number) {
  const distanza = (a: number) => Math.abs(((a - rotazione + 540) % 360) - 180);
  const opposto = angoloMuro + 180;
  return Math.round(((distanza(angoloMuro) <= distanza(opposto) ? angoloMuro : opposto) % 360 + 360) % 360);
}

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
