import { randomBytes } from "crypto";

/**
 * Il segreto stampato sull'adesivo del tavolo.
 *
 * ## Perché non l'identificativo del tavolo
 *
 * `Table.id` è un `cuid()`, e in un URL pubblico un cuid ha due difetti. Il
 * primo è noto: porta dentro di sé un contatore e un'impronta della macchina,
 * quindi non è imprevedibile quanto sembra. Il secondo è peggiore e si vede
 * solo al tavolo — i cuid dei tavoli creati nello stesso minuto **si
 * somigliano**, e due QR appoggiati uno accanto all'altro mostrerebbero due
 * stringhe quasi identiche. Da lì a provare la variante del vicino, e a
 * leggere cosa stanno mangiando al tavolo accanto, c'è un passo.
 *
 * Qui invece sono 24 byte da `randomBytes` — il generatore crittografico del
 * sistema — scritti in base64url: 192 bit, nessuna struttura, niente da
 * confrontare. Indovinarne uno per tentativi non è una cosa che si fa.
 *
 * ## Perché non è firmato come i link delle prenotazioni
 *
 * `lib/booking-token.ts` firma con HMAC perché quei link sono **usa e getta**
 * e nascono da un identificativo che esiste già: la firma li lega a
 * un'azione e li rende non falsificabili senza dover salvare niente.
 *
 * Il QR del tavolo è l'opposto: è **permanente** — si stampa una volta e resta
 * incollato al legno per anni — e deve poter essere **revocato** quando
 * l'adesivo finisce in una foto su Instagram. Una firma non si revoca: vale
 * finché vale il segreto, e quel segreto è lo stesso di tutti gli altri link
 * del prodotto. Una riga nel database sì: si sovrascrive, e il vecchio
 * adesivo smette di funzionare nell'istante in cui il locale lo decide.
 */

/** 24 byte: 192 bit di casualità vera, 32 caratteri in un URL. */
const BYTE = 24;

export function generaPayToken(): string {
  return randomBytes(BYTE).toString("base64url");
}

/**
 * La forma di un token valido.
 *
 * Serve a non interrogare il database per stringhe che non possono essere un
 * token: chi prova `/pay/../../etc/passwd` o `/pay/` + mille caratteri riceve
 * la stessa risposta di chi prova un token sbagliato, senza aver fatto
 * lavorare Postgres.
 */
const FORMA = /^[A-Za-z0-9_-]{32}$/;

export function tokenPlausibile(raw: string | undefined | null): raw is string {
  return typeof raw === "string" && FORMA.test(raw);
}

/** L'indirizzo che finisce dentro il QR. */
export function urlPagamento(token: string, base = process.env.NEXT_PUBLIC_APP_URL ?? ""): string {
  return `${base.replace(/\/$/, "")}/pay/${token}`;
}
