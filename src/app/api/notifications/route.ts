import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { countUnreadNotifications, listNotifications } from "@/server/notifications";

export async function GET() {
  const ctx = await getActiveVenue();
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(ctx.venueId, ctx.role),
    countUnreadNotifications(ctx.venueId, ctx.role),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}
