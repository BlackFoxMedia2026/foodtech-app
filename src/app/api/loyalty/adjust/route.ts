import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { LoyaltyError, rettificaPunti } from "@/server/loyalty";

const Body = z.object({
  guestId: z.string().min(1),
  /** Positivo aggiunge, negativo toglie. */
  punti: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(1, "Scrivi perché: fra sei mesi «+200 punti» senza motivo sembra un errore").max(200),
});

/**
 * Aggiunge o toglie punti a mano.
 *
 * `manage_venue` e non `manage_bookings`: regalare punti è una decisione
 * commerciale, e chi serve ai tavoli non deve poter creare valore dal nulla.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = Body.parse(await req.json());
    return NextResponse.json(await rettificaPunti(ctx.venueId, body, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof LoyaltyError) {
      if (err.code === "not_found") return apiError(404, "not_found", "Questo cliente non esiste.");
      if (err.code === "not_enough_points") {
        return apiError(409, err.code, "Non si può portare il saldo sotto zero: il cliente non ha tanti punti.");
      }
      return apiError(400, err.code, "Serve un numero di punti diverso da zero e un motivo scritto.");
    }
    return apiErrorResponse(err);
  }
}
