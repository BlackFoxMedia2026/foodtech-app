import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAttenzione } from "@/lib/observability";
import { CAMPO_TRAPPOLA } from "@/lib/widget-trappola";

/**
 * Le difese del widget pubblico.
 *
 * Il limite di frequenza c'era già e non basta: rallenta un bot, non ferma
 * un'email inventata né un doppio tocco su una rete lenta. Qui ci sono le tre
 * cose che mancavano, e una sola regola le tiene insieme:
 *
 * > **una difesa che rifiuta una prenotazione vera costa più del problema che
 * > risolve.**
 *
 * Un ristorante perde più da un coperto rifiutato per sbaglio che da una
 * prenotazione falsa da cancellare. Perciò nessuna euristica sul contenuto
 * (nomi «strani», domini «sospetti»): solo fatti verificabili.
 *
 * Cosa **non** c'è, e perché: la verifica del contatto — un codice via email o
 * SMS. È la difesa vera contro gli indirizzi inventati, e serve un fornitore
 * che oggi non c'è. Resta scritta fra le cose aperte invece di essere
 * sostituita da un indovinello.
 */

/**
 * Il campo trappola: presente nel modulo, invisibile a chi lo compila.
 *
 * Un essere umano non lo vede e non lo riempie mai; un programma che riempie
 * tutti i campi lo riempie. Il nome vive in `lib/widget-trappola` perché lo
 * usa anche il modulo, che gira nel browser.
 */
export { CAMPO_TRAPPOLA } from "@/lib/widget-trappola";

/**
 * Vero quando la trappola è scattata.
 *
 * Chi la fa scattare riceve un rifiuto generico: **non gli si racconta una
 * finta conferma**. Far credere a qualcuno di avere un tavolo che non esiste
 * è una bugia anche quando quel qualcuno è un programma — e se un giorno la
 * trappola scattasse per errore su una persona vera, una conferma falsa
 * sarebbe il danno peggiore possibile.
 */
export function trappolaScattata(corpo: unknown): boolean {
  const valore = (corpo as Record<string, unknown> | null)?.[CAMPO_TRAPPOLA];
  return typeof valore === "string" && valore.trim().length > 0;
}

/** La chiave di idempotenza, se il client l'ha mandata in una forma sensata. */
export function chiaveIdempotenza(corpo: unknown): string | null {
  const valore = (corpo as Record<string, unknown> | null)?.idempotencyKey;
  if (typeof valore !== "string") return null;
  const pulita = valore.trim();
  // Una chiave lunghissima o vuota non è una chiave: si ignora e si procede
  // come se non ci fosse, invece di rifiutare una prenotazione vera.
  if (pulita.length < 8 || pulita.length > 100) return null;
  return pulita;
}

export type PrenotazioneGiaFatta = { id: string; reference: string; startsAt: Date; partySize: number };

/**
 * La prenotazione già creata da **questo stesso tentativo**.
 *
 * Il primo dei due modi in cui si evita il doppione, e il più preciso: la
 * chiave la genera il modulo una volta per tentativo, quindi due richieste con
 * la stessa chiave sono lo stesso tocco arrivato due volte.
 */
export async function giaFattaConQuestaChiave(
  venueId: string,
  chiave: string | null,
): Promise<PrenotazioneGiaFatta | null> {
  if (!chiave) return null;
  return db.booking.findFirst({
    where: { venueId, idempotencyKey: chiave },
    select: { id: true, reference: true, startsAt: true, partySize: true },
  });
}

/**
 * La stessa persona, lo stesso orario, lo stesso numero di coperti.
 *
 * Il secondo modo, per quando la chiave non c'è o è cambiata: il modulo
 * ricaricato e ricompilato, o due dispositivi. Il confronto è **esatto**
 * sull'orario e sui coperti, non «più o meno la stessa ora»: due amici che
 * prenotano lo stesso tavolo per orari diversi devono ottenere due
 * prenotazioni, e una difesa troppo larga glielo impedirebbe.
 */
export async function giaPrenotatoUgualeIdentico(
  venueId: string,
  input: {
    email?: string | null;
    phone?: string | null;
    startsAt: Date;
    partySize: number;
  },
): Promise<PrenotazioneGiaFatta | null> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) return null;

  return db.booking.findFirst({
    where: {
      venueId,
      startsAt: input.startsAt,
      partySize: input.partySize,
      deletedAt: null,
      // Una prenotazione annullata non è un doppione: se qualcuno riprenota
      // dopo aver disdetto, sta prenotando davvero.
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      guest: {
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    },
    select: { id: true, reference: true, startsAt: true, partySize: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * L'errore del database quando due richieste in parallelo usano la stessa
 * chiave: la seconda perde, e va trattata come un doppione, non come un
 * guasto.
 *
 * È il caso che nessun controllo preventivo può coprire — fra la lettura e la
 * scrittura, due richieste non si vedono — e per questo l'unicità la garantisce
 * l'indice, non il codice.
 */
export function eScontroDiChiave(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    String(err.meta?.target ?? "").includes("idempotencyKey")
  );
}

/** Una trappola scattata si annota: non è un errore, è un tentativo. */
export function annotaTrappola(venueId: string) {
  logAttenzione("widget.trappola", { venue: venueId });
}
