import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";

import { createGuest, listGuests } from "@/server/guests";

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const data = await listGuests(ctx.venueId, q);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const created = await createGuest(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
