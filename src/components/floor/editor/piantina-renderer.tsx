"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  AREA_LABELS,
  boundingBox,
  isArea,
  isSegment,
  isColumn,
  isDivider,
  isDoor,
  isFree,
  isChair,
  isText,
  isWall,
  isWindow,
  wallPolygon,
  type AreaElement,
  type ColumnElement,
  type DividerElement,
  type DoorElement,
  type FreeElement,
  type RoomElement,
  type RoomLayers,
  type TextElement,
  type WallElement,
  type WindowElement,
} from "@/lib/room-layout";

/**
 * La piantina disegnata.
 *
 * È la differenza fra «una griglia beige con dei tavoli sopra» e «la pianta
 * del mio locale». Quattro scelte la reggono, e nessuna è decorativa:
 *
 * **Il pavimento è un poligono, non un rettangolo.** Riempire il riquadro di
 * ingombro fa spuntare il legno fuori dai muri in ogni sala che non sia un
 * rettangolo perfetto — e quasi nessuna lo è. Quando i muri chiudono un
 * anello si riempie quello.
 *
 * **I muri hanno uno spessore e un'ombra, non un tratto.** Un muro disegnato
 * come linea è un disegno tecnico; un muro disegnato come volume scuro che
 * proietta ombra sul pavimento è una stanza vista dall'alto. È tutta la
 * distanza fra le due schermate.
 *
 * **Gli ambienti sono pavimenti, non riquadri colorati.** Nella reference la
 * cucina non è un rettangolo verde trasparente: è un pezzo di pavimento più
 * chiaro con scritto CUCINA sopra. Una tinta piatta sopra il legno si legge
 * come un adesivo appiccicato alla piantina.
 *
 * **Niente fotorealismo.** Nessuna texture importata, nessun rumore: solo
 * gradienti deterministici, perché questa cosa si disegna cinquanta volte
 * mentre si trascina un tavolo e perché server e client devono produrre lo
 * stesso markup (un `feTurbulence` con seed casuale non lo fa).
 */

export type ElementoInterazione = {
  selectedIds: ReadonlySet<string>;
  onSelezione: (id: string, additivo: boolean) => void;
  onInizioSpostamento: (id: string, e: React.PointerEvent) => void;
  onInizioRidimensiona?: (id: string, e: React.PointerEvent) => void;
  onInizioEstremo?: (id: string, estremo: "start" | "end", e: React.PointerEvent) => void;
  /** Gli oggetti bloccati (per un muro, tutto il suo tracciato). */
  bloccati?: ReadonlySet<string>;
  /** Allungare una porta o una finestra tirandone un capo: l'altro capo
   * resta fermo. */
  onInizioAllunga?: (id: string, lato: -1 | 1, e: React.PointerEvent) => void;
};

/* Muri e divisori leggono token: al buio i grigi di prima, sulla carta
   --room-wall. Vedi globals.css. */
const MURO_FACCIA = "var(--room-wall-face)";
const MURO_CIMA = "var(--room-wall-top)";
const MURO_OMBRA = "var(--room-wall-shadow)";
const DIVISORIO_FACCIA = "var(--room-divider)";

/** Il pavimento di ogni ambiente. Non tinte, **legni e cementi**: il locale è
 * un posto fisico, e la cucina ha un pavimento diverso dalla sala perché ce
 * l'ha davvero. */
const PAVIMENTO_AREA: Record<string, { fill: string; label: string }> = {
  AREA_ZONE: { fill: "url(#pav-legno-chiaro)", label: "#3B2A17" },
  AREA_KITCHEN: { fill: "var(--room-floor-cucina)", label: "var(--room-label-cucina)" },
  AREA_BAR: { fill: "#C9C3B6", label: "var(--room-label-bancone)" },
  AREA_WC: { fill: "#DCD8CF", label: "#4A4238" },
  AREA_STORAGE: { fill: "#D3CDBF", label: "#4A4238" },
  AREA_PRIVATE: { fill: "url(#pav-legno-scuro)", label: "#3B2A17" },
  AREA_ENTRANCE: { fill: "rgba(210,188,150,0.55)", label: "#3B2A17" },
  AREA_TERRACE: { fill: "var(--room-floor-dehors)", label: "var(--room-label-dehors)" },
  AREA_STAIRS: { fill: "#CFC9BC", label: "#40382D" },
};

