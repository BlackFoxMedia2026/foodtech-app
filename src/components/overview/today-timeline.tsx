import Link from "next/link";
import type { Booking, Guest, Table } from "@prisma/client";
import { ChevronRight } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

type Row = Booking & { guest: Guest | null; table: Table | null };

type Tone = "positive" | "warn" | "negative" | "neutral";

function getStatusDisplay(booking: Row, now: Date): { label: string; tone: Tone } {
  const minutesUntil = Math.round((booking.startsAt.getTime() - now.getTime()) / 60000);

  switch (booking.status) {
    case "SEATED":
      return { label: "Seduti", tone: "positive" };
    case "COMPLETED":
      return { label: "Completata", tone: "neutral" };
    case "NO_SHOW":
      return { label: "No-show", tone: "negative" };
    case "ARRIVED":
      return { label: "In attesa", tone: "warn" };
    case "PENDING":
      return { label: "Da confermare", tone: "warn" };
    case "CONFIRMED":
      if (minutesUntil <= 0) return { label: "In ritardo", tone: "negative" };
      if (minutesUntil <= 60) return { label: `Arrivo tra ${minutesUntil} min`, tone: "warn" };
      return { label: "Confermato", tone: "positive" };
    default:
      return { label: booking.status, tone: "neutral" };
  }
}

const DOT_TONE: Record<Tone, string> = {
  positive: "bg-emerald-400",
  warn: "bg-accent",
  negative: "bg-rose-400",
  neutral: "bg-muted-foreground",
};

const TEXT_TONE: Record<Tone, string> = {
  positive: "text-emerald-400",
  warn: "text-accent",
  negative: "text-rose-400",
  neutral: "text-muted-foreground",
};

export function TodayTimeline({ bookings }: { bookings: Row[] }) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nessuna prenotazione per oggi.
      </p>
    );
  }

  const now = new Date();

  return (
    <ul className="relative">
      <div className="absolute bottom-2 left-[68px] top-2 w-px bg-border" aria-hidden="true" />
      {bookings.map((b) => {
        const name = b.guest ? `${b.guest.firstName} ${b.guest.lastName ?? ""}`.trim() : "Walk-in";
        const status = getStatusDisplay(b, now);
        return (
          <li key={b.id} className="relative">
            <Link
              href={`/bookings/${b.id}`}
              className="flex items-center gap-4 rounded-lg py-3 pl-1 pr-2 transition-colors hover:bg-white/5"
            >
              <p className="w-14 shrink-0 text-right text-sm font-medium text-foreground">{formatTime(b.startsAt)}</p>
              <span className={cn("z-10 h-2.5 w-2.5 shrink-0 rounded-full", DOT_TONE[status.tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {b.partySize} {b.partySize === 1 ? "persona" : "persone"} · {b.table ? `Tavolo ${b.table.label}` : "Tavolo da assegnare"}
                </p>
              </div>
              <span className={cn("shrink-0 text-right text-xs font-medium", TEXT_TONE[status.tone])}>{status.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
