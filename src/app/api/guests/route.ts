import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { createGuest, listGuests } from "@/server/guests";

export async function GET(req: Request) {
  const ctx = await getActiveVenue();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const data = await listGuests(ctx.venueId, q);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const created = await createGuest(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
