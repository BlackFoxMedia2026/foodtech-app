import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import type { StaffRole } from "@prisma/client";

const VENUE_COOKIE = "tavolo.venue";

export async function requireUser() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/sign-in");
  return { userId, session: session! };
}

export async function getActiveVenue() {
  const { userId, session } = await requireUser();

  const memberships = await db.venueMembership.findMany({
    where: { userId },
    include: { venue: { include: { org: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) redirect("/onboarding");

  const cookieVenueId = cookies().get(VENUE_COOKIE)?.value;
  const active =
    memberships.find((m) => m.venueId === cookieVenueId) ?? memberships[0];

  return {
    userId,
    session,
    venueId: active.venueId,
    venue: active.venue,
    role: active.role,
    orgId: active.venue.orgId,
    org: active.venue.org,
    allMemberships: memberships,
  };
}

export type Ability = "manage_org" | "manage_venue" | "manage_bookings" | "view_revenue" | "edit_marketing";

const matrix: Record<StaffRole, Ability[]> = {
  MANAGER: ["manage_venue", "manage_bookings", "view_revenue", "edit_marketing"],
  RECEPTION: ["manage_bookings"],
  WAITER: ["manage_bookings"],
  MARKETING: ["edit_marketing", "view_revenue"],
  READ_ONLY: [],
};

export function can(role: StaffRole, ability: Ability) {
  return matrix[role]?.includes(ability) ?? false;
}

export function setActiveVenueCookie(venueId: string) {
  cookies().set(VENUE_COOKIE, venueId, { path: "/", httpOnly: false, sameSite: "lax" });
}
