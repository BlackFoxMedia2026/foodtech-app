import Link from "next/link";
import { NON_PIU_RITARDO_MIN } from "@/lib/durata";
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
      // Oltre tre ore non è più un ritardo: è una prenotazione a cui nessuno
      // ha dato un esito. Chiamarla «in ritardo» a fine giornata riempiva la
      // timeline di rosso su gente che non sarebbe più arrivata.
      if (minutesUntil <= -NON_PIU_RITARDO_MIN) return { label: "Non arrivata", tone: "neutral" };
      if (minutesUntil <= 0) return { label: "In ritardo", tone: "negative" };
      if (minutesUntil <= 60) return { label: `Arrivo tra ${minutesUntil} min`, tone: "warn" };
      return { label: "Confermato", tone: "positive" };
    default:
      return { label: booking.status, tone: "neutral" };
  }
}

const DOT_TONE: Record<Tone, string> = {
  positive: "bg-sage",
  warn: "bg-card-foreground",
  negative: "bg-destructive",
  neutral: "bg-card-foreground/40",
};

const TEXT_TONE: Record<Tone, string> = {
  positive: "text-sage-strong",
  warn: "text-card-foreground",
  negative: "text-destructive-soft",
  neutral: "text-card-foreground/65",
};

export function TodayTimeline({ bookings }: { bookings: Row[] }) {
  if (bookings.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-cream/20 bg-white/5 p-8 text-center text-sm text-card-foreground/65">
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
              className="flex items-center gap-4 rounded-lg py-3 pl-1 pr-2 transition-colors hover:bg-muted"
            >
              <p className="w-14 shrink-0 text-right text-sm font-medium text-card-foreground">{formatTime(b.startsAt)}</p>
              <span className={cn("z-10 h-2.5 w-2.5 shrink-0 rounded-full", DOT_TONE[status.tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-card-foreground">{name}</p>
                {/* Questa riga va a capo: dice «Tavolo da assegnare», cioè la
                    cosa su cui si agisce, e tagliata a 12px sul telefono ne
                    perdeva la fine. Il nome sopra resta `truncate` per
                    sicurezza sui nomi molto lunghi — lì la parola dello stato
                    è già stata togliata per fargli spazio. */}
                <p className="text-xs text-card-foreground/65">
                  {b.partySize} {b.partySize === 1 ? "persona" : "persone"} · {b.table ? `Tavolo ${b.table.label}` : "Tavolo da assegnare"}
                </p>
              </div>
              {/* Sul telefono la parola dello stato prendeva un terzo della
                  riga e il nome dell'ospite finiva a undici caratteri:
                  «Alessia Co…». Il pallino colorato lo stato lo dice già, e
                  il nome è l'informazione che serve a chi accoglie. Da `sm`,
                  dove lo spazio c'è, torna anche la parola. */}
              <span
                className={cn(
                  "hidden shrink-0 text-right text-xs font-medium sm:inline",
                  TEXT_TONE[status.tone],
                )}
              >
                {status.label}
              </span>
              <span className="sr-only">{status.label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-card-foreground/65" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