/** Il testo delle aree sulla piantina: chiaro su legno scuro non si legge e
 * scuro su legno chiaro sì, quindi il colore lo decide il pavimento. */
function coloreEtichettaArea(type: string) {
  return PAVIMENTO_AREA[type]?.label ?? "#3B2A17";
}

function fillArea(type: string) {
  return PAVIMENTO_AREA[type]?.fill ?? "#D8D3C7";
}

export const PiantinaRenderer = memo(function PiantinaRenderer({
  elements,
  width,
  height,
  layers,
  interazione,
  className,
}: {
  elements: RoomElement[];
  width: number;
  height: number;
  layers: RoomLayers;
  /** Presente solo in modifica: rende gli elementi selezionabili e
   * trascinabili. In anteprima e nel Servizio non si passa, e la piantina
   * torna a essere un disegno. */
  interazione?: ElementoInterazione;
  /** Per chi la incastona in un contenitore che decide lui la scala — la
   * mappa del Servizio si disegna a percentuale. Il `viewBox` fa il resto. */
  className?: string;
}) {
  const modificabile = Boolean(interazione);

  const muri = useMemo(() => elements.filter(isWall), [elements]);
  const divisori = useMemo(() => elements.filter(isDivider), [elements]);
  const aree = useMemo(() => elements.filter(isArea), [elements]);
  const colonne = useMemo(() => elements.filter(isColumn), [elements]);
  const porte = useMemo(() => elements.filter(isDoor), [elements]);
  const finestre = useMemo(() => elements.filter(isWindow), [elements]);
  const testi = useMemo(() => elements.filter(isText), [elements]);
  const liberi = useMemo(() => elements.filter(isFree), [elements]);
  const sedie = useMemo(() => elements.filter(isChair), [elements]);

  const poligono = useMemo(() => wallPolygon(elements), [elements]);
  const puntiPoligono = useMemo(() => (poligono ?? []).map((p) => `${p.x},${p.y}`).join(" "), [poligono]);
  const ingombroMuri = useMemo(() => (muri.length > 0 ? boundingBox(muri) : null), [muri]);

  const selezionato = (id: string) => interazione?.selectedIds.has(id) ?? false;
  // Un elemento bloccato si seleziona (per sbloccarlo serve) ma non riceve le
  // funzioni delle maniglie, e una maniglia senza funzione non si disegna:
  // ci sarebbe e non farebbe niente.
  const seLibero = <F,>(el: RoomElement, f: F | undefined) =>
    el.locked || interazione?.bloccati?.has(el.id) ? undefined : f;
  /** Stesso elenco, con i selezionati in fondo (cioè disegnati sopra). */
  const primaISelezionati = <T extends RoomElement>(lista: T[]) =>
    [...lista].sort((a, b) => Number(selezionato(a.id)) - Number(selezionato(b.id)));

  /**
   * Chi prende il clic quando un muro e un oggetto si sovrappongono.
   *
   * I muri sono disegnati sopra aree, sedie ed elementi liberi, quindi dove
   * si toccano il clic finiva sul muro: si voleva spostare la sedia e si
   * spostava la stanza. Qui, premendo su un muro, si guarda cosa c'è sotto il
   * puntatore: un oggetto (sedia, colonna, elemento libero, testo) vince
   * sempre; un'area vince solo se il muro è bloccato — un muro che attraversa
   * una zona deve restare selezionabile, ma uno bloccato non ha niente da
   * fare con un clic, e quel clic era per l'area.
   */
  function bersaglioSotto(id: string, e: React.PointerEvent): string {
    const el = elements.find((x) => x.id === id);
    if (!el || !isSegment(el)) return id;
    const muroBloccato = interazione?.bloccati?.has(id) ?? false;
    for (const nodo of document.elementsFromPoint(e.clientX, e.clientY)) {
      const altroId = (nodo as HTMLElement).dataset?.elementoId;
      if (!altroId || altroId === id) continue;
      const altro = elements.find((x) => x.id === altroId);
      if (!altro || isSegment(altro)) continue;
      if (isArea(altro) && !muroBloccato) continue;
      return altroId;
    }
    return id;
  }

  function propsCorpo(id: string) {
    if (!interazione) return {};
    return {
      "data-elemento-id": id,
      onPointerDown: (e: React.PointerEvent) => {
        e.stopPropagation();
        const scelto = bersaglioSotto(id, e);
        interazione.onSelezione(scelto, e.shiftKey);
        interazione.onInizioSpostamento(scelto, e);
      },
      className: "cursor-move",
    };
  }

  return (
    <svg
      className={cn(
        "absolute left-0 top-0 overflow-visible",
        !modificabile && "pointer-events-none",
        className,
      )}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden={modificabile ? undefined : true}
    >
      <defs>
        {/* Il legno: due gradienti e due righe di fughe. Deterministico, quindi
            identico sul server e nel browser. */}
        <linearGradient id="pav-legno" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--floor-wood-1)" }} />
          <stop offset="55%" style={{ stopColor: "var(--floor-wood-2)" }} />
          <stop offset="100%" style={{ stopColor: "var(--floor-wood-3)" }} />
        </linearGradient>
        <linearGradient id="pav-legno-chiaro" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#E6CCA4" />
          <stop offset="100%" stopColor="#D2AE7C" />
        </linearGradient>
        <linearGradient id="pav-legno-scuro" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#B08551" />
          <stop offset="100%" stopColor="#956C3E" />
        </linearGradient>
        <pattern id="doghe" width="1" height="86" patternUnits="userSpaceOnUse">
          <rect width="1" height="86" style={{ fill: "var(--floor-doghe)" }} />
        </pattern>
        <linearGradient id="bancone-piano" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--room-bancone-1)" }} />
          <stop offset="100%" style={{ stopColor: "var(--room-bancone-2)" }} />
        </linearGradient>
        <filter id="ombra-morbida" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1A1006" floodOpacity="0.28" />
        </filter>
      </defs>

      {/* ── PAVIMENTO ────────────────────────────────────────────────── */}
      {poligono ? (
        <>
          <clipPath id="clip-pavimento">
            <polygon points={puntiPoligono} />
          </clipPath>
          <polygon points={puntiPoligono} fill="url(#pav-legno)" />
          <polygon points={puntiPoligono} fill="url(#doghe)" opacity={0.5} />
          {/*
            L'ombra che i muri proiettano **verso l'interno**.

            È il segno che fa leggere la stanza come scavata invece che
            disegnata, ed è un contorno sfocato ritagliato sul pavimento: senza
            il ritaglio la sfocatura esce dai muri e alona sul verde attorno,
            che è l'aspetto opposto — una macchia appoggiata sopra la piantina
            invece di una parete che ferma la luce.
          */}
          <polygon
            points={puntiPoligono}
            fill="none"
            style={{ stroke: "var(--floor-ombra-muri)", filter: "blur(10px)", pointerEvents: "none" }}
            strokeWidth={22}
            clipPath="url(#clip-pavimento)"
          />
        </>
      ) : (
        ingombroMuri && (
          <rect
            x={ingombroMuri.minX}
            y={ingombroMuri.minY}
            width={Math.max(0, ingombroMuri.maxX - ingombroMuri.minX)}
            height={Math.max(0, ingombroMuri.maxY - ingombroMuri.minY)}
            fill="url(#pav-legno)"
            rx={4}
          />
        )
      )}

      {/* ── AREE ─────────────────────────────────────────────────────── */}
      {layers.areas &&
        aree.map((el) => (
          <FormaArea
            key={el.id}
            el={el}
            selezionato={selezionato(el.id)}
            modificabile={modificabile}
            propsCorpo={propsCorpo(el.id)}
            onRidimensiona={seLibero(el, interazione?.onInizioRidimensiona)}
            mostraEtichetta={layers.texts}
          />
        ))}

      {/* ── SEDIE SINGOLE ────────────────────────────────────────────── */}
      {/* Stanno col livello dei tavoli: sono arredo da sedersi, e chi spegne
          i tavoli per guardare i muri non le vuole sparse sulla pianta. */}
      {layers.tables &&
        sedie.map((el) => (
          <FormaSedia key={el.id} el={el} selezionato={selezionato(el.id)} propsCorpo={propsCorpo(el.id)} />
        ))}

      {/* ── ELEMENTI LIBERI ──────────────────────────────────────────── */}
      {layers.structure &&
        liberi.map((el) => (
          <FormaLibera
            key={el.id}
            el={el}
            selezionato={selezionato(el.id)}
            modificabile={modificabile}
            propsCorpo={propsCorpo(el.id)}
            onRidimensiona={seLibero(el, interazione?.onInizioRidimensiona)}
          />
        ))}

      {/* ── STRUTTURA ────────────────────────────────────────────────── */}
      {layers.structure && (
        <>
          {/* Il selezionato si disegna per ultimo: le maniglie dei suoi capi
              stanno sopra i muri vicini, altrimenti chi preme sull'angolo
              prende il corpo del muro accanto e sposta tutta la stanza. */}
          {primaISelezionati(divisori).map((el) => (
            <FormaSegmento
              key={el.id}
              el={el}
              tipo="divisorio"
              selezionato={selezionato(el.id)}
              modificabile={modificabile}
              propsCorpo={propsCorpo(el.id)}
              onEstremo={seLibero(el, interazione?.onInizioEstremo)}
            />
          ))}
          {primaISelezionati(muri).map((el) => (
            <FormaSegmento
              key={el.id}
              el={el}
              tipo="muro"
              selezionato={selezionato(el.id)}
              modificabile={modificabile}
              propsCorpo={propsCorpo(el.id)}
              onEstremo={seLibero(el, interazione?.onInizioEstremo)}
            />
          ))}
          {colonne.map((el) => (
            <FormaColonna
              key={el.id}
              el={el}
              selezionato={selezionato(el.id)}
              modificabile={modificabile}
              propsCorpo={propsCorpo(el.id)}
              onRidimensiona={seLibero(el, interazione?.onInizioRidimensiona)}
            />
          ))}
          {finestre.map((el) => (
            <FormaApertura
              key={el.id}
              el={el}
              tipo="finestra"
              selezionato={selezionato(el.id)}
              modificabile={modificabile}
              propsCorpo={propsCorpo(el.id)}
              onAllunga={seLibero(el, interazione?.onInizioAllunga)}
            />
          ))}
          {porte.map((el) => (
            <FormaApertura
              key={el.id}
              el={el}
              tipo="porta"
              selezionato={selezionato(el.id)}
              modificabile={modificabile}
              propsCorpo={propsCorpo(el.id)}
              onAllunga={seLibero(el, interazione?.onInizioAllunga)}
            />
          ))}
        </>
      )}

      {/* ── TESTI ────────────────────────────────────────────────────── */}
      {layers.texts &&
        testi.map((el) => (
          <FormaTesto
            key={el.id}
            el={el}
            selezionato={selezionato(el.id)}
            modificabile={modificabile}
            propsCorpo={propsCorpo(el.id)}
          />
        ))}
    </svg>
  );
});

