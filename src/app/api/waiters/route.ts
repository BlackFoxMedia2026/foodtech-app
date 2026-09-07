import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";

import { createWaiter, listWaiters } from "@/server/waiters";

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const data = await listWaiters(ctx.venueId);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const created = await createWaiter(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
