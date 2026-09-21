import { NextResponse } from "next/server";
import { formatCurrency } from "@/lib/utils";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { LoyaltyError, riscattaPunti } from "@/server/loyalty";

const Body = z.object({
  guestId: z.string().min(1),
  punti: z.coerce.number().int().min(1, "Scrivi quanti punti usare").max(1_000_000),
  orderId: z.string().optional().nullable(),
  bookingId: z.string().optional().nullable(),
  reason: z.string().trim().max(200).optional().nullable(),
});

/** Usa i punti di un cliente come sconto: lo fa chi sta servendo. */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = Body.parse(await req.json());
    return NextResponse.json(await riscattaPunti(ctx.venueId, body, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof LoyaltyError) {
      if (err.code === "not_found") return apiError(404, "not_found", "Questo cliente non esiste.");
      if (err.code === "loyalty_off") {
        return apiError(
          409,
          err.code,
          "La raccolta punti è spenta: si accende dalle Impostazioni, dicendo quanti punti valgono un euro e quanto vale un punto.",
        );
      }
      if (err.code === "not_enough_points") {
        return apiError(409, err.code, "Questo cliente non ha abbastanza punti.");
      }
      if (err.code === "oltre_il_conto") {
        /* I punti del cliente sono suoi: si dice quanto resta da coprire
           invece di bruciarne più del necessario. */
        const resta = (err.detail as { restaCents?: number } | undefined)?.restaCents ?? 0;
        return apiError(
          409,
          err.code,
          resta > 0
            ? `Su questo conto restano da incassare ${formatCurrency(resta, "EUR")}: i punti non possono valere più di questa cifra.`
            : "Questo conto è già coperto: non serve usare altri punti.",
        );
      }
      return apiError(400, err.code, "I punti da usare devono essere un numero maggiore di zero.");
    }
    return apiErrorResponse(err);
  }
}
