import OpenAI from "openai";
import {
  FloorPlanAnalysisSchema,
  type FloorPlanAnalysis,
} from "@/lib/floorplan-analysis";
import { leggiFile } from "@/server/archivio-file";

/**
 * Il riconoscimento della planimetria.
 *
 * Una funzione sola, con due strade dentro: il modello di visione quando c'è
 * una chiave e un'immagine che si può guardare, un perimetro di ripiego
 * quando non c'è. Il ripiego **non finge**: mette `source: "fallback"` nel
 * risultato e una riga in `note`, e l'interfaccia dice al ristoratore che la
 * piantina è un punto di partenza da correggere, non una lettura del suo
 * locale. Una piantina inventata spacciata per riconosciuta è peggio di
 * nessuna piantina: si scopre quando un cameriere cerca un tavolo dove non
 * c'è.
 *
 * Il contratto verso l'esterno (`FloorPlanAnalysis`) è lo stesso nei due
 * casi, quindi sostituire questa implementazione con una chiamata a un
 * servizio di computer vision dedicato non tocca una riga dell'editor.
 */

const VISION_MODELS_DEFAULT = "gpt-4o-mini";

function client() {
  const apiKey = process.env.OPENAI_API_KEY;
  return apiKey ? new OpenAI({ apiKey }) : null;
}

/** Il modello guarda immagini: i PDF non li può leggere, e fingere il
 * contrario significherebbe spendere una chiamata per ricevere un rifiuto. */
const TIPI_IMMAGINE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function tipoImmagine(url: string): string | null {
  const path = url.split("?")[0].toLowerCase();
  const ext = Object.keys(TIPI_IMMAGINE).find((e) => path.endsWith(e));
  return ext ? TIPI_IMMAGINE[ext] : null;
}

/** Limite di sicurezza: il caricamento ne accetta 10 MB, e in base64 ne
 * diventano circa 13,3. Oltre non si prova nemmeno. */
const MAX_BYTE_IMMAGINE = 10 * 1024 * 1024;

/**
 * L'immagine arriva al modello **come dato, non come indirizzo**.
 *
 * Passare l'URL sarebbe più corto, ma vorrebbe dire che il riconoscimento
 * funziona solo quando la planimetria sta su un indirizzo pubblico
 * raggiungibile da fuori. Non è il caso di un archivio privato, non è il caso
 * di un ambiente di sviluppo, e non è una cosa che l'utente possa capire dal
 * messaggio d'errore. Leggerla qui costa un trasferimento in più e toglie una
 * condizione invisibile al funzionamento.
 *
 * `leggiFile` sa da quale dei due archivi viene l'indirizzo: se è quello della
 * cartella locale i byte si prendono dal disco, senza che il server faccia una
 * richiesta HTTP a sé stesso mentre ne sta servendo un'altra.
 */
async function immagineComeDato(url: string): Promise<string | null> {
  const mime = tipoImmagine(url);
  if (!mime) return null;
  const buffer = await leggiFile(url);
  if (!buffer) return null;
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTE_IMMAGINE) return null;
  return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
}

const SYSTEM_PROMPT = `Sei un sistema di computer vision specializzato in planimetrie di locali pubblici (ristoranti, bar, pizzerie).
Ricevi l'immagine di una planimetria e restituisci la sua struttura in JSON.

REGOLE
- Tutte le coordinate sono NORMALIZZATE rispetto all'immagine: 0 = bordo sinistro/alto, 1 = bordo destro/basso. Usa numeri con 3 decimali.
- "walls": i muri portanti e il perimetro. Ogni muro e' un segmento {x1,y1,x2,y2,thickness}. thickness e' relativo alla larghezza dell'immagine (tipicamente 0.006-0.02).
- "dividers": tramezzi e divisori interni sottili, stesso formato dei muri.
- "doors" e "windows": {x,y,width,angle}. x,y e' il CENTRO dell'apertura sul muro; angle in gradi, 0 = apertura su muro orizzontale, 90 = su muro verticale.
- "rooms": gli ambienti riconoscibili come rettangoli {x,y,width,height,kind,label}. x,y e' l'angolo in alto a sinistra. "kind" e' uno di: AREA_ZONE, AREA_KITCHEN, AREA_BAR, AREA_WC, AREA_STORAGE, AREA_PRIVATE, AREA_ENTRANCE, AREA_TERRACE, AREA_STAIRS. "label" e' il testo leggibile sulla planimetria se c'e' (es. "DISPENSA", "LAVAGGIO"), altrimenti null.
- "serviceAreas": banconi, banchi di servizio, zone di passaggio, stesso formato di rooms.
- "entrances": ingressi e uscite {x,y,width,angle}.
- "labels": scritte presenti sulla planimetria che non corrispondono a un ambiente {x,y,text}.
- "widthM" e "depthM": le dimensioni reali della sala in metri. Se la planimetria porta delle quote, usale. Altrimenti stima da elementi noti (una porta e' circa 0,80-0,90 m, un WC circa 1,5x1,5 m) e dichiara meno confidenza.
- "confidence": 0-1, quanto ti fidi della lettura complessiva.

Non inventare ambienti che non vedi. Se la planimetria e' illeggibile restituisci liste vuote e confidence bassa.
Rispondi SOLO con il JSON, senza testo attorno e senza blocchi di codice.`;

