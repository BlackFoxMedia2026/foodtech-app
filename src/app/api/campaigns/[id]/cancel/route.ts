import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { cancelCampaign } from "@/server/campaigns";

/**
 * Annulla una campagna non ancora partita.
 *
 * `edit_marketing` come per l'invio: chi non può far partire una campagna non
 * può nemmeno fermarne una programmata da altri.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const campaign = await cancelCampaign(ctx.venueId, params.id);
    return NextResponse.json(campaign);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
