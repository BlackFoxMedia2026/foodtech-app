import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Il codice a sei cifre che cambia ogni trenta secondi (RFC 6238).
 *
 * ## Perché scritto a mano
 *
 * Perché è **trenta righe** e si prova contro i vettori pubblicati nello
 * standard: sotto ci sono gli stessi numeri che chiunque può ricalcolare. Una
 * dipendenza in più su un pezzo di autenticazione è una cosa da aggiornare per
 * sempre, e il giorno che non viene aggiornata nessuno se ne accorge.
 *
 * ## Le tre cose che rendono sicuro un codice a sei cifre
 *
 * **1. La finestra.** Gli orologi non coincidono mai: si accettano anche il
 * passo precedente e il successivo, cioè novanta secondi in tutto. Più larga
 * di così vorrebbe dire un codice che vive due minuti; più stretta vorrebbe
 * dire gente chiusa fuori per un telefono desincronizzato di venti secondi.
 *
 * **2. Il confronto a tempo costante.** Confrontare due stringhe con `===`
 * esce al primo carattere diverso, e i tempi di risposta raccontano quante
 * cifre erano giuste. Su un codice da sei cifre non è teoria.
 *
 * **3. Un codice usato non si riusa.** Questo file non lo sa fare — non ha
 * memoria — e chi lo usa deve tenere l'ultimo passo accettato: senza, un
 * codice intercettato vale per altri novanta secondi. Vedi
 * `server/due-fattori.ts`.
 */

/** Quanto dura un passo, in secondi. Trenta: è la convenzione di tutte le app. */
export const PASSO_SECONDI = 30;
/** Quante cifre. Sei, per lo stesso motivo. */
export const CIFRE = 6;
/** Quanti passi di tolleranza per lato. Uno: novanta secondi in tutto. */
export const TOLLERANZA = 1;

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Un segreto nuovo, in base32 come lo vogliono le app di autenticazione. */
export function nuovoSegreto(byte = 20): string {
  const grezzo = randomBytes(byte);
  let bit = 0;
  let valore = 0;
  let fuori = "";
  for (const b of grezzo) {
    valore = (valore << 8) | b;
    bit += 8;
    while (bit >= 5) {
      fuori += ALFABETO_BASE32[(valore >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) fuori += ALFABETO_BASE32[(valore << (5 - bit)) & 31];
  return fuori;
}

/** Da base32 ai byte. Tollerante su spazi e minuscole: i segreti si incollano. */
export function daBase32(s: string): Buffer {
  const pulito = s.toUpperCase().replace(/[\s=-]/g, "");
  let bit = 0;
  let valore = 0;
  const byte: number[] = [];
  for (const c of pulito) {
    const i = ALFABETO_BASE32.indexOf(c);
    if (i < 0) throw new Error("segreto_non_valido");
    valore = (valore << 5) | i;
    bit += 5;
    if (bit >= 8) {
      byte.push((valore >>> (bit - 8)) & 0xff);
      bit -= 8;
    }
  }
  return Buffer.from(byte);
}

/**
 * Il codice di un passo preciso.
 *
 * `algoritmo` esiste per una ragione sola: i vettori di prova dello standard
 * sono su SHA-1, SHA-256 e SHA-512, e volevo poterli eseguire tutti. In
 * esercizio si usa SHA-1, che è quello che leggono tutte le app — e qui non è
 * una debolezza: l'HMAC-SHA1 non è indebolito dalle collisioni di SHA-1.
 */
export function codicePerPasso(
  segreto: string,
  passo: number,
  algoritmo: "sha1" | "sha256" | "sha512" = "sha1",
): string {
  const chiave = daBase32(segreto);
  const contatore = Buffer.alloc(8);
  /* Otto byte, big-endian. `writeBigUInt64BE` e non due scritture da 32 bit:
     il contatore passa i quattro miliardi nel 2038, e una somma a 32 bit
     tornerebbe a zero senza dirlo. */
  contatore.writeBigUInt64BE(BigInt(passo));

  const hmac = createHmac(algoritmo, chiave).update(contatore).digest();
  /* Il troncamento dinamico dello standard: gli ultimi quattro bit dicono da
     dove leggere i quattro byte del codice. */
  const inizio = hmac[hmac.length - 1]! & 0x0f;
  const numero =
    ((hmac[inizio]! & 0x7f) << 24) |
    (hmac[inizio + 1]! << 16) |
    (hmac[inizio + 2]! << 8) |
    hmac[inizio + 3]!;

  return String(numero % 10 ** CIFRE).padStart(CIFRE, "0");
}

/** Il passo in cui cade un istante. */
export function passoDi(adesso: Date = new Date()): number {
  return Math.floor(adesso.getTime() / 1000 / PASSO_SECONDI);
}

export type EsitoCodice =
  | { ok: true; passo: number }
  | { ok: false; perche: "forma" | "non_valido" };

/**
 * Verifica un codice, e **dice in che passo era**.
 *
 * Il passo torna indietro per una ragione precisa: chi chiama deve poterlo
 * conservare e rifiutare lo stesso codice una seconda volta. Una funzione che
 * risponde solo «sì» lascia un codice valido per tutta la sua finestra a
 * chiunque l'abbia visto passare.
 */
export function verificaCodice(
  segreto: string,
  codice: string,
  opz: { adesso?: Date; ultimoPassoUsato?: number | null } = {},
): EsitoCodice {
  const pulito = (codice ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(pulito)) return { ok: false, perche: "forma" };

  const centro = passoDi(opz.adesso ?? new Date());
  for (let d = -TOLLERANZA; d <= TOLLERANZA; d++) {
    const passo = centro + d;
    /* Un passo già usato non vale più, nemmeno se il codice è giusto. */
    if (opz.ultimoPassoUsato != null && passo <= opz.ultimoPassoUsato) continue;

    const atteso = codicePerPasso(segreto, passo);
    const a = Buffer.from(atteso);
    const b = Buffer.from(pulito);
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, passo };
  }
  return { ok: false, perche: "non_valido" };
}

/**
 * L'indirizzo `otpauth://` da mettere nel QR.
 *
 * L'etichetta contiene il nome del locale **e** l'indirizzo di chi entra:
 * nell'app di autenticazione compaiono decine di righe, e «Tavolo» da solo non
 * dice a quale locale né a quale persona appartiene.
 */
export function indirizzoOtpauth(opz: {
  segreto: string;
  email: string;
  emittente: string;
}): string {
  const etichetta = encodeURIComponent(`${opz.emittente}:${opz.email}`);
  const parametri = new URLSearchParams({
    secret: opz.segreto,
    issuer: opz.emittente,
    algorithm: "SHA1",
    digits: String(CIFRE),
    period: String(PASSO_SECONDI),
  });
  return `otpauth://totp/${etichetta}?${parametri.toString()}`;
}