export type AnalyzeInput = {
  imageUrl: string;
  roomName?: string;
  /** Dimensioni dichiarate dal ristoratore, se le conosce: sono un
   * riferimento molto più affidabile della stima del modello. */
  hintWidthM?: number | null;
  hintDepthM?: number | null;
};

export async function analyzeFloorPlan(input: AnalyzeInput): Promise<FloorPlanAnalysis> {
  const ai = client();

  if (!ai) {
    return fallbackAnalysis(
      input,
      "Il riconoscimento automatico non è configurato su questo ambiente: abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }
  if (!tipoImmagine(input.imageUrl)) {
    return fallbackAnalysis(
      input,
      "Il riconoscimento automatico legge immagini PNG, JPG o WEBP. Per questo file abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }

  const immagine = await immagineComeDato(input.imageUrl);
  if (!immagine) {
    return fallbackAnalysis(
      input,
      "Non siamo riusciti a rileggere l'immagine caricata: abbiamo creato un perimetro di partenza da correggere a mano.",
    );
  }

  try {
    const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || VISION_MODELS_DEFAULT;
    const completion = await ai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 4000,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Analizza questa planimetria${input.roomName ? ` della sala "${input.roomName}"` : ""}.`,
                input.hintWidthM && input.hintDepthM
                  ? `Il locale dichiara che la sala misura circa ${input.hintWidthM} x ${input.hintDepthM} metri: usa questi valori per widthM e depthM.`
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
            },
            { type: "image_url", image_url: { url: immagine, detail: "high" } },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("empty_response");

    const parsed = FloorPlanAnalysisSchema.safeParse({
      ...JSON.parse(stripCodeFence(raw)),
      version: 1,
      source: "ai",
    });
    if (!parsed.success) throw new Error("invalid_shape");

    const analysis = parsed.data;
    // Le quote dichiarate dal ristoratore battono sempre la stima del
    // modello: chi ha camminato nella sala la conosce meglio.
    if (input.hintWidthM) analysis.widthM = input.hintWidthM;
    if (input.hintDepthM) analysis.depthM = input.hintDepthM;

    if (analysis.walls.length === 0) {
      return fallbackAnalysis(
        input,
        "Non siamo riusciti a leggere le pareti da questa immagine: abbiamo creato un perimetro di partenza da correggere a mano.",
      );
    }
    return analysis;
  } catch (err) {
    return fallbackAnalysis(input, notaDiFallimento(err));
  }
}

/**
 * Perché il riconoscimento non ha funzionato, detto a chi può rimediare.
 *
 * Tutti i fallimenti finivano in una frase sola: «non siamo riusciti a leggere
 * questa planimetria». Vera per un'immagine storta, **falsa e costosa** per una
 * chiave sbagliata o per il credito finito — casi in cui il ristoratore
 * ricarica la stessa piantina tre volte, poi ne prova un'altra, e conclude che
 * la funzione non serve. Sono anche i due casi che si incontrano il giorno in
 * cui la chiave si configura per la prima volta, cioè quando una frase precisa
 * vale di più.
 *
 * La risposta resta la stessa — il perimetro da correggere a mano — perché per
 * chi sta disegnando la sala non cambia niente: cambia solo cosa gli conviene
 * fare dopo.
 */
function notaDiFallimento(err: unknown): string {
  const stato = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 0;

  if (stato === 401 || stato === 403) {
    return "La chiave del riconoscimento automatico non è valida: controlla OPENAI_API_KEY. Intanto abbiamo creato un perimetro di partenza da correggere a mano.";
  }
  if (stato === 429) {
    return "Il riconoscimento automatico ha esaurito il credito o le richieste consentite: riprova più tardi. Intanto abbiamo creato un perimetro di partenza da correggere a mano.";
  }
  if (stato === 404) {
    return "Il modello del riconoscimento automatico non esiste o non è accessibile con questa chiave: controlla OPENAI_VISION_MODEL. Intanto abbiamo creato un perimetro di partenza da correggere a mano.";
  }
  return "Il riconoscimento automatico non è riuscito a leggere questa planimetria: abbiamo creato un perimetro di partenza da correggere a mano.";
}

/**
 * Il ripiego: un rettangolo con un ingresso.
 *
 * Non prova a somigliare al locale, e non deve: prova a dare al ristoratore
 * quattro muri da trascinare invece di una tela bianca. Tutto il resto lo
 * aggiunge lui dagli strumenti della colonna sinistra, che esistono
 * esattamente per questo.
 */
export function fallbackAnalysis(input: AnalyzeInput, note: string): FloorPlanAnalysis {
  const widthM = input.hintWidthM ?? 12;
  const depthM = input.hintDepthM ?? 8;
  const t = 0.012;

  return FloorPlanAnalysisSchema.parse({
    version: 1,
    source: "fallback",
    confidence: 0,
    widthM,
    depthM,
    walls: [
      { x1: 0, y1: 0, x2: 1, y2: 0, thickness: t },
      { x1: 1, y1: 0, x2: 1, y2: 1, thickness: t },
      { x1: 1, y1: 1, x2: 0, y2: 1, thickness: t },
      { x1: 0, y1: 1, x2: 0, y2: 0, thickness: t },
    ],
    dividers: [],
    doors: [],
    windows: [],
    rooms: [],
    serviceAreas: [],
    entrances: [{ x: 0.5, y: 1, width: 0.09, angle: 0 }],
    labels: [],
    note,
  });
}

function stripCodeFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
}
