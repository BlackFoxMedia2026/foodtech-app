import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { createRoom, listRooms } from "@/server/rooms";

export async function GET() {
  const ctx = await getActiveVenue();
  const data = await listRooms(ctx.venueId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_venue")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const created = await createRoom(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