type PropsCorpo = { onPointerDown?: (e: React.PointerEvent) => void; className?: string };

/* ─────────────────────────── AREE ─────────────────────────── */

function FormaArea({
  el,
  selezionato,
  modificabile,
  propsCorpo,
  onRidimensiona,
  mostraEtichetta,
}: {
  el: AreaElement;
  selezionato: boolean;
  modificabile: boolean;
  propsCorpo: PropsCorpo;
  onRidimensiona?: (id: string, e: React.PointerEvent) => void;
  mostraEtichetta: boolean;
}) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const etichetta = el.label || AREA_LABELS[el.type];
  // Il bancone non è un ambiente: è un oggetto alto, e si disegna come tale.
  const isBancone = el.type === "AREA_BAR";
  const isIngresso = el.type === "AREA_ENTRANCE";

  if (isIngresso) {
    return (
      <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
        <rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          rx={6}
          fill="rgba(226, 203, 163, 0.35)"
          stroke={selezionato ? "#B07A45" : "rgba(120, 84, 42, 0.35)"}
          strokeWidth={selezionato ? 2.5 : 1}
          {...propsCorpo}
        />
        {/* Il triangolo dell'ingresso, come sulle planimetrie vere. */}
        <polygon
          points={`${cx},${cy - el.height * 0.18} ${cx - el.width * 0.16},${cy + el.height * 0.14} ${cx + el.width * 0.16},${cy + el.height * 0.14}`}
          fill="#F2E7D0"
          stroke="rgba(60, 40, 18, 0.5)"
          strokeWidth={1}
          style={{ pointerEvents: "none" }}
        />
        {mostraEtichetta && (
          <EtichettaPiantina x={cx} y={el.y + el.height + 12} testo={etichetta} colore="#F2E7D0" />
        )}
        {modificabile && selezionato && onRidimensiona && (
          <Maniglia x={el.x + el.width} y={el.y + el.height} onPointerDown={(e) => onRidimensiona(el.id, e)} />
        )}
      </g>
    );
  }

  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rx={isBancone ? 5 : 2}
        fill={isBancone ? "url(#bancone-piano)" : fillArea(el.type)}
        stroke={selezionato ? "#B07A45" : isBancone ? "rgba(74, 48, 20, 0.55)" : "rgba(90, 70, 42, 0.18)"}
        strokeWidth={selezionato ? 2.5 : isBancone ? 1.5 : 1}
        filter={isBancone ? "url(#ombra-morbida)" : undefined}
        {...propsCorpo}
      />
      {isBancone && (
        // Il filo di luce sul bordo del bancone: è l'unico segno che lo
        // solleva dal pavimento senza disegnare una prospettiva.
        <rect
          x={el.x + 2}
          y={el.y + 2}
          width={Math.max(0, el.width - 4)}
          height={Math.min(8, el.height / 4)}
          rx={3}
          fill="rgba(255, 244, 222, 0.42)"
          style={{ pointerEvents: "none" }}
        />
      )}
      {mostraEtichetta && el.width > 44 && el.height > 22 && (
        <EtichettaPiantina x={cx} y={cy} testo={etichetta} colore={coloreEtichettaArea(el.type)} />
      )}
      {modificabile && selezionato && onRidimensiona && (
        <Maniglia x={el.x + el.width} y={el.y + el.height} onPointerDown={(e) => onRidimensiona(el.id, e)} />
      )}
    </g>
  );
}

