import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * Cifrare a riposo i pochi segreti che **devono** restare leggibili.
 *
 * La password del Wi-Fi non si può trattare come la password di un utente:
 * quella si trasforma in un'impronta e non torna più indietro, perché nessuno
 * ha bisogno di rileggerla. Questa invece va **riletta e mostrata**: è il
 * motivo per cui il portale esiste — chi lascia un contatto riceve la
 * password della rete.
 *
 * Quindi non si può nascondere: si può solo mettere sotto chiave. Se un
 * giorno qualcuno leggesse una copia del database — un backup finito nel
 * posto sbagliato, un accesso di troppo — con la cifratura trova una stringa
 * che non serve a niente senza la chiave, che nel database non c'è.
 *
 * ## Come
 *
 * AES-256-GCM, chiave da variabile d'ambiente, un vettore d'inizializzazione
 * nuovo a ogni scrittura. GCM e non CBC perché porta con sé un sigillo: se
 * qualcuno modifica un byte del testo cifrato, la lettura **fallisce** invece
 * di restituire spazzatura che sembra una password.
 *
 * Il formato porta la versione davanti (`v1:`): il giorno in cui si cambia
 * algoritmo, le righe vecchie si riconoscono e si continuano a leggere.
 *
 * ## Senza chiave
 *
 * Il valore si salva **in chiaro con un'etichetta esplicita** (`chiaro:`), e
 * l'interfaccia lo dice. Non è una scorciatoia nascosta: è la stessa scelta
 * fatta per l'email e per l'error tracking — una funzione che dipende da una
 * credenziale che non c'è **dichiara** il suo stato invece di finto-funzionare
 * o di rifiutare il lavoro. Rifiutare qui vorrebbe dire che un locale non può
 * accendere il portale Wi-Fi finché non si configura una chiave, e sarebbe
 * peggio: perderebbe contatti veri per un rischio ipotetico.
 *
 * Il giorno in cui la chiave arriva, le righe vecchie continuano a leggersi e
 * passano sotto chiave alla prima riscrittura.
 */

const PREFISSO_CIFRATO = "v1";
const PREFISSO_CHIARO = "chiaro";

/**
 * La chiave, da `CHIAVE_CIFRATURA`.
 *
 * Si accettano 32 byte in base64 o in esadecimale — che è come le generano
 * `openssl rand -base64 32` e `openssl rand -hex 32`. Qualunque altra cosa si
 * riduce a 32 byte con SHA-256: una passphrase scritta a mano è una chiave
 * debole, ma è meglio di un errore al deploy che spegne il portale.
 */
function chiave(): Buffer | null {
  const raw = process.env.CHIAVE_CIFRATURA?.trim();
  if (!raw) return null;

  const daBase64 = Buffer.from(raw, "base64");
  if (daBase64.length === 32) return daBase64;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");

  return createHash("sha256").update(raw).digest();
}

/** Vero se questa installazione ha una chiave configurata. */
export function cifraturaAttiva(): boolean {
  return chiave() !== null;
}

/** Vero se questo valore è sotto chiave (e non in chiaro con l'etichetta). */
export function eCifrato(valore: string | null | undefined): boolean {
  return !!valore?.startsWith(`${PREFISSO_CIFRATO}:`);
}

export function cifra(testo: string | null): string | null {
  if (testo === null || testo === "") return testo;

  const k = chiave();
  if (!k) return `${PREFISSO_CHIARO}:${testo}`;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const cifrato = Buffer.concat([cipher.update(testo, "utf8"), cipher.final()]);
  const sigillo = cipher.getAuthTag();

  return [
    PREFISSO_CIFRATO,
    iv.toString("base64"),
    sigillo.toString("base64"),
    cifrato.toString("base64"),
  ].join(":");
}

/**
 * Rilegge un valore, in qualunque forma sia stato scritto.
 *
 * Tre casi, e servono tutti e tre: sotto chiave, in chiaro con l'etichetta, e
 * **senza etichetta** — che sono le righe scritte prima che questo file
 * esistesse. Nessuna migrazione di dati: le righe vecchie si leggono e passano
 * sotto chiave alla prima riscrittura.
 */
export function decifra(valore: string | null): string | null {
  if (!valore) return valore;

  if (valore.startsWith(`${PREFISSO_CHIARO}:`)) {
    return valore.slice(PREFISSO_CHIARO.length + 1);
  }

  if (!valore.startsWith(`${PREFISSO_CIFRATO}:`)) {
    // Riga scritta prima della cifratura: è il valore stesso.
    return valore;
  }

  const k = chiave();
  if (!k) {
    // Non si finge di aver letto: un valore cifrato senza chiave **non è
    // leggibile**, e chi chiama deve poterlo distinguere da una password
    // vuota.
    throw new ErroreDiCifratura("chiave_mancante");
  }

  const [, ivB64, sigilloB64, cifratoB64] = valore.split(":");
  if (!ivB64 || !sigilloB64 || !cifratoB64) throw new ErroreDiCifratura("formato_non_valido");

  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(sigilloB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(cifratoB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    /**
     * Il sigillo non torna: o la chiave è cambiata, o qualcuno ha modificato
     * la riga. In entrambi i casi **non si restituisce niente**: una password
     * sbagliata mostrata a un cliente è peggio di un errore, perché il
     * cliente prova, non si collega, e dà la colpa al ristorante.
     */
    throw new ErroreDiCifratura("sigillo_non_valido");
  }
}

export class ErroreDiCifratura extends Error {
  constructor(public code: "chiave_mancante" | "formato_non_valido" | "sigillo_non_valido") {
    super(code);
    this.name = "ErroreDiCifratura";
  }
}
