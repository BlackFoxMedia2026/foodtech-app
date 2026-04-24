import Link from "next/link";
import type { Booking, Guest, Table } from "@prisma/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/bookings/status-badge";
import { formatTime, initials } from "@/lib/utils";
import { Users } from "lucide-react";

type Row = Booking & { guest: Guest | null; table: Table | null };

export function TodayTimeline({ bookings }: { bookings: Row[] }) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nessuna prenotazione per oggi.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {bookings.map((b) => {
        const name = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
        return (
          <li key={b.id}>
            <Link
              href={`/bookings/${b.id}`}
              className="flex items-center gap-4 py-3 transition-colors hover:bg-secondary/40"
            >
              <div className="w-16 text-right">
                <p className="text-display text-base">{formatTime(b.startsAt)}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{b.durationMin} min</p>
              </div>
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.table ? `Tavolo ${b.table.label}` : "Tavolo da assegnare"}
                  {b.notes ? ` · ${b.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {b.partySize}
                </span>
                <StatusBadge status={b.status} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
