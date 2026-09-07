import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";

import { getCampaign, updateCampaign } from "@/server/campaigns";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const item = await getCampaign(ctx.venueId, params.id);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const updated = await updateCampaign(ctx.venueId, params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
