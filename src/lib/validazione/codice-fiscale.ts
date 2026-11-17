/**
 * Validazione del codice fiscale delle persone fisiche (§36).
 *
 * Come per l'IBAN: si verifica che il codice sia formalmente corretto, non che
 * appartenga davvero a quella persona. Per quello servirebbe l'Agenzia delle
 * Entrate.
 */

const PARI: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11,
  M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22,
  X: 23, Y: 24, Z: 25,
};

const DISPARI: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19,
  "9": 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16,
  V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const CONTROLLO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type EsitoCf =
  | { valido: true; normalizzato: string }
  | { valido: false; errore: string };

export function normalizzaCf(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function validaCodiceFiscale(raw: string): EsitoCf {
  const cf = normalizzaCf(raw);
  if (!cf) return { valido: false, errore: "Codice fiscale mancante." };
  if (cf.length !== 16) {
    return { valido: false, errore: `Il codice fiscale ha 16 caratteri, questo ne ha ${cf.length}.` };
  }
  // Le posizioni omocodiche possono avere lettere al posto delle cifre, quindi
  // si accetta l'alfanumerico e si lascia decidere alla cifra di controllo.
  if (!/^[A-Z0-9]{16}$/.test(cf)) {
    return { valido: false, errore: "Sono ammesse solo lettere e cifre." };
  }
  if (!/^[A-Z]{6}[0-9A-Z]{2}[A-Z][0-9A-Z]{2}[A-Z][0-9A-Z]{3}[A-Z]$/.test(cf)) {
    return { valido: false, errore: "Formato non valido per un codice fiscale di persona fisica." };
  }

  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const ch = cf[i];
    // Le posizioni si contano da 1: dispari la 1ª, 3ª, 5ª…
    somma += (i + 1) % 2 === 0 ? PARI[ch] : DISPARI[ch];
  }
  const atteso = CONTROLLO[somma % 26];
  if (cf[15] !== atteso) {
    return {
      valido: false,
      errore: "Carattere di controllo errato: probabilmente c'è un carattere sbagliato.",
    };
  }
  return { valido: true, normalizzato: cf };
}

/** Omocodia: nelle posizioni delle cifre una lettera può stare al posto della cifra (L=0 … V=9). */
const OMOCODIA = "LMNPQRSTUV";
const POSIZIONI_CIFRE = [6, 7, 9, 10, 12, 13, 14];
const MESI = "ABCDEHLMPRST";

function senzaOmocodia(cf: string): string {
  const c = cf.split("");
  for (const i of POSIZIONI_CIFRE) if (OMOCODIA.includes(c[i])) c[i] = String(OMOCODIA.indexOf(c[i]));
  return c.join("");
}

/** Solo le lettere, senza accenti né apostrofi («D'Amélio» → «DAMELIO»). */
function lettere(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
}
const consonanti = (s: string) => s.replace(/[AEIOU]/g, "");
const vocali = (s: string) => s.replace(/[^AEIOU]/g, "");

/** Le tre lettere del cognome: consonanti, poi vocali, poi X. */
export function lettereCognome(cognome: string): string {
  const l = lettere(cognome);
  return (consonanti(l) + vocali(l) + "XXX").slice(0, 3);
}

/** Le tre lettere del nome: con quattro consonanti o più, la 1ª, la 3ª e la 4ª. */
export function lettereNome(nome: string): string {
  const l = lettere(nome);
  const c = consonanti(l);
  return c.length >= 4 ? c[0] + c[2] + c[3] : (c + vocali(l) + "XXX").slice(0, 3);
}

/** Data di nascita e sesso scritti nel codice (l'anno ha solo due cifre). */
export function datiDaCf(raw: string): { anno: string; mese: number; giorno: number; sesso: "M" | "F" } | null {
  const cf = senzaOmocodia(normalizzaCf(raw));
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}/.test(cf)) return null;
  const mese = MESI.indexOf(cf[8]) + 1;
  const g = Number(cf.slice(9, 11));
  const giorno = g > 40 ? g - 40 : g;
  if (!mese || giorno < 1 || giorno > 31) return null;
  return { anno: cf.slice(6, 8), mese, giorno, sesso: g > 40 ? "F" : "M" };
}

/**
 * Cosa del codice fiscale (già valido) non torna con cognome, nome, data di
 * nascita e sesso scritti nella scheda: vuoto se torna tutto, o se mancano i dati
 * per confrontare. Il comune di nascita non si controlla: servirebbe la
 * tabella dei codici catastali.
 */
export function incoerenzeCf(
  raw: string,
  { cognome, nome, dataNascita, sesso }: { cognome?: string; nome?: string; dataNascita?: string; sesso?: string },
): string[] {
  const cf = normalizzaCf(raw);
  const diverse: string[] = [];
  if (cognome?.trim() && lettere(cognome) && cf.slice(0, 3) !== lettereCognome(cognome)) diverse.push("cognome");
  if (nome?.trim() && lettere(nome) && cf.slice(3, 6) !== lettereNome(nome)) diverse.push("nome");
  const nascita = datiDaCf(cf);
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataNascita ?? "");
  if (nascita && data && (data[1].slice(2) !== nascita.anno || Number(data[2]) !== nascita.mese || Number(data[3]) !== nascita.giorno))
    diverse.push("data di nascita");
  if (nascita && (sesso === "M" || sesso === "F") && nascita.sesso !== sesso) diverse.push("sesso");
  return diverse;
}

/**
 * Partita IVA italiana: 11 cifre con controllo di Luhn sui pesi dispari.
 * Serve per le società, dove `tax_code` può essere la partita IVA.
 */
export function validaPartitaIva(raw: string): EsitoCf {
  const pi = (raw ?? "").trim().replace(/^IT/i, "").replace(/\D/g, "");
  if (!pi) return { valido: false, errore: "Partita IVA mancante." };
  if (pi.length !== 11) {
    return { valido: false, errore: `La partita IVA ha 11 cifre, questa ne ha ${pi.length}.` };
  }
  let somma = 0;
  for (let i = 0; i < 11; i++) {
    let n = Number(pi[i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somma += n;
  }
  if (somma % 10 !== 0) {
    return { valido: false, errore: "Cifra di controllo errata." };
  }
  return { valido: true, normalizzato: pi };
}
