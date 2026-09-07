import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { createGiftCard, listGiftCards } from "@/server/gift-cards";

/**
 * Emettere una gift card è incassare denaro, quindi è una cosa da manager
 * (`manage_venue`) e non da chi fa le campagne: un buono sconto e una carta
 * prepagata si somigliano solo a guardarli.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createGiftCard(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function GET() {
  const ctx = await requireVenueApi("view_revenue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await listGiftCards(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
