import { z } from "zod";
import { db } from "@/lib/db";
import type { AuditActor } from "./audit";
import { recordAudit } from "./audit";
import { createBooking } from "./bookings";
import { findFreeTables, type FreeTableSearch } from "./table-search";

/**
 * Walk-in: chi entra senza aver prenotato.
 *
 * È il gesto più frequente e più frettoloso di una serata, e prima non aveva
 * un percorso: bisognava aprire «nuova prenotazione», compilare un form
 * pensato per il telefono — nome, cognome, email, data, ora, durata, fonte — e
 * poi assegnare il tavolo. Con una persona in piedi davanti che aspetta.
 *
 * Qui servono due informazioni: **quante persone** e **quale tavolo**. Il nome
 * è facoltativo, perché spesso non c'è tempo di chiederlo e la scheda ospite
 * si compila dopo, se serve.
 *
 * `BookingSource.WALK_IN` esisteva già: quello che mancava era il percorso.
 */

export const WalkInInput = z.object({
  partySize: z.coerce.number().int().min(1).max(50),
  tableId: z.string().min(1, "Serve il tavolo su cui accomodare."),
  /** Facoltativo di proposito: un walk-in senza nome è normale. */
  guestName: z.string().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  /** Durata prevista: cambia quando il tavolo tornerà libero per gli altri. */
  durationMin: z.coerce.number().int().min(15).max(480).optional(),
});

export type WalkInInputType = z.infer<typeof WalkInInput>;

/** I tavoli su cui si può accomodare adesso un gruppo di N persone. */
export function findTablesForWalkIn(
  venueId: string,
  partySize: number,
  opts: { now?: Date; durationMin?: number; includeSmaller?: boolean } = {},
): Promise<FreeTableSearch> {
  return findFreeTables(venueId, {
    partySize,
    startsAt: opts.now ?? new Date(),
    durationMin: opts.durationMin,
    includeSmaller: opts.includeSmaller,
  });
}

/**
 * Accomoda un walk-in: crea una prenotazione già seduta.
 *
 * Passa da `createBooking`, quindi il controllo di disponibilità vale anche
 * qui: se quel tavolo è occupato o il locale è chiuso, l'errore che torna è
 * quello del motore, con i motivi in chiaro.
 */
export async function seatWalkIn(venueId: string, raw: unknown, actor?: AuditActor) {
  const data = WalkInInput.parse(raw);
  const now = new Date();

  const nome = data.guestName?.trim();
  const booking = await createBooking(
    venueId,
    {
      // Senza nome non si crea una scheda ospite: un «Tavolo 7, due persone»
      // nel CRM è rumore, e il CRM è il posto dove i nomi devono valere.
      guest: nome
        ? {
            firstName: nome.split(" ")[0] || nome,
            lastName: nome.split(" ").slice(1).join(" ") || null,
            phone: data.phone || null,
          }
        : undefined,
      partySize: data.partySize,
      startsAt: now,
      // Senza una durata scelta decide `createBooking` con la misura del
      // locale: un walk-in a pranzo non sta a tavola come uno del sabato sera.
      durationMin: data.durationMin,
      tableId: data.tableId,
      source: "WALK_IN",
      notes: data.notes || null,
    },
    // Un walk-in è seduto per definizione: sta già al tavolo mentre lo
    // registriamo.
    { actor, status: "SEATED" },
  );

  await recordAudit(actor, "booking.walk_in", "booking", booking.id, {
    persone: booking.partySize,
    tavolo: data.tableId,
    ospite: nome || null,
  });

  return booking;
}

/**
 * Quanti walk-in stasera: serve alla Panoramica e, più avanti, alla modalità
 * servizio. Un locale che vive di walk-in ha bisogno di saperlo per decidere
 * quanti tavoli tenere liberi.
 */
export async function countWalkInsToday(venueId: string, from: Date, to: Date) {
  return db.booking.count({
    where: {
      venueId,
      source: "WALK_IN",
      startsAt: { gte: from, lte: to },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
  });
}
