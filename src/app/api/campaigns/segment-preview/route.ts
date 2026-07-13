import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { previewSegment, SegmentFilter } from "@/server/campaigns";

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const segment = SegmentFilter.parse(body.segment ?? {});
    const result = await previewSegment(ctx.venueId, segment);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
