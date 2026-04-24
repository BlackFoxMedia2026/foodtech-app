import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { getGuest, updateGuest } from "@/server/guests";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const item = await getGuest(ctx.venueId, params.id);
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const updated = await updateGuest(ctx.venueId, params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
