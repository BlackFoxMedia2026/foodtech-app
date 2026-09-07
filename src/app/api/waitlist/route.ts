import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { addToWaitlist, expireStaleOffers, listWaitlist, waitlistSummary } from "@/server/waitlist";

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  // Chiudere le offerte scadute qui evita che la coda mostri come "avvisate"
  // persone che sono andate altrove mezz'ora fa.
  await expireStaleOffers(ctx.venueId);
  const [entries, summary] = await Promise.all([listWaitlist(ctx.venueId), waitlistSummary(ctx.venueId)]);
  return NextResponse.json({ entries, summary });
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const created = await addToWaitlist(ctx.venueId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
