import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ROOM_LAYERS,
  boundingBox,
  estimateAreaSqm,
  metersToPx,
  parseRoomInventory,
  parseRoomLayers,
  parseRoomLayoutElements,
  wallPolygon,
  type RoomElement,
} from "@/lib/room-layout";
import {
  analysisToElements,
  FloorPlanAnalysisSchema,
  normalizzaTipoArea,
  summarizeAnalysis,
} from "@/lib/floorplan-analysis";
import { analyzeFloorPlan, fallbackAnalysis } from "@/server/floorplan-analysis";
import { posizioniSedie, dimensioneDisegnata } from "@/lib/tavolo-geometria";
import { generateLShape, generateRectangle } from "@/components/floor/editor/perimetro";

/* Il riconoscimento chiama OpenAI e rilegge il file dall'archivio: qui non
   deve succedere né l'una né l'altra cosa. Quello che si verifica è come
   `analyzeFloorPlan` reagisce a un rifiuto, non che sappia telefonare. */
const creaCompletamento = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: creaCompletamento } };
  },
}));
vi.mock("@/server/archivio-file", () => ({
  leggiFile: async () => new Uint8Array([1, 2, 3]).buffer,
}));

/** L'errore come lo lancia il client OpenAI: un oggetto con `status`. */
function rifiuto(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

/**
 * La piantina della Sala, verificata dove può mentire senza che si veda.
 *
 * Non la grafica — quella si guarda — ma i tre punti in cui un errore passa
 * inosservato per settimane: la superficie stimata (un numero che nessuno
 * ricontrola), gli elementi derivati dal riconoscimento (che arrivano da un
 * modello e non da un form), e la piantina persistita (che una volta salvata
 * male resta salvata male).
 */

describe("superficie della sala", () => {
  it("misura il poligono vero, non il riquadro di ingombro", () => {
    // Una sala a L: 12x8 di ingombro, ma un angolo da 4x3 non c'è.
    const muri = generateLShape(12, 8, 4, 3);
    const superficie = estimateAreaSqm(muri);
    expect(superficie).not.toBeNull();
    expect(superficie!).toBeCloseTo(12 * 8 - 4 * 3, 1);
  });

  it("su un rettangolo dà larghezza per profondità", () => {
    expect(estimateAreaSqm(generateRectangle(12, 8))!).toBeCloseTo(96, 1);
  });

  it("senza muri non inventa un numero", () => {
    expect(estimateAreaSqm([])).toBeNull();
  });

  it("il pavimento segue il contorno dei muri quando si chiude", () => {
    expect(wallPolygon(generateRectangle(10, 6))).toHaveLength(4);
    // Un muro solo non è un contorno: meglio nessun poligono di uno finto.
    expect(wallPolygon(generateRectangle(10, 6).slice(0, 1))).toBeNull();
  });
});

describe("riconoscimento della planimetria", () => {
  it("il ripiego dichiara di esserlo e non finge ambienti", () => {
    const a = fallbackAnalysis({ imageUrl: "x.pdf" }, "niente da leggere");
    expect(a.source).toBe("fallback");
    expect(a.confidence).toBe(0);
    expect(a.rooms).toHaveLength(0);
    expect(a.walls).toHaveLength(4);
    expect(a.note).toBe("niente da leggere");
  });

  it("le quote dichiarate dal locale diventano le dimensioni del perimetro", () => {
    const a = fallbackAnalysis({ imageUrl: "x.png", hintWidthM: 15, hintDepthM: 9 }, "");
    const { elements, width, height } = analysisToElements(a);
    // Il riquadro **dei muri**: l'ingresso è un'area che sborda di proposito
    // oltre il perimetro, come sulle planimetrie vere.
    const box = boundingBox(elements.filter((e) => e.type === "WALL"));
    expect(box.maxX - box.minX).toBe(metersToPx(15));
    expect(box.maxY - box.minY).toBe(metersToPx(9));
    // Il mondo lascia un margine attorno: un tavolo trascinato verso il bordo
    // deve sbattere contro un muro, non contro l'origine del canvas.
    expect(width).toBeGreaterThan(metersToPx(15));
    expect(height).toBeGreaterThan(metersToPx(9));
  });

  it("traduce muri, porte, ambienti ed etichette in elementi modificabili", () => {
    const analisi = FloorPlanAnalysisSchema.parse({
      source: "ai",
      confidence: 0.8,
      widthM: 12,
      depthM: 8,
      walls: [{ x1: 0, y1: 0, x2: 1, y2: 0, thickness: 0.012 }],
      dividers: [{ x1: 0, y1: 0.5, x2: 0.4, y2: 0.5, thickness: 0.006 }],
      doors: [{ x: 0.5, y: 1, width: 0.08, angle: 0 }],
      windows: [{ x: 0.2, y: 0, width: 0.1, angle: 0 }],
      rooms: [{ x: 0, y: 0, width: 0.3, height: 0.4, kind: "AREA_KITCHEN", label: "CUCINA" }],
      serviceAreas: [{ x: 0.5, y: 0.6, width: 0.3, height: 0.1, kind: "AREA_BAR", label: null }],
      entrances: [{ x: 0.5, y: 1, width: 0.09, angle: 0 }],
      labels: [{ x: 0.5, y: 0.5, text: "BANCO / SERVIZIO" }],
    });

    const tipi = analysisToElements(analisi).elements.map((e) => e.type);
    expect(tipi).toContain("WALL");
    expect(tipi).toContain("DIVIDER");
    expect(tipi).toContain("DOOR");
    expect(tipi).toContain("WINDOW");
    expect(tipi).toContain("AREA_KITCHEN");
    expect(tipi).toContain("AREA_BAR");
    expect(tipi).toContain("AREA_ENTRANCE");
    expect(tipi).toContain("TEXT");
  });

  it("non riscrive sopra l'ambiente la scritta che l'ambiente porta già", () => {
    // È quello che restituisce davvero un modello di visione: legge «CUCINA»
    // e la dà sia come nome dell'ambiente sia come scritta sulla piantina.
    const analisi = FloorPlanAnalysisSchema.parse({
      widthM: 12,
      depthM: 8,
      rooms: [{ x: 0.1, y: 0.1, width: 0.3, height: 0.3, kind: "AREA_KITCHEN", label: "CUCINA" }],
      labels: [
        { x: 0.25, y: 0.25, text: " cucina " },
        { x: 0.6, y: 0.6, text: "BANCO / SERVIZIO" },
      ],
    });
    const testi = analysisToElements(analisi)
      .elements.filter((e) => e.type === "TEXT")
      .map((e) => (e as { text: string }).text);
    expect(testi).toEqual(["BANCO / SERVIZIO"]);
  });

  it("un tipo di ambiente sconosciuto diventa una zona generica invece di sparire", () => {
    const analisi = FloorPlanAnalysisSchema.parse({
      widthM: 10,
      depthM: 6,
      rooms: [{ x: 0, y: 0, width: 0.2, height: 0.2, label: null }],
    });
    expect(analysisToElements(analisi).elements[0].type).toBe("AREA_ZONE");
  });

  it("il riassunto conta quello che ha trovato", () => {
    const a = FloorPlanAnalysisSchema.parse({
      widthM: 10,
      depthM: 6,
      walls: [{ x1: 0, y1: 0, x2: 1, y2: 0 }],
      doors: [{ x: 0.5, y: 0 }],
      rooms: [{ x: 0, y: 0, width: 0.2, height: 0.2 }],
    });
    expect(summarizeAnalysis(a)).toBe("1 parete · 1 ambiente · 1 apertura");
    expect(summarizeAnalysis(FloorPlanAnalysisSchema.parse({ widthM: 10, depthM: 6 }))).toBe(
      "nessun elemento riconosciuto",
    );
  });
});

describe("piantina persistita", () => {
  it("un elemento illeggibile non porta via tutta la sala", () => {
    const salvato = [
      { id: "w1", type: "WALL", startX: 0, startY: 0, endX: 100, endY: 0, thickness: 10 },
      { id: "boh", type: "TIPO_DI_UNA_VERSIONE_FUTURA", x: 1 },
      { id: "c1", type: "COLUMN", x: 10, y: 10, width: 40, height: 40, rotation: 0 },
    ];
    const letti = parseRoomLayoutElements(salvato);
    expect(letti.map((e) => e.id)).toEqual(["w1", "c1"]);
  });

  it("i livelli mancanti prendono il valore di partenza, quelli salvati vincono", () => {
    expect(parseRoomLayers({ original: true })).toEqual({ ...DEFAULT_ROOM_LAYERS, original: true });
    expect(parseRoomLayers("non è un oggetto")).toEqual(DEFAULT_ROOM_LAYERS);
  });

  it("un inventario storto non blocca la sala", () => {
    expect(parseRoomInventory({ SQUARE: 4, ROUND: 3 })).toEqual({ SQUARE: 4, ROUND: 3 });
    expect(parseRoomInventory({ SQUARE: -1 })).toEqual({});
    expect(parseRoomInventory(null)).toEqual({});
  });

  it("il riquadro di ingombro tiene dentro anche divisori, testi e ingombri liberi", () => {
    const elementi: RoomElement[] = [
      { id: "d", type: "DIVIDER", startX: 0, startY: 0, endX: 300, endY: 0, thickness: 6 },
      { id: "f", type: "FREE", x: 400, y: 200, width: 60, height: 60, rotation: 0, label: null },
    ];
    const box = boundingBox(elementi);
    expect(box.maxX).toBe(460);
    expect(box.maxY).toBe(260);
  });
});

describe("le sedie dicono quanti posti ci sono", () => {
  it("quante sono i posti, fino al limite del disegno", () => {
    expect(posizioniSedie("SQUARE", 80, 80, 2)).toHaveLength(2);
    expect(posizioniSedie("ROUND", 80, 80, 6)).toHaveLength(6);
    expect(posizioniSedie("RECT", 120, 70, 8)).toHaveLength(8);
    expect(posizioniSedie("RECT", 120, 70, 40).length).toBeLessThanOrEqual(12);
  });

  it("su un rettangolo due posti si guardano in faccia, non stanno dallo stesso lato", () => {
    const [a, b] = posizioniSedie("RECT", 120, 70, 2);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
  });

  it("divanetto e lounge non ricevono sedie: la seduta ce l'hanno già", () => {
    expect(posizioniSedie("BOOTH", 160, 90, 4)).toHaveLength(0);
    expect(posizioniSedie("LOUNGE", 140, 100, 4)).toHaveLength(0);
  });

  it("un tavolo ridimensionato a mano tiene la sua misura, gli altri crescono coi posti", () => {
    expect(dimensioneDisegnata({ shape: "SQUARE", seats: 4, width: 200, height: 150 })).toEqual({ w: 200, h: 150 });
    const due = dimensioneDisegnata({ shape: "SQUARE", seats: 2 });
    const otto = dimensioneDisegnata({ shape: "SQUARE", seats: 8 });
    expect(otto.w).toBeGreaterThan(due.w);
  });
});

/**
 * Quando il riconoscimento fallisce, la piantina di partenza arriva lo stesso.
 * Quello che cambia è la riga che il ristoratore legge: se dice «non siamo
 * riusciti a leggere questa planimetria» mentre il vero problema è una chiave
 * sbagliata, ricaricherà la stessa immagine finché non si stanca.
 */
describe("perché il riconoscimento non ha funzionato", () => {
  beforeEach(() => {
    creaCompletamento.mockReset();
    (process.env as Record<string, string | undefined>).OPENAI_API_KEY = "sk-di-prova";
  });

  it("una chiave rifiutata nomina la chiave", async () => {
    creaCompletamento.mockRejectedValue(rifiuto(401));
    const a = await analyzeFloorPlan({ imageUrl: "/api/archivio-locale/sala/x.png" });
    expect(a.source).toBe("fallback");
    expect(a.note).toContain("OPENAI_API_KEY");
  });

  it("il credito finito non si confonde con un'immagine illeggibile", async () => {
    creaCompletamento.mockRejectedValue(rifiuto(429));
    const a = await analyzeFloorPlan({ imageUrl: "/api/archivio-locale/sala/x.png" });
    expect(a.note).toContain("credito");
    expect(a.note).not.toContain("leggere questa planimetria");
  });

  it("un modello che non esiste nomina il modello", async () => {
    creaCompletamento.mockRejectedValue(rifiuto(404));
    const a = await analyzeFloorPlan({ imageUrl: "/api/archivio-locale/sala/x.png" });
    expect(a.note).toContain("OPENAI_VISION_MODEL");
  });

  it("un guasto senza nome resta la frase generica", async () => {
    creaCompletamento.mockRejectedValue(new Error("boom"));
    const a = await analyzeFloorPlan({ imageUrl: "/api/archivio-locale/sala/x.png" });
    expect(a.note).toContain("non è riuscito a leggere questa planimetria");
  });

  it("senza chiave il messaggio resta quello della funzione spenta", async () => {
    delete (process.env as Record<string, string | undefined>).OPENAI_API_KEY;
    const a = await analyzeFloorPlan({ imageUrl: "/api/archivio-locale/sala/x.png" });
    expect(a.note).toContain("non è configurato su questo ambiente");
    expect(creaCompletamento).not.toHaveBeenCalled();
  });
});

/**
 * La lettura del riconoscitore non si butta via per un campo.
 *
 * Il caso vero, il 21 settembre 2026: su una planimetria di casa `gpt-4o-mini`
 * ha risposto `AREA_LAVANDERIA`, `AREA_BAGNO` e `AREA_SOGGIORNO` — tipi che non
 * esistono da noi. Lo schema rifiutava l'intero oggetto e il ristoratore
 * leggeva «non siamo riusciti a leggere questa planimetria», mentre dodici muri
 * e le misure reali erano stati letti benissimo.
 */
describe("un campo sbagliato non butta via la planimetria", () => {
  const letturaVera = {
    version: 1,
    source: "ai",
    confidence: 0.85,
    widthM: 11.26,
    depthM: 9.44,
    walls: [
      { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.012 },
      { x1: 0.9, y1: 0.1, x2: 0.9, y2: 0.9, thickness: 0.012 },
    ],
    rooms: [
      { x: 0.1, y: 0.1, width: 0.3, height: 0.2, kind: "AREA_KITCHEN", label: "CUCINA" },
      { x: 0.5, y: 0.1, width: 0.2, height: 0.2, kind: "AREA_LAVANDERIA", label: "LAVANDERIA" },
      { x: 0.1, y: 0.4, width: 0.6, height: 0.5, kind: "AREA_SOGGIORNO", label: "SOGGIORNO" },
      { x: 0.7, y: 0.4, width: 0.2, height: 0.2, kind: "AREA_BAGNO", label: "BAGNO" },
    ],
  };

  it("i tipi inventati diventano il nostro più vicino, e i muri restano tutti", () => {
    const a = FloorPlanAnalysisSchema.parse(letturaVera);
    expect(a.walls).toHaveLength(2);
    expect(a.widthM).toBe(11.26);
    expect(a.rooms.map((r) => r.kind)).toEqual([
      "AREA_KITCHEN",
      "AREA_STORAGE",
      "AREA_ZONE",
      "AREA_WC",
    ]);
  });

  it("il nome scritto sulla planimetria resta quello, non diventa «Magazzino»", () => {
    const a = FloorPlanAnalysisSchema.parse(letturaVera);
    expect(a.rooms.map((r) => r.label)).toEqual(["CUCINA", "LAVANDERIA", "SOGGIORNO", "BAGNO"]);
  });

  it("un muro impossibile se ne va da solo, gli altri restano", () => {
    const a = FloorPlanAnalysisSchema.parse({
      ...letturaVera,
      walls: [
        { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1 },
        { x1: 7, y1: "molto", x2: null, y2: 0.4 },
        { x1: 0.2, y1: 0.2, x2: 0.2, y2: 0.8 },
      ],
    });
    expect(a.walls).toHaveLength(2);
  });

  it("senza nemmeno un muro buono resta il ripiego, che è già previsto", () => {
    const a = FloorPlanAnalysisSchema.parse({ ...letturaVera, walls: [{ x1: 9, y1: 9, x2: 9, y2: 9 }] });
    // `analyzeFloorPlan` guarda proprio questo per decidere di ripiegare sul
    // perimetro invece di consegnare una sala senza pareti.
    expect(a.walls).toHaveLength(0);
  });
});

describe("il tipo di ambiente, ricondotto al nostro", () => {
  it("un valore che già esiste passa intatto", () => {
    expect(normalizzaTipoArea("AREA_BAR")).toBe("AREA_BAR");
  });

  it("le parole italiane della planimetria bastano a indovinare", () => {
    expect(normalizzaTipoArea("AREA_LAVANDERIA")).toBe("AREA_STORAGE");
    expect(normalizzaTipoArea("AREA_BAGNO")).toBe("AREA_WC");
    expect(normalizzaTipoArea("AREA_SCALE")).toBe("AREA_STAIRS");
    expect(normalizzaTipoArea("AREA_DEHORS")).toBe("AREA_TERRACE");
  });

  it("quando il tipo non dice niente, si guarda l'etichetta", () => {
    expect(normalizzaTipoArea("QUALCOSA", "Dispensa")).toBe("AREA_STORAGE");
    expect(normalizzaTipoArea(null, "Cucina calda")).toBe("AREA_KITCHEN");
  });

  it("quando non dice niente nemmeno l'etichetta, è una zona", () => {
    expect(normalizzaTipoArea(undefined)).toBe("AREA_ZONE");
    expect(normalizzaTipoArea(42, { non: "una stringa" })).toBe("AREA_ZONE");
    expect(normalizzaTipoArea("AREA_SOGGIORNO", "SOGGIORNO")).toBe("AREA_ZONE");
  });
});
