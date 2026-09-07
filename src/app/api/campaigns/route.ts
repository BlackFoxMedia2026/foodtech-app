import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";

import { createCampaign, listCampaigns } from "@/server/campaigns";

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const data = await listCampaigns(ctx.venueId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const created = await createCampaign(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
