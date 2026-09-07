import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { CouponError, undoRedemption } from "@/server/coupons";

/** Annulla un utilizzo: il tocco di troppo non deve bruciare un coupon. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await undoRedemption(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof CouponError) {
      return apiError(404, "not_found", "Questo utilizzo non esiste o è già stato annullato.");
    }
    return apiErrorResponse(err);
  }
}
