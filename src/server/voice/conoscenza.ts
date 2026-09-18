import { db } from "@/lib/db";
import type { VoiceKnowledgeCategory } from "@prisma/client";

/**
 * Le risposte che il telefono deve dare.
 *
 * ## Le venti domande di ogni sera
 *
 * «Siete aperti a Pasqua?» «Si può portare il cane?» «C'è il parcheggio?»
 * «Avete il menu senza glutine?» «Si può stare fuori?» Un ristorante risponde
 * alle stesse dieci domande venti volte al giorno, e la risposta la sa **chi
 * lavora da più tempo**: il ragazzo che risponde al telefono il sabato sera la
 * indovina, o mette in attesa e va a chiedere in cucina.
 *
 * Questa tabella è il posto dove quelle risposte si scrivono una volta. Serve
 * a due cose, oggi:
 *
 * 1. **a chi risponde**: la si cerca dalla pagina del telefono mentre si
 *    parla, e si legge la frase che il locale ha deciso;
 * 2. **all'assistente**: «cosa rispondo a chi chiede del parcheggio?» esce da
 *    qui, non da un modello che lo immagina.
 *
 * E domani è quello che leggerà il risponditore automatico, quando esisterà un
 * fornitore che sa far parlare una voce: la base di conoscenza è la stessa, e
 * non si riscrive.
 *
 * ## Perché non è «una pagina di note»
 *
 * Perché una nota libera non si può cercare mentre una persona aspetta al
 * telefono. Qui ogni risposta porta **le forme in cui la domanda arriva**
 * (`argomenti`): «cane», «cani», «animali», «posso portare il cane». È l'unica
 * parte che costa un minuto di lavoro in più a chi la scrive, ed è quella che
 * fa la differenza fra una risposta trovata in due secondi e una cercata
 * scorrendo.
 */

export type RispostaPronta = {
  id: string;
  categoria: VoiceKnowledgeCategory;
  argomenti: string[];
  risposta: string;
  attivo: boolean;
};

export const CATEGORIE: VoiceKnowledgeCategory[] = [
  "ORARI",
  "LOCALE",
  "MENU",
  "ALLERGIE",
  "PARCHEGGIO",
  "ANIMALI",
  "BAMBINI",
  "ACCESSIBILITA",
  "GRUPPI",
  "EVENTI",
  "PAGAMENTI",
  "ALTRO",
];

