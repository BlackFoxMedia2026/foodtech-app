import { z } from "zod";
import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "@/lib/utils";

export const BookingInput = z.object({
  guestId: z.string().optional().nullable(),
  guest: z
    .object({
      firstName: z.string().min(1),
      lastName: z.string().optional().nullable(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
    })
    .optional(),
  partySize: z.coerce.number().int().min(1).max(50),
  startsAt: z.coerce.date(),
  durationMin: z.coerce.number().int().min(15).max(480).default(105),
  tableId: z.string().optional().nullable(),
  status: z
    .enum(["CONFIRMED", "PENDING", "ARRIVED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"])
    .default("CONFIRMED"),
  source: z.enum(["WIDGET", "PHONE", "WALK_IN", "GOOGLE", "SOCIAL", "CONCIERGE", "EVENT"]).default("PHONE"),
  occasion: z.enum(["BIRTHDAY", "ANNIVERSARY", "BUSINESS", "DATE", "CELEBRATION", "OTHER"]).optional().nullable(),
  notes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  depositCents: z.coerce.number().int().nonnegative().default(0),
});

export type BookingInputType = z.infer<typeof BookingInput>;

export async function listBookings(venueId: string, opts: { from?: Date; to?: Date; status?: string } = {}) {
  return db.booking.findMany({
    where: {
      venueId,
      startsAt: opts.from || opts.to ? { gte: opts.from, lte: opts.to } : undefined,
      status: opts.status ? (opts.status as any) : undefined,
    },
    include: { guest: true, table: true },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
}

export async function listBookingsForDay(venueId: string, day: Date) {
  return listBookings(venueId, { from: startOfDay(day), to: endOfDay(day) });
}

export async function createBooking(venueId: string, raw: unknown) {
  const data = BookingInput.parse(raw);

  let guestId = data.guestId ?? null;
  if (!guestId && data.guest?.firstName) {
    const created = await db.guest.create({
      data: {
        venueId,
        firstName: data.guest.firstName,
        lastName: data.guest.lastName ?? null,
        email: data.guest.email ?? null,
        phone: data.guest.phone ?? null,
      },
    });
    guestId = created.id;
  }

  return db.booking.create({
    data: {
      venueId,
      guestId,
      tableId: data.tableId || null,
      partySize: data.partySize,
      startsAt: data.startsAt,
      durationMin: data.durationMin,
      status: data.status,
      source: data.source,
      occasion: data.occasion ?? null,
      notes: data.notes ?? null,
      internalNotes: data.internalNotes ?? null,
      depositCents: data.depositCents,
    },
    include: { guest: true, table: true },
  });
}

export async function updateBooking(venueId: string, id: string, raw: unknown) {
  const data = BookingInput.partial().parse(raw);
  const existing = await db.booking.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");

  return db.booking.update({
    where: { id },
    data: {
      partySize: data.partySize ?? undefined,
      startsAt: data.startsAt ?? undefined,
      durationMin: data.durationMin ?? undefined,
      tableId: data.tableId === undefined ? undefined : data.tableId,
      status: data.status ?? undefined,
      source: data.source ?? undefined,
      occasion: data.occasion ?? undefined,
      notes: data.notes ?? undefined,
      internalNotes: data.internalNotes ?? undefined,
      arrivedAt: data.status === "ARRIVED" ? new Date() : undefined,
      seatedAt: data.status === "SEATED" ? new Date() : undefined,
      closedAt:
        data.status === "COMPLETED" || data.status === "NO_SHOW" || data.status === "CANCELLED"
          ? new Date()
          : undefined,
    },
    include: { guest: true, table: true },
  });
}

export async function deleteBooking(venueId: string, id: string) {
  const existing = await db.booking.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  return db.booking.delete({ where: { id } });
}
