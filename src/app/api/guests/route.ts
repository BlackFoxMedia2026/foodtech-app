import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";

import { createGuest, listGuests } from "@/server/guests";

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const pagina = Number(url.searchParams.get("pagina")) || 1;
  // Si risponde con la pagina **e** il totale: un client che riceve solo
  // cinquanta righe deve poter sapere che ce ne sono trecento.
  const data = await listGuests(ctx.venueId, { q, pagina });
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
