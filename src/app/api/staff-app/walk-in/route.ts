import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { tavoloAccomodabile } from "@/server/staff-app/accesso-tavolo";
import { tavoliPerWalkIn, walkInDalTelefono } from "@/server/staff-app/accoglienza";

/**
 * **Walk-in dal telefono** — due persone senza prenotazione.
 *
 * Il percorso esisteva solo in back office: per registrare due persone entrate
 * dalla porta bisognava andare a un computer. Qui sono due informazioni —
 * quante persone, quale tavolo — e il nome resta facoltativo, perché chiederlo
 * mentre si accompagna qualcuno al tavolo è una cortesia, non un campo
 * obbligatorio.
 *
 * `GET ?coperti=2` propone i tavoli con lo stesso giudizio degli ospiti
 * arrivati: un walk-in da due non deve occupare il sei posti solo perché è
 * entrato da un'altra porta del prodotto.
 */
export async function GET(req: Request) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  const coperti = Number(new URL(req.url).searchParams.get("coperti") ?? "2");
  if (!Number.isInteger(coperti) || coperti < 1 || coperti > 50) {
    return apiError(422, "coperti_non_validi", "Il numero di ospiti non è valido.");
  }

  try {
    const proposta = await tavoliPerWalkIn(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      coperti,
    );
    return NextResponse.json({ coperti, proposta }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return staffErrorResponse(err);
  }
}

const Input = z.object({
  partySize: z.coerce.number().int().min(1).max(50),
  tableId: z.string().min(1),
  nome: z.string().max(120).optional().nullable(),
  telefono: z.string().max(40).optional().nullable(),
});

export async function POST(req: Request) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  try {
    const dati = Input.parse(await req.json().catch(() => ({})));

    if (
      !(await tavoloAccomodabile(
        {
          venueId: ctx.venueId,
          timezone: ctx.timezone,
          waiterId: ctx.persona.waiterId,
          permessi: ctx.permessi,
        },
        dati.tableId,
      ))
    ) {
      return apiError(
        403,
        "non_assegnato",
        "Questo tavolo non è libero e non è fra i tuoi: chiedi al responsabile di sala.",
      );
    }

    const booking = await walkInDalTelefono(
      { venueId: ctx.venueId },
      {
        partySize: dati.partySize,
        tableId: dati.tableId,
        guestName: dati.nome ?? null,
        phone: dati.telefono ?? null,
      },
      attoreStaff(ctx, req),
    );

    return NextResponse.json({
      bookingId: booking.id,
      tableId: dati.tableId,
      coperti: booking.partySize,
    });
  } catch (err) {
    return staffErrorResponse(err);
  }
}
