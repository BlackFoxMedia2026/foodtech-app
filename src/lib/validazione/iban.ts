/**
 * Validazione formale dell'IBAN (§35).
 *
 * ATTENZIONE a cosa dice e a cosa NON dice: qui si verifica che il codice sia
 * scritto correttamente — paese, lunghezza, caratteri, cifra di controllo — non
 * che il conto esista né che sia intestato a chi dichiara. Le due cose vengono
 * confuse spesso, e confonderle porta a dire "IBAN verificato" quando si è solo
 * controllata l'aritmetica.
 */

/** Lunghezza totale dell'IBAN per paese (registro ufficiale IBAN). */
const LUNGHEZZE: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** Lunghezza attesa per il paese, o null se il paese non è nel registro. */
export function lunghezzaIban(paese: string): number | null {
  return LUNGHEZZE[paese.toUpperCase()] ?? null;
}

export type EsitoIban =
  | { valido: true; normalizzato: string; paese: string }
  | { valido: false; errore: string };

/** Forma di memorizzazione: maiuscolo, senza spazi né punteggiatura. */
export function normalizzaIban(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Come si mostra a schermo: a gruppi di quattro, più leggibile. */
export function formattaIban(raw: string): string {
  return normalizzaIban(raw).replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Cifra di controllo mod-97 (ISO 13616): si spostano i primi quattro caratteri
 * in coda, si convertono le lettere in numeri (A=10 … Z=35) e il resto della
 * divisione per 97 deve essere 1.
 */
function mod97(iban: string): number {
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const ch of riordinato) {
    const valore = ch >= "0" && ch <= "9" ? ch : String(ch.charCodeAt(0) - 55);
    // Si procede a pezzi: il numero intero sarebbe troppo grande per un Number.
    for (const cifra of valore) {
      resto = (resto * 10 + Number(cifra)) % 97;
    }
  }
  return resto;
}

export function validaIban(raw: string): EsitoIban {
  const iban = normalizzaIban(raw);
  if (!iban) return { valido: false, errore: "IBAN mancante." };
  if (iban.length < 15) return { valido: false, errore: "IBAN troppo corto." };
  if (iban.length > 34) return { valido: false, errore: "IBAN troppo lungo." };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return {
      valido: false,
      errore: "Formato non valido: servono due lettere di paese, due cifre di controllo e poi il conto.",
    };
  }

  const paese = iban.slice(0, 2);
  const attesa = LUNGHEZZE[paese];
  if (!attesa) {
    return { valido: false, errore: `Paese «${paese}» non riconosciuto.` };
  }
  if (iban.length !== attesa) {
    return {
      valido: false,
      errore: `Per il paese ${paese} l'IBAN è di ${attesa} caratteri, questo ne ha ${iban.length}.`,
    };
  }
  if (mod97(iban) !== 1) {
    return {
      valido: false,
      errore: "Cifra di controllo errata: probabilmente c'è un carattere sbagliato.",
    };
  }
  return { valido: true, normalizzato: iban, paese };
}
