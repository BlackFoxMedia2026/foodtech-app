import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { retryCampaignSend } from "@/server/campaigns";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await retryCampaignSend(ctx.venueId, params.id));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
