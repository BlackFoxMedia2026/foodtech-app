import { z } from "zod";
import { db } from "@/lib/db";
import { startOfDay, endOfDay, formatTime } from "@/lib/utils";
import { sendBookingConfirmationEmail, sendPendingBookingNotificationEmail } from "./emails";

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

async function determineBookingStatus(
  source: string,
  startsAt: Date,
  guestId: string | null,
  venueId: string
): Promise<"CONFIRMED" | "PENDING"> {
  if (source === "PHONE" || source === "WALK_IN") {
    return "CONFIRMED";
  }

  const now = new Date();
  const leadTimeMs = startsAt.getTime() - now.getTime();
  const leadTimeHours = leadTimeMs / (1000 * 60 * 60);

  if (leadTimeHours < 2) {
    return "CONFIRMED";
  }

  if (leadTimeHours < 168) {
    if (guestId) {
      const guest = await db.guest.findUnique({ where: { id: guestId } });
      if (guest && (guest.loyaltyTier === "VIP" || guest.loyaltyTier === "AMBASSADOR" || guest.totalVisits > 3)) {
        return "CONFIRMED";
      }
    }
    return "CONFIRMED";
  }

  return "PENDING";
}

export async function createBooking(venueId: string, raw: unknown) {
  const data = BookingInput.parse(raw);

  let guestId = data.guestId ?? null;
  let guestEmail: string | null = null;
  let guestPhone: string | null = null;
  let guestName = "";

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
    guestEmail = created.email;
    guestPhone = created.phone;
    guestName = `${created.firstName} ${created.lastName || ""}`.trim();
  } else if (guestId) {
    const guest = await db.guest.findUnique({ where: { id: guestId } });
    if (guest) {
      guestEmail = guest.email;
      guestPhone = guest.phone;
      guestName = `${guest.firstName} ${guest.lastName || ""}`.trim();
    }
  }

  const status = await determineBookingStatus(data.source, data.startsAt, guestId, venueId);

  const booking = await db.booking.create({
    data: {
      venueId,
      guestId,
      tableId: data.tableId || null,
      partySize: data.partySize,
      startsAt: data.startsAt,
      durationMin: data.durationMin,
      status,
      source: data.source,
      occasion: data.occasion ?? null,
      notes: data.notes ?? null,
      internalNotes: data.internalNotes ?? null,
      depositCents: data.depositCents,
    },
    include: { guest: true, table: true, venue: true },
  });

  const bookingTime = formatTime(booking.startsAt);

  if (status === "CONFIRMED" && guestEmail) {
    await sendBookingConfirmationEmail(
      guestEmail,
      guestName,
      booking.venue.name,
      booking.startsAt,
      bookingTime,
      booking.partySize,
      booking.reference
    );
  } else if (status === "PENDING") {
    const ownerMembership = await db.orgMembership.findFirst({
      where: {
        org: { venues: { some: { id: venueId } } },
        role: "OWNER",
      },
      include: { user: true },
    });

    if (ownerMembership?.user.email) {
      await sendPendingBookingNotificationEmail(
        ownerMembership.user.email,
        ownerMembership.user.name || "Manager",
        guestName,
        booking.venue.name,
        booking.startsAt,
        bookingTime,
        booking.partySize,
        booking.reference,
        guestPhone || "Non disponibile"
      );
    }
  }

  return booking;
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
