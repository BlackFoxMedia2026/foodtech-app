import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const GuestInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).optional().nullable(),
  phone: z.string().optional().nullable(),
  language: z.string().optional(),
  loyaltyTier: z.enum(["NEW", "REGULAR", "VIP", "AMBASSADOR"]).optional(),
  preferences: z.any().optional(),
  allergies: z.string().optional().nullable(),
  privateNotes: z.string().optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export async function listGuests(venueId: string, q?: string) {
  const where: Prisma.GuestWhereInput = { venueId };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }
  return db.guest.findMany({
    where,
    orderBy: [{ loyaltyTier: "desc" }, { lastVisitAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
}

export async function getGuest(venueId: string, id: string) {
  return db.guest.findFirst({
    where: { id, venueId },
    include: {
      bookings: {
        orderBy: { startsAt: "desc" },
        take: 30,
        include: { table: true },
      },
    },
  });
}

export async function createGuest(venueId: string, raw: unknown) {
  const data = GuestInput.parse(raw);
  return db.guest.create({
    data: {
      venueId,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email || null,
      phone: data.phone ?? null,
      allergies: data.allergies ?? null,
      privateNotes: data.privateNotes ?? null,
      marketingOptIn: data.marketingOptIn ?? false,
      tags: data.tags ?? [],
      loyaltyTier: data.loyaltyTier ?? "NEW",
    },
  });
}

export async function updateGuest(venueId: string, id: string, raw: unknown) {
  const data = GuestInput.partial().parse(raw);
  const existing = await db.guest.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.guest.update({ where: { id }, data });
}
