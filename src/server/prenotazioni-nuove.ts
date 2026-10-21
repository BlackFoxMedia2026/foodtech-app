import { db } from "@/lib/db";
import type { AzioneNuova, PrenotazioneRiquadro } from "@/lib/prenotazioni-nuove";
import { DEFAULT_VENUE_TIMEZONE, giornataInVenue } from "@/lib/venue-time";
import { recordAudit, type AuditActor } from "@/server/audit";
import { updateBooking } from "@/server/bookings";

/**
 * Le «Nuove» della Panoramica, e i tre gesti con cui si gestiscono.
 *
 * Le regole su chi è nuova stanno in `lib/prenotazioni-nuove.ts`; qui c'è la
 * stessa regola scritta come filtro del database, e le scritture.
 */

type ConOspite = {
  id: string;
  partySize: number;
  startsAt: Date;
  createdAt: Date;
  status: PrenotazioneRiquadro["status"];
  seenAt: Date | null;
  guest: { firstName: string; lastName: string | null } | null;
};

/** La forma che attraversa il confine server → browser: date in ISO. */
export function perIlRiquadro(b: ConOspite): PrenotazioneRiquadro {
  return {
    id: b.id,
    nome: b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in",
    partySize: b.partySize,
    startsAt: b.startsAt.toISOString(),
    createdAt: b.createdAt.toISOString(),
    status: b.status,
    seenAt: b.seenAt?.toISOString() ?? null,
  };
}

/**
 * Le prenotazioni da gestire, dalla giornata di oggi in avanti: una richiesta
 * arrivata adesso per sabato va confermata anche lei, e oggi.
 *
 * Quelle di ieri rimaste in attesa no: la sera è passata, non c'è più niente
 * da confermare.
 *
 * Le più recenti in cima: è l'ordine in cui arrivano, come le notifiche.
 */
export async function prenotazioniNuove(
  venueId: string,
  adesso: Date = new Date(),
  fuso: string = DEFAULT_VENUE_TIMEZONE,
): Promise<PrenotazioneRiquadro[]> {
  const { inizio } = giornataInVenue(adesso, fuso);
  const righe = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      startsAt: { gte: inizio },
      OR: [{ status: "PENDING" }, { status: "CONFIRMED", seenAt: null }],
    },
    select: {
      id: true,
      partySize: true,
      startsAt: true,
      createdAt: true,
      status: true,
      seenAt: true,
      guest: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return righe.map(perIlRiquadro);
}

/** La prenotazione non è più «nuova»: qualcuno l'ha già gestita. */
export class GiaGestitaError extends Error {
  constructor() {
    super("gia_gestita");
  }
}

/**
 * Conferma, rifiuta o segna come vista.
 *
 * Confermare e rifiutare passano da `updateBooking`, la stessa strada di ogni
 * altro cambio di stato, così valgono gli stessi effetti: il WhatsApp a chi ha
 * prenotato col risponditore, l'avviso del tavolo libero, la caparra da
 * restituire, il registro. Rifiutare è `CANCELLED`: per il locale una
 * richiesta rifiutata è una prenotazione che non ci sarà.
 *
 * Ogni gesto vale solo su ciò che il riquadro mostrava: se intanto un collega
 * l'ha confermata o rifiutata, la risposta è «già gestita», non un secondo
 * cambio di stato sopra il suo.
 */
export async function gestisciNuova(
  venueId: string,
  id: string,
  azione: AzioneNuova,
  actor?: AuditActor,
) {
  const b = await db.booking.findFirst({
    where: { id, venueId, deletedAt: null },
    select: { status: true, seenAt: true },
  });
  if (!b) throw new Error("not_found");

  if (azione === "conferma" || azione === "rifiuta") {
    if (b.status !== "PENDING") throw new GiaGestitaError();
    return updateBooking(
      venueId,
      id,
      { status: azione === "conferma" ? "CONFIRMED" : "CANCELLED" },
      { actor, segnaVista: true },
    );
  }

  // «Vista» ha senso solo su una confermata; due clic sull'occhio non sono un
  // errore, e la seconda volta non riscrive l'istante della prima.
  if (b.status !== "CONFIRMED") throw new GiaGestitaError();
  if (b.seenAt) return db.booking.findUniqueOrThrow({ where: { id } });
  const aggiornata = await db.booking.update({ where: { id }, data: { seenAt: new Date() } });
  await recordAudit(actor, "booking.seen", "booking", id);
  return aggiornata;
}
