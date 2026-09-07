import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";

import { countUnreadNotifications, listNotifications } from "@/server/notifications";

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(ctx.venueId, ctx.role),
    countUnreadNotifications(ctx.venueId, ctx.role),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
