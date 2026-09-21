import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { calendarioIcal, type EventoCalendario } from "@/lib/ical";
import { recordAudit, type AuditActor } from "@/server/audit";

/**
 * Le prenotazioni nel calendario del locale.
 *
 * ## Cosa risolve
 *
 * Chi gestisce un ristorante guarda il telefono venti volte al giorno, e non
 * guarda un gestionale venti volte al giorno. Un indirizzo a cui **abbonare**
 * il calendario mette le prenotazioni dove già guarda — accanto agli
 * appuntamenti del commercialista e alla partita del figlio — e non chiede di
 * installare niente.
 *
 * `Venue.calendarToken` esisteva nello schema **con il vincolo di unicità**, e
 * nessuna riga di codice lo leggeva o lo scriveva: una funzione dichiarata e
 * mai fatta. Questo file la fa.
 *
 * ## Perché un segreto nell'indirizzo, e non la sessione
 *
 * Perché un calendario lo chiede il telefono, non una persona: nessuna
 * applicazione di calendario sa fare l'accesso. L'indirizzo **è** la
 * credenziale, e da questo seguono tre conseguenze che non sono negoziabili:
 *
 *  - il segreto è lungo (32 byte casuali): non si indovina e non si prova;
 *  - si può **rigenerare**, perché un indirizzo condiviso per sbaglio si
 *    revoca solo così;
 *  - nel calendario finisce **il meno possibile**: nome, coperti, ora, note
 *    interne. Niente telefono, niente email, niente allergie — chi ha il link
 *    non deve ritrovarsi in mano la rubrica del locale.
 */

/** Da quanti giorni indietro si parte: il servizio di ieri serve ancora. */
export const GIORNI_INDIETRO = 7;
/** Fin dove si guarda avanti. Oltre, un calendario diventa illeggibile. */
export const GIORNI_AVANTI = 90;

/** Gli stati che occupano un tavolo davvero: le disdette non si mostrano. */
const DA_MOSTRARE = ["PENDING", "CONFIRMED", "SEATED", "COMPLETED"] as const;

function nuovoSegreto(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * L'indirizzo a cui abbonarsi, creando il segreto la prima volta.
 *
 * Il segreto nasce **quando qualcuno chiede il link**, non alla creazione del
 * locale: un segreto che esiste senza che nessuno l'abbia chiesto è una porta
 * aperta che nessuno sorveglia.
 */
export async function linkCalendario(
  venueId: string,
  actor?: AuditActor,
): Promise<{ percorso: string }> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { calendarToken: true },
  });
  if (!venue) throw new Error("not_found");

  if (venue.calendarToken) return { percorso: `/api/calendario/${venue.calendarToken}` };

  const token = nuovoSegreto();
  await db.venue.update({ where: { id: venueId }, data: { calendarToken: token } });
  await recordAudit(actor, "venue.calendario_link", "venue", venueId, { creato: true });
  return { percorso: `/api/calendario/${token}` };
}

/**
 * Cambia il segreto: il vecchio indirizzo smette di funzionare.
 *
 * È l'unico modo di togliere le prenotazioni dal telefono di chi non lavora
 * più qui, e per questo esiste prima che serva.
 */
export async function rigeneraLinkCalendario(
  venueId: string,
  actor?: AuditActor,
): Promise<{ percorso: string }> {
  const token = nuovoSegreto();
  const aggiornati = await db.venue.updateMany({
    where: { id: venueId },
    data: { calendarToken: token },
  });
  if (aggiornati.count === 0) throw new Error("not_found");
  await recordAudit(actor, "venue.calendario_link", "venue", venueId, { rigenerato: true });
  return { percorso: `/api/calendario/${token}` };
}

/** Lo stato per la schermata: c'è un link, e qual è. */
export async function vistaCalendario(
  venueId: string,
): Promise<{ attivo: boolean; percorso: string | null }> {
  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: { calendarToken: true },
  });
  return venue?.calendarToken
    ? { attivo: true, percorso: `/api/calendario/${venue.calendarToken}` }
    : { attivo: false, percorso: null };
}

/**
 * Il calendario da servire, cercato **per segreto**.
 *
 * `null` quando il segreto non esiste: la rotta risponde 404 e non «non
 * autorizzato», perché un indirizzo di calendario sbagliato non deve
 * confermare che da qualche parte ce n'è uno giusto.
 */
export async function feedCalendario(
  token: string,
  adesso: Date = new Date(),
): Promise<string | null> {
  if (!token || token.length < 20) return null;

  const venue = await db.venue.findUnique({
    where: { calendarToken: token },
    select: { id: true, name: true, address: true },
  });
  if (!venue) return null;

  const da = new Date(adesso.getTime() - GIORNI_INDIETRO * 86_400_000);
  const a = new Date(adesso.getTime() + GIORNI_AVANTI * 86_400_000);

  const prenotazioni = await db.booking.findMany({
    where: {
      venueId: venue.id,
      deletedAt: null,
      startsAt: { gte: da, lte: a },
      status: { in: [...DA_MOSTRARE] },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      partySize: true,
      status: true,
      reference: true,
      internalNotes: true,
      notes: true,
      updatedAt: true,
      guest: { select: { firstName: true, lastName: true } },
      table: { select: { label: true } },
    },
  });

  const eventi: EventoCalendario[] = prenotazioni.map((b) => {
    const chi = b.guest
      ? `${b.guest.firstName}${b.guest.lastName ? ` ${b.guest.lastName}` : ""}`
      : "Senza nome";
    return {
      /* L'identificativo della prenotazione, non un numero nuovo: così una
         prenotazione spostata **si sposta** nel calendario di chi è abbonato,
         invece di comparire due volte. */
      uid: `prenotazione-${b.id}@tavolo`,
      inizio: b.startsAt,
      fine: new Date(b.startsAt.getTime() + b.durationMin * 60_000),
      titolo: `${chi} · ${b.partySize} ${b.partySize === 1 ? "persona" : "persone"}${
        b.table ? ` · ${b.table.label}` : ""
      }`,
      dettagli: [
        b.status === "PENDING" ? "Da confermare" : null,
        b.notes ? `Nota del cliente: ${b.notes}` : null,
        b.internalNotes,
        `Riferimento ${b.reference}`,
      ],
      luogo: venue.address,
      aggiornato: b.updatedAt,
    };
  });

  return calendarioIcal({ nome: `${venue.name} · Prenotazioni`, eventi, adesso });
}
