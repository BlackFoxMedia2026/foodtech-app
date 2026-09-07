import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { CouponError, MOTIVO_NON_VALIDO, redeemCoupon } from "@/server/coupons";

const Body = z.object({
  code: z.string().trim().min(1, "Scrivi il codice del coupon").max(24),
  guestId: z.string().optional().nullable(),
  bookingId: z.string().optional().nullable(),
  amountCents: z.coerce.number().int().min(0).max(10_000_00).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

/**
 * Segna un coupon come usato, al tavolo.
 *
 * `manage_bookings` e non `edit_marketing`: chi usa un coupon è chi sta
 * servendo, non chi fa le campagne.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = Body.parse(await req.json());
    return NextResponse.json(await redeemCoupon(ctx.venueId, body, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof CouponError) {
      // «Non esiste» e «non si può usare» sono due risposte diverse: la prima
      // è un codice sbagliato, la seconda un codice giusto che non vale.
      if (err.code === "not_found") {
        return apiError(404, "not_found", "Nessun coupon con questo codice.");
      }
      return apiError(409, err.code, MOTIVO_NON_VALIDO[err.code]);
    }
    return apiErrorResponse(err);
  }
}