/* ─────────────────────────── STRUTTURA ─────────────────────────── */

/** Il passo dello zig-zag del divisorio, in pixel del mondo: fitto, perché
 * deve leggersi come una trama (un separè, un graticcio) e non come un'onda. */
const DIVISORIO_PASSO = 7;

/**
 * Il divisorio è uno zig-zag fitto e basso fra i due capi, non una retta.
 *
 * Dritto e un po' più sottile era un muro sbiadito: sulla piantina non si
 * capiva quale dei due si attraversa con un vassoio. La trama dice «separè,
 * paravento, graticcio» senza bisogno di legenda. L'oscillazione sta dentro lo
 * spessore, così l'ingombro sulla pianta resta quello di prima.
 *
 * Le punte sono a metà di ogni passo e i passi sono un numero intero: lo
 * zig-zag parte e arriva **sui capi**, dove stanno le maniglie e dove si
 * aggancia un altro muro.
 */
function percorsoZigZag(x1: number, y1: number, x2: number, y2: number, ampiezza: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lunghezza = Math.hypot(dx, dy);
  if (lunghezza < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const passi = Math.max(2, Math.round(lunghezza / DIVISORIO_PASSO));
  const ux = dx / lunghezza;
  const uy = dy / lunghezza;
  // La normale: di quanto spostarsi per uscire dall'asse.
  const nx = -uy;
  const ny = ux;
  const passo = lunghezza / passi;
  let d = `M ${x1} ${y1}`;
  for (let i = 0; i < passi; i++) {
    const verso = i % 2 === 0 ? 1 : -1;
    const meta = passo * (i + 0.5);
    d += ` L ${(x1 + ux * meta + nx * ampiezza * verso).toFixed(1)} ${(y1 + uy * meta + ny * ampiezza * verso).toFixed(1)}`;
  }
  return `${d} L ${x2} ${y2}`;
}

function FormaSegmento({
  el,
  tipo,
  selezionato,
  modificabile,
  propsCorpo,
  onEstremo,
}: {
  el: WallElement | DividerElement;
  tipo: "muro" | "divisorio";
  selezionato: boolean;
  modificabile: boolean;
  propsCorpo: PropsCorpo;
  onEstremo?: (id: string, estremo: "start" | "end", e: React.PointerEvent) => void;
}) {
  const isMuro = tipo === "muro";
  const spessore = el.thickness;

  if (!isMuro) {
    // Punte e tratto insieme occupano lo spessore dichiarato, non di più.
    const ampiezza = Math.max(1.5, spessore * 0.3);
    const tratto = Math.max(2, spessore - ampiezza * 2);
    const d = percorsoZigZag(el.startX, el.startY, el.endX, el.endY, ampiezza);
    return (
      <g>
        <path
          d={d}
          transform="translate(0 2)"
          fill="none"
          stroke={MURO_OMBRA}
          strokeWidth={tratto}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
        {/* Un bersaglio dritto e trasparente sotto lo zig-zag: afferrare un
            tratto sottile e spezzato sarebbe una caccia al pixel. */}
        <line
          x1={el.startX}
          y1={el.startY}
          x2={el.endX}
          y2={el.endY}
          stroke="transparent"
          strokeWidth={Math.max(14, spessore + 8)}
          strokeLinecap="round"
          style={modificabile ? undefined : { pointerEvents: "none" }}
          {...propsCorpo}
        />
        <path
          d={d}
          fill="none"
          stroke={selezionato ? "#B07A45" : DIVISORIO_FACCIA}
          strokeWidth={tratto}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
        {modificabile && selezionato && onEstremo && (
          <>
            <Maniglia x={el.startX} y={el.startY} tonda onPointerDown={(e) => onEstremo(el.id, "start", e)} />
            <Maniglia x={el.endX} y={el.endY} tonda onPointerDown={(e) => onEstremo(el.id, "end", e)} />
          </>
        )}
      </g>
    );
  }

  return (
    <g>
      {/*
        L'ombra portata è una copia spostata in basso, non un `feDropShadow`.
        Il filtro usa il riquadro dell'oggetto come regione, e il riquadro di
        una linea perfettamente orizzontale è alto zero: in Chromium il muro
        spariva. Una copia spostata non ha casi degeneri.
      */}
      <line
        x1={el.startX}
        y1={el.startY + (isMuro ? 3 : 2)}
        x2={el.endX}
        y2={el.endY + (isMuro ? 3 : 2)}
        stroke={MURO_OMBRA}
        strokeWidth={spessore + (isMuro ? 2 : 0)}
        strokeLinecap="square"
        style={{ pointerEvents: "none" }}
      />
      <line
        x1={el.startX}
        y1={el.startY}
        x2={el.endX}
        y2={el.endY}
        stroke={selezionato ? "#B07A45" : isMuro ? MURO_FACCIA : DIVISORIO_FACCIA}
        strokeWidth={spessore}
        strokeLinecap="square"
        {...propsCorpo}
      />
      {/* La cima del muro: un filo più chiaro sul bordo alto. Due pixel che
          fanno la differenza fra «linea» e «volume». */}
      <line
        x1={el.startX}
        y1={el.startY - spessore / 2 + 1}
        x2={el.endX}
        y2={el.endY - spessore / 2 + 1}
        stroke={isMuro ? MURO_CIMA : "rgba(255,255,255,0.10)"}
        strokeWidth={2}
        strokeLinecap="square"
        opacity={0.9}
        style={{ pointerEvents: "none" }}
      />

      {modificabile && selezionato && onEstremo && (
        <>
          <Maniglia x={el.startX} y={el.startY} tonda onPointerDown={(e) => onEstremo(el.id, "start", e)} />
          <Maniglia x={el.endX} y={el.endY} tonda onPointerDown={(e) => onEstremo(el.id, "end", e)} />
        </>
      )}
    </g>
  );
}

function FormaColonna({
  el,
  selezionato,
  modificabile,
  propsCorpo,
  onRidimensiona,
}: {
  el: ColumnElement;
  selezionato: boolean;
  modificabile: boolean;
  propsCorpo: PropsCorpo;
  onRidimensiona?: (id: string, e: React.PointerEvent) => void;
}) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <rect
        x={el.x}
        y={el.y + 3}
        width={el.width}
        height={el.height}
        fill={MURO_OMBRA}
        rx={2}
        style={{ pointerEvents: "none" }}
      />
      <rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rx={2}
        fill={MURO_FACCIA}
        stroke={selezionato ? "#B07A45" : MURO_CIMA}
        strokeWidth={selezionato ? 2.5 : 1.5}
        {...propsCorpo}
      />
      {modificabile && selezionato && onRidimensiona && (
        <Maniglia x={el.x + el.width} y={el.y + el.height} onPointerDown={(e) => onRidimensiona(el.id, e)} />
      )}
    </g>
  );
}

