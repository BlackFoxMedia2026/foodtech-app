import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { setServiceAssignmentMode } from "@/server/venue-settings";

export async function PATCH(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const updated = await setServiceAssignmentMode(ctx.venueId, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
