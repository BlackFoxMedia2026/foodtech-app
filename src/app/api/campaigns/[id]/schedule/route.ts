import { NextResponse } from "next/server";
import { z } from "zod";
import { can, getActiveVenue } from "@/lib/tenant";
import { scheduleCampaign } from "@/server/campaigns";

const Body = z.object({ at: z.coerce.date() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const { at } = Body.parse(await req.json());
    const updated = await scheduleCampaign(ctx.venueId, params.id, at);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