function FormaApertura({
  el,
  tipo,
  selezionato,
  modificabile,
  propsCorpo,
  onAllunga,
}: {
  el: DoorElement | WindowElement;
  tipo: "porta" | "finestra";
  selezionato: boolean;
  modificabile: boolean;
  propsCorpo: PropsCorpo;
  onAllunga?: (id: string, lato: -1 | 1, e: React.PointerEvent) => void;
}) {
  const mezza = el.width / 2;
  const isPorta = tipo === "porta";

  return (
    <g transform={`rotate(${el.rotation} ${el.x} ${el.y})`}>
      {/* Il varco: un pezzo di pavimento che riprende il posto del muro. */}
      <rect
        x={el.x - mezza}
        y={el.y - 7}
        width={el.width}
        height={14}
        fill="url(#pav-legno-chiaro)"
        style={{ pointerEvents: "none" }}
      />
      {isPorta ? (
        <>
          {/* L'anta, aperta: legno pieno, non un tratteggio tecnico. */}
          <path
            d={`M ${el.x - mezza} ${el.y} L ${el.x - mezza} ${el.y - el.width} A ${el.width} ${el.width} 0 0 1 ${el.x + mezza} ${el.y} Z`}
            fill="rgba(210, 174, 124, 0.30)"
            stroke="rgba(94, 62, 28, 0.45)"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
          <line
            x1={el.x - mezza}
            y1={el.y}
            x2={el.x - mezza}
            y2={el.y - el.width}
            stroke={selezionato ? "#B07A45" : "#8A6134"}
            strokeWidth={4}
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          />
        </>
      ) : (
        <>
          <line x1={el.x - mezza} y1={el.y} x2={el.x + mezza} y2={el.y} stroke="#8FA7B5" strokeWidth={5} />
          <line
            x1={el.x - mezza}
            y1={el.y}
            x2={el.x + mezza}
            y2={el.y}
            stroke="rgba(255,255,255,0.65)"
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        </>
      )}
      <rect
        x={el.x - mezza}
        y={el.y - 11}
        width={el.width}
        height={22}
        fill="transparent"
        stroke={selezionato ? "#B07A45" : "none"}
        strokeWidth={selezionato ? 2 : 0}
        {...propsCorpo}
      />
      {/* Le maniglie stanno dentro il gruppo ruotato: seguono il muro, e
          stanno sempre sui due capi dell'apertura. */}
      {modificabile && selezionato && onAllunga && (
        <>
          <Maniglia x={el.x - mezza} y={el.y} tonda onPointerDown={(e) => onAllunga(el.id, -1, e)} />
          <Maniglia x={el.x + mezza} y={el.y} tonda onPointerDown={(e) => onAllunga(el.id, 1, e)} />
        </>
      )}
    </g>
  );
}

