/**
 * La chiave che accende il centralino dentro Tavolo.
 *
 * Il centralino **non è un altro gestionale**: il ristoratore vede il telefono
 * dentro Tavolo, nelle stesse schermate dove vede le prenotazioni. Quello che
 * compra è una chiave, e la chiave sblocca quelle funzioni nel suo locale.
 *
 * La chiave la emette **miocentralino** (il pannello di Black Fox), non Tavolo.
 * Tavolo la riceve incollata in un campo, controlla che sia autentica e
 * accende. Questo è il verso giusto: chi vende decide chi ha comprato, e il
 * gestionale non si mette a rilasciare licenze a se stesso.
 *
 * ## Com'è fatta
 *
 *     tvlc1.eyJ2IjoxLCJsIjoiY2x…IiwiZSI6IjIwMjctMDktMTcifQ.XDf7_1kQ…
 *     └───┘ └──────── contenuto ─────────┘ └────── firma ──────┘
 *
 *  - `tvlc1`: Tavolo Centralino, formato 1. Il numero sta **nella chiave** così
 *    un formato nuovo non spegne le chiavi vecchie: si riconosce quale leggere.
 *  - il contenuto è leggibile da chiunque, e va bene: dice per quale locale
 *    vale, quando scade e cosa accende. Non è un segreto, è un certificato.
 *  - la firma è **Ed25519**. Tavolo tiene solo la **chiave pubblica**: nemmeno
 *    chi leggesse tutti i segreti di Tavolo potrebbe fabbricare una licenza.
 *    La chiave privata sta in miocentralino e non esce da lì.
 *
 * Questo file non importa `node:crypto` di proposito: la forma si legge e si
 * prova da unità, e la verifica della firma vive in
 * `server/licenza-centralino.ts`, come per i token dell'API.
 */

/** Il marchio e il formato. Cambia solo se cambia la struttura. */
export const MARCHIO_LICENZA = "tvlc1";

/**
 * Quanto è lunga la firma, in caratteri.
 *
 * Una firma Ed25519 è **sempre** 64 byte, cioè 86 caratteri in base64url: non
 * è una lunghezza a caso, è una proprietà dell'algoritmo. Controllarla qui non
 * è un doppione della verifica — scarta la chiave tagliata a metà nell'incollarla
 * prima di scomodare la crittografia, e distingue «questa chiave è rotta» da
 * «questa chiave non è tua», che sono due telefonate diverse.
 */
export const FIRMA_LUNGHEZZA = 86;

/**
 * Le funzioni che una licenza può accendere.
 *
 * Oggi si vendono insieme — «il centralino» è una cosa sola per chi compra —
 * ma stanno separate perché un domani «il telefono che riconosce» e «il
 * telefono che prenota da solo» potrebbero costare diverso, e una licenza già
 * emessa non si riscrive.
 */
export const FUNZIONI_CENTRALINO = [
  /** Chi sta chiamando: la scheda dell'ospite mentre il telefono squilla. */
  "riconoscimento",
  /** La prenotazione presa al telefono che diventa una prenotazione vera. */
  "prenotazioni",
  /** I numeri del telefono: quante chiamate, quante diventate prenotazioni. */
  "statistiche",
] as const;

export type FunzioneCentralino = (typeof FUNZIONI_CENTRALINO)[number];

/** Cosa c'è scritto dentro una chiave. */
export type ContenutoLicenza = {
  /** Il formato del contenuto. */
  v: 1;
  /** Il locale per cui vale: l'identificativo, che non cambia mai. */
  l: string;
  /** Il nome del locale al momento dell'emissione: serve solo a leggerla. */
  n?: string;
  /** L'ultimo giorno di validità, `AAAA-MM-GG`. Assente = non scade. */
  e?: string;
  /** Le funzioni accese. Assente o vuoto = tutte quelle di oggi. */
  f?: string[];
  /** Quando è stata emessa, `AAAA-MM-GG`. Solo per leggerla. */
  d?: string;
};

export type LicenzaDivisa = {
  /** Il contenuto, ancora **non verificato**: leggibile, non ancora fidato. */
  contenuto: ContenutoLicenza;
  /** Il testo esatto su cui è stata calcolata la firma. */
  firmato: string;
  /** La firma, da verificare. */
  firma: string;
};

