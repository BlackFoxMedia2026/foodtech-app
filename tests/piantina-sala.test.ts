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
import { analysisToElements, FloorPlanAnalysisSchema, summarizeAnalysis } from "@/lib/floorplan-analysis";
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
