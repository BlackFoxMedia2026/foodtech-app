import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { createWaiter, listWaiters } from "@/server/waiters";

export async function GET() {
  const ctx = await getActiveVenue();
  const data = await listWaiters(ctx.venueId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const created = await createWaiter(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
