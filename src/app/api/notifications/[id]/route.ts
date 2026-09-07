import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";

import { markNotificationRead } from "@/server/notifications";

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  try {
    const updated = await markNotificationRead(ctx.venueId, ctx.role, params.id);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
