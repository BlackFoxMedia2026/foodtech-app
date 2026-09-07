import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";

import { createRoom, listRooms } from "@/server/rooms";

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const data = await listRooms(ctx.venueId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const created = await createRoom(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
