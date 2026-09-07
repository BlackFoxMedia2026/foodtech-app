import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { previewSegment, SegmentFilter } from "@/server/campaigns";

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const segment = SegmentFilter.parse(body.segment ?? {});
    const result = await previewSegment(ctx.venueId, segment);
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
