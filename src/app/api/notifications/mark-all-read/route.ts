import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { markAllNotificationsRead } from "@/server/notifications";

export async function POST() {
  const ctx = await getActiveVenue();
  await markAllNotificationsRead(ctx.venueId, ctx.role);
  return NextResponse.json({ ok: true });
}