function FormaLibera({
  el,
  selezionato,
  modificabile,
  propsCorpo,
  onRidimensiona,
}: {
  el: FreeElement;
  selezionato: boolean;
  modificabile: boolean;
  propsCorpo: PropsCorpo;
  onRidimensiona?: (id: string, e: React.PointerEvent) => void;
}) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rx={6}
        fill="rgba(92, 104, 92, 0.55)"
        stroke={selezionato ? "#B07A45" : "rgba(30, 40, 30, 0.45)"}
        strokeWidth={selezionato ? 2.5 : 1.5}
        filter="url(#ombra-morbida)"
        {...propsCorpo}
      />
      {el.label && el.width > 40 && (
        <EtichettaPiantina x={cx} y={cy} testo={el.label} colore="#F2E7D0" />
      )}
      {modificabile && selezionato && onRidimensiona && (
        <Maniglia x={el.x + el.width} y={el.y + el.height} onPointerDown={(e) => onRidimensiona(el.id, e)} />
      )}
    </g>
  );
}

/**
 * Una sedia sola: lo stesso segno delle sedie dei tavoli — un rettangolino
 * verde scuro, smussato — così sulla pianta si legge come «una sedia» senza
 * legenda. Lo schienale è il lato lungo in alto, come per le sedie dei tavoli
 * a rotazione zero: girandola si sceglie da che parte guarda.
 *
 * Il bersaglio per afferrarla è più grande del disegno: un rettangolo di due
 * centimetri per uno e mezzo, allo zoom normale, non si prende al primo colpo.
 */