/** Tutte le risposte del locale. Sono poche e corte: si leggono in una volta. */
export async function risposteDelLocale(
  venueId: string,
  soloAttive = false,
): Promise<RispostaPronta[]> {
  const righe = await db.voiceKnowledgeItem.findMany({
    where: { venueId, ...(soloAttive ? { attivo: true } : {}) },
    orderBy: [{ categoria: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      categoria: true,
      argomenti: true,
      risposta: true,
      attivo: true,
    },
  });
  return righe;
}

export async function creaRisposta(
  venueId: string,
  dati: {
    categoria: VoiceKnowledgeCategory;
    argomenti: string[];
    risposta: string;
  },
): Promise<{ id: string }> {
  return db.voiceKnowledgeItem.create({
    data: {
      venueId,
      categoria: dati.categoria,
      argomenti: pulisciArgomenti(dati.argomenti),
      risposta: dati.risposta.trim().slice(0, 1200),
    },
    select: { id: true },
  });
}

export async function aggiornaRisposta(
  venueId: string,
  id: string,
  dati: {
    categoria?: VoiceKnowledgeCategory;
    argomenti?: string[];
    risposta?: string;
    attivo?: boolean;
  },
): Promise<void> {
  /* Filtrato per locale, come ogni scrittura: un identificativo altrui non
     deve poter cambiare la risposta che un altro ristorante dà al telefono. */
  const esistente = await db.voiceKnowledgeItem.findFirst({
    where: { id, venueId },
    select: { id: true },
  });
  if (!esistente) throw new Error("not_found");

  await db.voiceKnowledgeItem.update({
    where: { id: esistente.id },
    data: {
      ...(dati.categoria ? { categoria: dati.categoria } : {}),
      ...(dati.argomenti
        ? { argomenti: pulisciArgomenti(dati.argomenti) }
        : {}),
      ...(dati.risposta
        ? { risposta: dati.risposta.trim().slice(0, 1200) }
        : {}),
      ...(dati.attivo != null ? { attivo: dati.attivo } : {}),
    },
  });
}

export async function eliminaRisposta(
  venueId: string,
  id: string,
): Promise<void> {
  const esistente = await db.voiceKnowledgeItem.findFirst({
    where: { id, venueId },
    select: { id: true },
  });
  if (!esistente) throw new Error("not_found");
  await db.voiceKnowledgeItem.delete({ where: { id: esistente.id } });
}

/**
 * Cerca la risposta a una domanda.
 *
 * ## Come cerca, e cosa **non** fa
 *
 * Confronta la domanda con gli argomenti dichiarati e con il testo della
 * risposta. Niente modelli, niente somiglianza approssimata: una ricerca che
 * indovina restituirebbe la risposta sbagliata con la stessa faccia con cui
 * restituisce quella giusta — e chi la legge al telefono non ha modo di
 * sapere quale delle due gli è capitata.
 *
 * Quando non trova niente restituisce un elenco vuoto, e chi chiama lo dice:
 * «questo lo faccio verificare». È la terza regola degli strumenti di
 * scrittura applicata alla lettura — se un dato non c'è, non si inventa.
 */
export async function cercaRisposte(
  venueId: string,
  domanda: string,
): Promise<RispostaPronta[]> {
  const parole = parole_di(domanda);
  if (parole.length === 0) return [];

  const tutte = await risposteDelLocale(venueId, true);

  /* Il punteggio è semplice di proposito: quante parole della domanda
     compaiono fra gli argomenti (che valgono doppio, perché li ha scelti chi
     conosce il locale) o nel testo. Un ordinamento più furbo su dieci righe
     non cambia la prima. */
  const punteggi = tutte.map((r) => {
    const argomenti = r.argomenti.map((a) => normalizza(a));
    const testo = normalizza(r.risposta);
    let punti = 0;
    for (const p of parole) {
      if (argomenti.some((a) => a.includes(p) || p.includes(a))) punti += 2;
      else if (testo.includes(p)) punti += 1;
    }
    return { r, punti };
  });

  return punteggi
    .filter((x) => x.punti > 0)
    .sort((a, b) => b.punti - a.punti)
    .slice(0, 5)
    .map((x) => x.r);
}

/* -------------------------------------------------------------------------- */

const DIACRITICI = /[̀-ͯ]/g;

function normalizza(testo: string): string {
  return testo.toLowerCase().normalize("NFD").replace(DIACRITICI, "");
}

/** Le parole che contano: via quelle di servizio, che stanno in ogni domanda. */
const VUOTE = new Set([
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "una",
  "di",
  "da",
  "del",
  "della",
  "che",
  "chi",
  "cosa",
  "come",
  "quando",
  "dove",
  "si",
  "puo",
  "posso",
  "avete",
  "siete",
  "ci",
  "e",
  "o",
  "a",
  "al",
  "alla",
  "per",
  "con",
  "su",
  "sono",
  "c",
  "un",
  "in",
  "se",
  "non",
  "mi",
  "vi",
]);

function parole_di(domanda: string): string[] {
  return normalizza(domanda)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3 && !VUOTE.has(p));
}

function pulisciArgomenti(argomenti: string[]): string[] {
  const visti = new Set<string>();
  const puliti: string[] = [];
  for (const a of argomenti) {
    const v = a.trim().slice(0, 60);
    if (!v) continue;
    const chiave = normalizza(v);
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    puliti.push(v);
  }
  return puliti.slice(0, 20);
}
