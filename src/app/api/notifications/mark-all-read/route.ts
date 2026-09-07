import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";

import { markAllNotificationsRead } from "@/server/notifications";

export async function POST() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  await markAllNotificationsRead(ctx.venueId, ctx.role);
  return NextResponse.json({ ok: true });
}
