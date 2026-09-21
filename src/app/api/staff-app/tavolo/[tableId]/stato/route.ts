import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { tavoloConsentito } from "@/server/staff-app/accesso-tavolo";
import { apriTavolo } from "@/server/staff-app/tavolo";
import { updateBooking } from "@/server/bookings";
import { db } from "@/lib/db";

/**
 * Il cambio di stato del tavolo, dal telefono.
 *
 * **Non c'è una colonna «stato del tavolo»**, e questa rotta è il motivo per
 * cui non serve: quello che il cameriere chiama «accomodare», «liberare»,
 * «segnare assente» è sempre una transizione della **prenotazione**, e passa
 * dalla stessa `updateBooking` che usa il back office. Due strade per lo
 * stesso fatto avrebbero prodotto due storie diverse dello stesso tavolo — ed
 * è precisamente quello che il §6 del brief chiede di evitare.
 *
 * Gli stati in più che il cameriere vede («ordinazione in corso», «comanda
 * inviata», «in servizio») non si scrivono da nessuna parte: si **deducono**
 * dalle comande, in `lib/stato-tavolo-staff.ts`.
 */
const AZIONI = {
  /* Arrivati e in attesa all'ingresso. */
  in_arrivo: "ARRIVED",
  accomoda: "SEATED",
  libera: "COMPLETED",
  assente: "NO_SHOW",
} as const;

const Input = z.object({ azione: z.enum(["in_arrivo", "accomoda", "libera", "assente"]) });

export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  if (!(await tavoloConsentito({ ...ctx, waiterId: ctx.persona.waiterId }, params.tableId))) {
    return apiError(403, "non_assegnato", "Questo tavolo non è fra i tuoi.");
  }

  try {
    const { azione } = Input.parse(await req.json().catch(() => ({})));

    /*
      Quale prenotazione muovere: quella seduta se c'è, altrimenti la prossima
      di oggi su questo tavolo. È la stessa scelta che farebbe una persona
      guardando il tavolo, e toglie al cameriere un passaggio che non ha
      motivo di fare — sul suo schermo c'è un tavolo, non un'agenda.
    */
    const inizio = new Date();
    inizio.setHours(0, 0, 0, 0);
    const fine = new Date();
    fine.setHours(23, 59, 59, 999);

    const candidate = await db.booking.findMany({
      where: {
        venueId: ctx.venueId,
        tableId: params.tableId,
        startsAt: { gte: inizio, lte: fine },
        deletedAt: null,
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, status: true },
    });

    const bersaglio =
      candidate.find((b) => b.status === "SEATED") ??
      candidate.find((b) => b.status === "ARRIVED") ??
      candidate[0];

    if (!bersaglio) {
      return apiError(
        409,
        "nessuna_prenotazione",
        "Su questo tavolo non c'è nessuna prenotazione di oggi da spostare.",
      );
    }

    await updateBooking(
      ctx.venueId,
      bersaglio.id,
      { status: AZIONI[azione] },
      // Segnare arrivo o seduta non sposta orario, coperti o tavolo: la
      // disponibilità non ha niente da verificare, e ricontrollarla
      // rifiuterebbe di accomodare su un tavolo occupato da questa stessa
      // prenotazione. Identico a `/api/bookings/[id]/status`.
      { skipAvailabilityCheck: true, actor: attoreStaff(ctx, req) },
    );

    const tavolo = await apriTavolo(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.tableId,
    );
    return NextResponse.json(tavolo);
  } catch (err) {
    return staffErrorResponse(err);
  }
}
