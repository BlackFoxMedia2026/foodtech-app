import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { createCampaign, listCampaigns } from "@/server/campaigns";

export async function GET() {
  const ctx = await getActiveVenue();
  const data = await listCampaigns(ctx.venueId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const created = await createCampaign(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
