import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { sendCampaignNow } from "@/server/campaigns";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const updated = await sendCampaignNow(ctx.venueId, params.id);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
