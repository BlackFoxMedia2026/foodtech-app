"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Booking, Guest, RoomLayoutMode, Table } from "@prisma/client";
import { List, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayPicker } from "@/components/bookings/day-picker";
import { NewBookingButton } from "@/components/bookings/new-booking-button";
import { BookingsTable } from "@/components/bookings/bookings-table";
import { BookingServiceSelect } from "@/components/bookings/floor/booking-service-select";
import { BookingsFloorView } from "@/components/bookings/floor/bookings-floor-view";
import { cn } from "@/lib/utils";

export type Row = Booking & { guest: Guest | null; table: Table | null };
type StatusFilter = "all" | "pending" | "confirmed";
type RoomWithTables = {
  id: string;
  name: string;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
  tables: Table[];
};

const VIEW_STORAGE_KEY = "tavolo.bookings.view";

export function BookingsPageClient({
  dayString,
  statusFilter,
  filteredRows,
  totalCovers,
  pendingCount,
  tables,
  service,
  serviceOptions,
  rooms,
  shiftWindow,
  canManageBookings,
}: {
  dayString: string;
  statusFilter: StatusFilter;
  filteredRows: Row[];
  totalCovers: number;
  pendingCount: number;
  tables: { id: string; label: string; seats: number }[];
  service: string;
  serviceOptions: string[];
  rooms: RoomWithTables[];
  shiftWindow: { start: Date; end: Date } | null;
  canManageBookings: boolean;
}) {
  // Default stays "Elenco" (brief section 3 — backward compatible); only
  // remembered for the session, no new DB preference (brief section 36).
  const [view, setView] = useState<"elenco" | "mappa">("elenco");

  // The ONE shared dataset both views render from (brief sections 23/24) —
  // Elenco renders it directly, Mappa derives its unassigned/assigned split
  // from it. Resynced from the server prop below whenever a real navigation
  // (date/service/status) or a plain status change made in Elenco produces
  // fresh data — a mutation made from Mappa instead patches this state
  // directly (optimistic) via handleBookingUpdated, no round trip needed to
  // see it reflected back in Elenco.
  const [rows, setRows] = useState(filteredRows);
  useEffect(() => setRows(filteredRows), [filteredRows]);

  function handleBookingUpdated(updated: Row) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  // A plain function can't cross the server->client boundary as a prop —
  // this is trivial URL-building, so it's just redefined here instead of
  // passed down from page.tsx.
  function getStatusFilterUrl(status: StatusFilter) {
    const params = new URLSearchParams();
    params.set("day", dayString);
    if (status !== "all") params.set("status", status);
    return `?${params.toString()}`;
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "mappa" || stored === "elenco") setView(stored);
  }, []);

  function changeView(next: "elenco" | "mappa") {
    setView(next);
    sessionStorage.setItem(VIEW_STORAGE_KEY, next);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Sala</p>
          <h1 className="text-display text-3xl">Prenotazioni</h1>
          <p className="text-sm text-muted-foreground">
            {filteredRows.length} prenotazioni · {totalCovers} coperti
            {pendingCount > 0 && <span className="ml-2 font-semibold text-amber-600">({pendingCount} da approvare)</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DayPicker value={dayString} />
          {/* Always visible regardless of view (brief section 3) — it stayed
              conditional on the Mappa view before, which made the header
              visibly shift when switching views. */}
          <BookingServiceSelect service={service} serviceOptions={serviceOptions} />
          <NewBookingButton tables={tables} />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant={statusFilter === "all" ? "default" : "outline"} asChild>
            <Link href={getStatusFilterUrl("all")}>Tutte</Link>
          </Button>
          <Button variant={statusFilter === "confirmed" ? "default" : "outline"} asChild>
            <Link href={getStatusFilterUrl("confirmed")}>Confermate</Link>
          </Button>
          <Button
            variant={statusFilter === "pending" ? "default" : "outline"}
            asChild
            className={statusFilter === "pending" ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            <Link href={getStatusFilterUrl("pending")}>
              In sospeso{" "}
              {pendingCount > 0 && <span className="ml-2 rounded bg-white px-2 py-1 text-xs font-bold text-amber-600">{pendingCount}</span>}
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => changeView("elenco")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "elenco" ? "bg-accent-strong text-white" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <List className="h-4 w-4" /> Elenco
          </button>
          <button
            type="button"
            onClick={() => changeView("mappa")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
              view === "mappa" ? "bg-accent-strong text-white" : "text-muted-foreground hover:bg-secondary",
            )}
          >
            <MapIcon className="h-4 w-4" /> Mappa
          </button>
        </div>
      </div>

      {view === "elenco" ? (
        <BookingsTable rows={rows} />
      ) : (
        <BookingsFloorView
          rooms={rooms}
          rows={rows}
          shiftWindow={shiftWindow}
          canManage={canManageBookings}
          onBookingUpdated={handleBookingUpdated}
        />
      )}
    </div>
  );
}
