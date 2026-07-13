import { NextResponse } from "next/server";
import { z } from "zod";
import { can, getActiveVenue } from "@/lib/tenant";
import { getCampaign, sendTestEmail } from "@/server/campaigns";

const Body = z.object({ to: z.string().email() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const { to } = Body.parse(await req.json());
    const campaign = await getCampaign(ctx.venueId, params.id);
    if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (campaign.status !== "DRAFT") {
      return NextResponse.json({ error: "campaign_not_editable" }, { status: 400 });
    }
    await sendTestEmail(ctx.venueId, params.id, to);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