function FormaSedia({
  el,
  selezionato,
  propsCorpo,
}: {
  el: Extract<RoomElement, { type: "CHAIR" }>;
  selezionato: boolean;
  propsCorpo: PropsCorpo;
}) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  return (
    <g transform={`rotate(${el.rotation} ${cx} ${cy})`}>
      <rect
        x={el.x - 6}
        y={el.y - 6}
        width={el.width + 12}
        height={el.height + 12}
        fill="transparent"
        {...propsCorpo}
      />
      <rect
        x={el.x}
        y={el.y}
        width={el.width}
        height={el.height}
        rx={3}
        fill="rgb(var(--forest) / 0.9)"
        stroke={selezionato ? "#B07A45" : "none"}
        strokeWidth={selezionato ? 2 : 0}
        style={{ pointerEvents: "none" }}
      />
      {/* Lo schienale: una riga più scura sul lato di dietro. */}
      <rect
        x={el.x + 2}
        y={el.y}
        width={Math.max(0, el.width - 4)}
        height={3}
        rx={1.5}
        fill="rgb(0 0 0 / 0.25)"
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

function FormaTesto({
  el,
  selezionato,
  modificabile,
  propsCorpo,
}: {
  el: TextElement;
  selezionato: boolean;
  modificabile: boolean;
  propsCorpo: PropsCorpo;
}) {
  return (
    <g transform={`rotate(${el.rotation} ${el.x} ${el.y})`}>
      {modificabile && (
        <rect
          x={el.x - el.text.length * el.fontSize * 0.32 - 6}
          y={el.y - el.fontSize}
          width={el.text.length * el.fontSize * 0.64 + 12}
          height={el.fontSize * 2}
          fill="transparent"
          stroke={selezionato ? "#B07A45" : "none"}
          strokeWidth={selezionato ? 2 : 0}
          rx={4}
          {...propsCorpo}
        />
      )}
      <EtichettaPiantina x={el.x} y={el.y} testo={el.text} colore="#3B2A17" dimensione={el.fontSize} />
    </g>
  );
}

/* ─────────────────────────── ATOMI ─────────────────────────── */

function EtichettaPiantina({
  x,
  y,
  testo,
  colore,
  dimensione = 18,
}: {
  x: number;
  y: number;
  testo: string;
  colore: string;
  dimensione?: number;
}) {
  // Niente stroke/paintOrder: con questo motore di rendering un bordo sul
  // testo lo rende invisibile del tutto, non solo meno nitido (verificato
  // togliendolo: il testo torna a vedersi). Non serviva comunque — i colori
  // delle etichette sono già scelti per contrastare col proprio pavimento.
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={dimensione}
      fontWeight={700}
      fill={colore}
      className="select-none uppercase"
      style={{ pointerEvents: "none", letterSpacing: "0.06em" }}
    >
      {testo}
    </text>
  );
}

function Maniglia({
  x,
  y,
  tonda = false,
  onPointerDown,
}: {
  x: number;
  y: number;
  tonda?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  if (tonda) {
    return (
      <circle
        cx={x}
        cy={y}
        r={6}
        fill="#B07A45"
        stroke="#F2E7D0"
        strokeWidth={1.5}
        className="cursor-pointer"
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e);
        }}
      />
    );
  }
  return (
    <rect
      x={x - 6}
      y={y - 6}
      width={12}
      height={12}
      rx={2}
      fill="#B07A45"
      stroke="#F2E7D0"
      strokeWidth={1.5}
      className="cursor-nwse-resize"
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown(e);
      }}
    />
  );
}
