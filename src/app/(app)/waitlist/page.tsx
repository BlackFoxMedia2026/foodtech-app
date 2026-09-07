import { can, getActiveVenue } from "@/lib/tenant";
import { listRooms } from "@/server/rooms";
import { expireStaleOffers, listWaitlist, waitlistSummary } from "@/server/waitlist";
import { WaitlistPageClient } from "@/components/waitlist/waitlist-page-client";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const ctx = await getActiveVenue();

  // Chiudere le offerte scadute prima di leggere: una coda che mostra come
  // "avvisate" persone andate altrove mezz'ora fa è peggio di una coda vuota.
  await expireStaleOffers(ctx.venueId);

  const [entries, summary, rooms] = await Promise.all([
    listWaitlist(ctx.venueId),
    waitlistSummary(ctx.venueId),
    listRooms(ctx.venueId),
  ]);

  return (
    <WaitlistPageClient
      entries={entries.map((e) => ({
        id: e.id,
        guestName: e.guestName,
        phone: e.phone,
        partySize: e.partySize,
        status: e.status,
        notes: e.notes,
        waitingMin: e.waitingMin,
        overdue: e.overdue,
        expectedWaitMin: e.expectedWaitMin,
        desiredAt: e.desiredAt?.toISOString() ?? null,
        offerExpiresAt: e.offerExpiresAt?.toISOString() ?? null,
        isVip: e.isVip,
        allergies: e.guest?.allergies ?? null,
        preferredRoomName: e.preferredRoom?.name ?? null,
      }))}
      summary={summary}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
      canManage={can(ctx.role, "manage_bookings")}
    />
  );
}
