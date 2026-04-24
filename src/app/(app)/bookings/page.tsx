import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listBookingsForDay } from "@/server/bookings";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { NewBookingButton } from "@/components/bookings/new-booking-button";
import { DayPicker } from "@/components/bookings/day-picker";

export const dynamic = "force-dynamic";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { day?: string };
}) {
  const ctx = await getActiveVenue();
  const day = searchParams.day ? new Date(searchParams.day) : new Date();
  const dayString = day.toISOString().slice(0, 10);

  const [rows, tables] = await Promise.all([
    listBookingsForDay(ctx.venueId, day),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      select: { id: true, label: true, seats: true },
      orderBy: { label: "asc" },
    }),
  ]);

  const totalCovers = rows.filter((r) => r.status !== "CANCELLED").reduce((s, b) => s + b.partySize, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Prenotazioni</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} prenotazioni · {totalCovers} coperti
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DayPicker value={dayString} />
          <NewBookingButton tables={tables} />
        </div>
      </header>

      <BookingsTable rows={rows} />
    </div>
  );
}
