import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { cancelGiftCard, GiftCardError } from "@/server/gift-cards";

/** Annullare una carta è togliere del credito a qualcuno: solo un manager. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await cancelGiftCard(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof GiftCardError) return apiError(404, "not_found", "Questa gift card non esiste.");
    return apiErrorResponse(err);
  }
}
