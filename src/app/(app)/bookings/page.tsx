import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { listBookingsForDay } from "@/server/bookings";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { NewBookingButton } from "@/components/bookings/new-booking-button";
import { DayPicker } from "@/components/bookings/day-picker";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type StatusFilter = "all" | "pending" | "confirmed";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: { day?: string; status?: string };
}) {
  const ctx = await getActiveVenue();
  const day = searchParams.day ? new Date(searchParams.day) : new Date();
  const dayString = day.toISOString().slice(0, 10);
  const statusFilter = (searchParams.status as StatusFilter) ?? "all";

  const [rows, tables] = await Promise.all([
    listBookingsForDay(ctx.venueId, day),
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      select: { id: true, label: true, seats: true },
      orderBy: { label: "asc" },
    }),
  ]);

  let filteredRows = rows;
  if (statusFilter === "pending") {
    filteredRows = rows.filter((r) => r.status === "PENDING");
  } else if (statusFilter === "confirmed") {
    filteredRows = rows.filter((r) => r.status === "CONFIRMED");
  }

  const totalCovers = filteredRows.filter((r) => r.status !== "CANCELLED").reduce((s, b) => s + b.partySize, 0);
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  const getStatusFilterUrl = (status: StatusFilter) => {
    const params = new URLSearchParams();
    params.set("day", dayString);
    if (status !== "all") params.set("status", status);
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Prenotazioni</h1>
          <p className="text-sm text-muted-foreground">
            {filteredRows.length} prenotazioni · {totalCovers} coperti
            {pendingCount > 0 && <span className="ml-2 text-amber-600 font-semibold">({pendingCount} da approvare)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DayPicker value={dayString} />
          <NewBookingButton tables={tables} />
        </div>
      </header>

      <div className="flex gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          asChild
        >
          <a href={getStatusFilterUrl("all")}>Tutte</a>
        </Button>
        <Button
          variant={statusFilter === "confirmed" ? "default" : "outline"}
          asChild
        >
          <a href={getStatusFilterUrl("confirmed")}>Confermate</a>
        </Button>
        <Button
          variant={statusFilter === "pending" ? "default" : "outline"}
          asChild
          className={statusFilter === "pending" ? "bg-amber-600 hover:bg-amber-700" : ""}
        >
          <a href={getStatusFilterUrl("pending")}>
            In sospeso {pendingCount > 0 && <span className="ml-2 bg-white text-amber-600 px-2 py-1 rounded text-xs font-bold">{pendingCount}</span>}
          </a>
        </Button>
      </div>

      <BookingsTable rows={filteredRows} />
    </div>
  );
}
