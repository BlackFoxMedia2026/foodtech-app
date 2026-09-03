"use client";

import { useDraggable } from "@dnd-kit/core";
import { ChevronDown, GripVertical, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FloorBooking } from "./booking-table-node";

function BookingCard({
  booking,
  onAssignClick,
  isDragging,
  canManage,
}: {
  booking: FloorBooking;
  onAssignClick: () => void;
  isDragging: boolean;
  canManage: boolean;
}) {
  // Hook is always called (React rules) — `disabled` is dnd-kit's own way to
  // turn a draggable off, so a read-only viewer sees the same card with no
  // drag affordance at all (brief section 47).
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: booking.id,
    data: { type: "booking", bookingId: booking.id, partySize: booking.partySize },
    disabled: !canManage,
  });
  const guestName = booking.guest ? `${booking.guest.firstName} ${booking.guest.lastName ?? ""}`.trim() : "Walk-in";

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "space-y-1.5 rounded-md border border-border bg-card p-2.5 shadow-sm transition-shadow",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-accent-strong">{formatTime(booking.startsAt)}</p>
          <p className="truncate text-sm font-semibold text-card-foreground">{guestName}</p>
          <p className="text-xs text-muted-foreground">{booking.partySize} persone</p>
          {booking.guest?.phone && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {booking.guest.phone}
            </p>
          )}
        </div>
        {canManage && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label="Trascina per assegnare un tavolo"
            aria-roledescription="draggable"
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-secondary active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      {canManage && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onAssignClick}>
          Assegna tavolo
        </Button>
      )}
    </div>
  );
}

export function UnassignedPanel({
  bookings,
  collapsed,
  onToggleCollapsed,
  onAssignClick,
  draggingBookingId,
  canManage,
  hiddenByServiceCount = 0,
}: {
  bookings: FloorBooking[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAssignClick: (bookingId: string) => void;
  draggingBookingId: string | null;
  canManage: boolean;
  /** Real unassigned bookings that exist for the day but fall outside the
   * selected service's time window — shown so an empty list here never
   * reads as "tutte assegnate" when the true cause is just the service
   * filter (the bug this prop exists to fix: a booking at 20:00 was
   * invisible while viewing "Pranzo", with no indication why). */
  hiddenByServiceCount?: number;
}) {
  return (
    <div className="flex h-full flex-col bg-forest">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex shrink-0 items-center justify-between gap-2 px-3 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-cream">Da assegnare · {bookings.length}</span>
        <ChevronDown className={cn("h-4 w-4 text-cream/70 transition-transform", collapsed && "-rotate-90")} />
      </button>
      {!collapsed && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          <p className="text-[11px] text-cream/60">Prenotazioni senza tavolo</p>
          {bookings.length === 0 ? (
            <div className="rounded-md border border-dashed border-cream/20 p-4 text-center text-xs text-cream/70">
              {hiddenByServiceCount > 0 ? (
                <>
                  <p>Nessuna prenotazione da assegnare per questo servizio.</p>
                  <p className="mt-1 text-cream/50">
                    {hiddenByServiceCount === 1
                      ? "1 prenotazione senza tavolo in un altro orario."
                      : `${hiddenByServiceCount} prenotazioni senza tavolo in altri orari.`}
                  </p>
                </>
              ) : (
                <p>Tutte le prenotazioni hanno un tavolo.</p>
              )}
            </div>
          ) : (
            bookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onAssignClick={() => onAssignClick(b.id)}
                isDragging={draggingBookingId === b.id}
                canManage={canManage}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
