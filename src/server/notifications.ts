import type { NotificationKind, Prisma, StaffRole } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Ability } from "@/lib/tenant";

/** Some notification kinds carry data more sensitive than plain venue
 * membership should expose (e.g. contract data) — gate them behind the same
 * ability a user would need to see the underlying record, since
 * Notification rows are venue-scoped, not per-recipient (brief section 16). */
const KIND_ABILITY: Partial<Record<NotificationKind, Ability>> = {
  STAFF_CONTRACT_EXPIRING: "manage_contracts",
  STAFF_CONTRACT_EXPIRED: "manage_contracts",
};

export async function createNotification(
  venueId: string,
  input: { kind: NotificationKind; title: string; body?: string; link?: string; meta?: Prisma.InputJsonValue },
) {
  return db.notification.create({
    data: {
      id: crypto.randomUUID(),
      venueId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link,
      meta: input.meta,
    },
  });
}

export async function listNotifications(venueId: string, role: StaffRole, opts: { limit?: number } = {}) {
  return db.notification.findMany({
    where: { venueId, kind: { notIn: restrictedKinds(role) } },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 30,
  });
}

export async function countUnreadNotifications(venueId: string, role: StaffRole) {
  return db.notification.count({ where: { venueId, kind: { notIn: restrictedKinds(role) }, readAt: null } });
}

export async function markNotificationRead(venueId: string, role: StaffRole, id: string) {
  const existing = await db.notification.findFirst({ where: { id, venueId, kind: { notIn: restrictedKinds(role) } } });
  if (!existing) throw new Error("not_found");
  return db.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(venueId: string, role: StaffRole) {
  return db.notification.updateMany({
    where: { venueId, kind: { notIn: restrictedKinds(role) }, readAt: null },
    data: { readAt: new Date() },
  });
}

/** NotificationKind values hidden from a role that lacks the ability gating
 * them — kinds absent from KIND_ABILITY stay visible to any venue member,
 * matching today's (pre-contracts) behavior. */
function restrictedKinds(role: StaffRole): NotificationKind[] {
  return (Object.keys(KIND_ABILITY) as NotificationKind[]).filter((kind) => !can(role, KIND_ABILITY[kind]!));
}

/** Venue members (by role) allowed to receive contract-expiry notifications
 * and emails — mirrors the same ability gate used for reading them
 * (brief section 16). */
export async function listContractNotificationRecipients(venueId: string) {
  const memberships = await db.venueMembership.findMany({
    where: { venueId },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  return memberships.filter((m) => can(m.role, "manage_contracts")).map((m) => m.user);
}
