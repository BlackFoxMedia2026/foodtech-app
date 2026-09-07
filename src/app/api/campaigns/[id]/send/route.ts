import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { sendCampaignNow } from "@/server/campaigns";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const updated = await sendCampaignNow(ctx.venueId, params.id);
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