function daBase64url(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export function inBase64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

/**
 * Compone il testo di una chiave, dato il contenuto e la firma.
 *
 * Sta qui e non solo in miocentralino perché il testo su cui si firma **deve**
 * essere lo stesso da entrambe le parti: se una delle due lo costruisse a modo
 * suo, le firme non tornerebbero e non si capirebbe perché.
 */
export function testoDaFirmare(contenuto: ContenutoLicenza): string {
  return `${MARCHIO_LICENZA}.${inBase64url(JSON.stringify(contenuto))}`;
}

export function componiLicenza(contenuto: ContenutoLicenza, firma: string): string {
  return `${testoDaFirmare(contenuto)}.${firma}`;
}

/**
 * Legge una chiave incollata da una persona.
 *
 * `null` quando non è una chiave: prima di scomodare la crittografia si
 * scartano i caratteri a caso, e chi ha incollato mezza riga riceve «questa
 * non è una chiave» invece di «firma non valida», che non gli dice niente.
 *
 * È tollerante su una cosa sola, gli **spazi**: una chiave arriva per email o
 * su WhatsApp e si porta dietro spazi, capi a riga e a volte uno spazio in
 * mezzo. Toglierli non indebolisce niente — non sono caratteri validi in
 * base64url — e risparmia una telefonata.
 */
export function dividiLicenza(valore: string | null | undefined): LicenzaDivisa | null {
  if (!valore) return null;
  const pulita = valore.replace(/\s+/g, "");
  if (!pulita) return null;

  const pezzi = pulita.split(".");
  if (pezzi.length !== 3) return null;
  const [marchio, corpo, firma] = pezzi;
  if (marchio !== MARCHIO_LICENZA) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(corpo) || !/^[A-Za-z0-9_-]+$/.test(firma)) return null;
  if (firma.length !== FIRMA_LUNGHEZZA) return null;

  let contenuto: unknown;
  try {
    contenuto = JSON.parse(daBase64url(corpo));
  } catch {
    return null;
  }
  if (!contenuto || typeof contenuto !== "object") return null;

  const c = contenuto as Record<string, unknown>;
  if (c.v !== 1) return null;
  if (typeof c.l !== "string" || !c.l) return null;
  if (c.e != null && !(typeof c.e === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.e))) return null;
  if (c.f != null && !(Array.isArray(c.f) && c.f.every((x) => typeof x === "string"))) return null;

  return {
    contenuto: {
      v: 1,
      l: c.l,
      n: typeof c.n === "string" ? c.n : undefined,
      e: typeof c.e === "string" ? c.e : undefined,
      f: Array.isArray(c.f) ? (c.f as string[]) : undefined,
      d: typeof c.d === "string" ? c.d : undefined,
    },
    firmato: `${marchio}.${corpo}`,
    firma,
  };
}

/**
 * L'ultimo istante di validità, dal giorno scritto nella chiave.
 *
 * La chiave dice un **giorno**, non un istante: «scade il 17 settembre» per
 * una persona significa che il 17 settembre funziona ancora. Quindi la fine è
 * la mezzanotte *successiva*, non quella precedente — altrimenti una licenza
 * pagata fino al 17 si spegne la notte del 16 e il ristoratore la mattina non
 * ha il telefono.
 */
export function fineValidita(giorno: string | null | undefined): Date | null {
  if (!giorno) return null;
  const d = new Date(`${giorno}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
}

/** Le funzioni accese da un contenuto: vuoto significa «tutte». */
export function funzioniDi(contenuto: ContenutoLicenza): FunzioneCentralino[] {
  const chieste = contenuto.f;
  if (!chieste || chieste.length === 0) return [...FUNZIONI_CENTRALINO];
  return FUNZIONI_CENTRALINO.filter((f) => chieste.includes(f));
}

/**
 * Come si mostra una chiave in una schermata.
 *
 * Mai per intero: è lunga, non serve rileggerla, e una schermata che la
 * ripete è una schermata da cui si copia. Si mostrano le ultime otto lettere,
 * che bastano a rispondere a «è quella che ti ho mandato?».
 */
export function licenzaLeggibile(valore: string | null | undefined): string | null {
  if (!valore) return null;
  const pulita = valore.replace(/\s+/g, "");
  if (pulita.length < 8) return null;
  return `…${pulita.slice(-8)}`;
}
