import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import type { Prisma, StaffRole } from "@prisma/client";
import type { Session } from "next-auth";

const VENUE_COOKIE = "tavolo.venue";

export async function requireUser() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/sign-in");
  return { userId, session: session! };
}

/** Perché non basta getActiveVenue: quella redirige, e un redirect da una
 * route API diventa un 307 verso /sign-in — il client fa res.json() su una
 * pagina HTML e vede un errore di parsing invece di "sessione scaduta".
 * Questo risolutore non decide cosa fare quando manca qualcosa: dice solo
 * cosa manca, e chi chiama scegli se redirigere (pagine) o rispondere con
 * uno status corretto (API, vedi lib/api-auth.ts). */
export type VenueResolution =
  | { state: "unauthenticated" }
  | { state: "no_venue"; userId: string }
  | { state: "ok"; context: ActiveVenueContext };

type MembershipWithVenue = Prisma.VenueMembershipGetPayload<{
  include: { venue: { include: { org: true } } };
}>;

export type ActiveVenueContext = {
  userId: string;
  session: Session;
  venueId: string;
  venue: MembershipWithVenue["venue"];
  role: StaffRole;
  orgId: string;
  org: MembershipWithVenue["venue"]["org"];
  allMemberships: MembershipWithVenue[];
};

export const resolveActiveVenue = cache(async function resolveActiveVenue(): Promise<VenueResolution> {
  const session = (await auth()) as Session | null;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!session || !userId) return { state: "unauthenticated" };

  const memberships = await db.venueMembership.findMany({
    where: { userId },
    include: { venue: { include: { org: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) return { state: "no_venue", userId };

  const cookieVenueId = cookies().get(VENUE_COOKIE)?.value;
  const active =
    memberships.find((m) => m.venueId === cookieVenueId) ?? memberships[0];

  return {
    state: "ok",
    context: {
      userId,
      session,
      venueId: active.venueId,
      venue: active.venue,
      role: active.role,
      orgId: active.venue.orgId,
      org: active.venue.org,
      allMemberships: memberships,
    },
  };
});

export const getActiveVenue = cache(async function getActiveVenue() {
  const resolved = await resolveActiveVenue();
  if (resolved.state === "unauthenticated") redirect("/sign-in");
  if (resolved.state === "no_venue") redirect("/onboarding");
  return resolved.context;
});

// I permessi vivono in abilities.ts (nessuna dipendenza da React, così sono
// verificabili con un test); qui restano ri-esportati perché mezzo progetto
// li importa da "@/lib/tenant".
export { can, type Ability } from "./abilities";

export function setActiveVenueCookie(venueId: string) {
  cookies().set(VENUE_COOKIE, venueId, { path: "/", httpOnly: false, sameSite: "lax" });
}
