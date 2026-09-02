import { NextResponse } from "next/server";
import { StaffCapability } from "@prisma/client";
import { getActiveVenue } from "@/lib/tenant";
import { listEligibleStaff } from "@/server/staff-assignments";

export async function GET(req: Request) {
  const ctx = await getActiveVenue();
  const url = new URL(req.url);
  const capability = url.searchParams.get("capability");
  if (!capability || !(capability in StaffCapability)) {
    return NextResponse.json({ error: "invalid_capability" }, { status: 400 });
  }
  const data = await listEligibleStaff(ctx.venueId, capability as StaffCapability);
  return NextResponse.json(data);
}
