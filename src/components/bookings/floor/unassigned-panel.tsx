"use client";

import { useDraggable } from "@dnd-kit/core";
import { ChevronDown, GripVertical, Phone, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FloorBooking } from "./booking-table-node";

function BookingCard({
  booking,
  onAssignClick,
  isDragging,
  canManage,
  fuoriPiantina,
}: {
  booking: FloorBooking;
  onAssignClick: () => void;
  isDragging: boolean;
  canManage: boolean;
  /** Il tavolo che ha già, se in Sala non è sulla piantina. */
  fuoriPiantina?: string;
}) {
  // Hook is always called (React rules) — `disabled` is dnd-kit's own way to
  // turn a draggable off, so a read-only viewer sees the same card with no
  // drag affordance at all (brief section 47).
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: booking.id,
    data: { type: "booking", bookingId: booking.id, partySize: booking.partySize },
    disabled: !canManage,
  });
  const guestName = booking.guest ? `${booking.guest.firstName} ${booking.guest.lastName ?? ""}`.trim() : "Walk-in";

  return (
    <div
      ref={setNodeRef}
      /* Niente `transform` qui: a seguire il puntatore è la copia nel
         DragOverlay. Spostando anche l'originale, usciva dal pannello (che
         taglia quello che sborda) e lasciava un buco al suo posto. */
      className={cn(
        "rounded-2xl border border-border/50 bg-card p-3 shadow-sm transition-[box-shadow,opacity] hover:shadow-md",
        isDragging && "border-dashed opacity-40 shadow-none",
      )}
    >
      {/* Ora e nome su una riga, il resto sotto in piccolo: la scheda si legge
          in un colpo d'occhio, come una riga dell'Elenco. */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-strong">
          {formatTime(booking.startsAt)}
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-card-foreground" title={guestName}>
          {guestName}
        </p>
        {canManage && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label="Trascina su un tavolo"
            aria-roledescription="draggable"
            title="Trascina su un tavolo"
            className="-my-1 -mr-1 grid h-9 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted-foreground hover:bg-secondary active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" aria-hidden="true" />
          {booking.partySize} {booking.partySize === 1 ? "persona" : "persone"}
        </span>
        {booking.guest?.phone && (
          <a href={`tel:${booking.guest.phone}`} className="flex items-center gap-1 hover:text-foreground">
            <Phone className="h-3 w-3" aria-hidden="true" /> {booking.guest.phone}
          </a>
        )}
      </div>
      {fuoriPiantina && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-900 dark:text-amber-200">
          Ha il tavolo {fuoriPiantina}, che non è sulla piantina
        </p>
      )}
      {canManage && (
        /* Un fondo suo, il verde pieno dei tondi del back office: col solo
           bordo, bianco su scheda bianca, non si capiva che fosse un bottone. */
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2.5 h-9 w-full rounded-full bg-gradient-to-b from-[#3a6b54] to-[#2c5545] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_14px_-8px_rgba(16,32,26,0.6)] hover:from-[#41775e] hover:to-[#2f5b4a] hover:text-white"
          onClick={onAssignClick}
        >
          {fuoriPiantina ? "Cambia tavolo" : "Assegna tavolo"}
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
  tavoloFuoriPiantina = {},
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
  /** Per id di prenotazione: il tavolo che ha già ma che in Sala è fuori
   * piantina. Sulla mappa non si vedrebbe, quindi torna qui. */
  tavoloFuoriPiantina?: Record<string, string>;
}) {
  return (
    <div className="vetro-ios-scheda flex h-full flex-col rounded-[22px] border border-white/60">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex min-h-11 shrink-0 items-center gap-2 px-4 pb-2 pt-3.5 text-left"
      >
        <span className="text-display text-base font-semibold text-foreground">Da assegnare</span>
        <span
          className={cn(
            "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums",
            bookings.length > 0 ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {bookings.length}
        </span>
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
      </button>
      {!collapsed && (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
          <p className="px-1 pb-1 text-xs text-muted-foreground">
            {canManage ? "Trascinale su un tavolo, o tocca «Assegna tavolo»." : "Prenotazioni senza un tavolo sulla mappa."}
          </p>
          {bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              {hiddenByServiceCount > 0 ? (
                <>
                  <p>Nessuna prenotazione da assegnare per questo servizio.</p>
                  <p className="mt-1">
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
                fuoriPiantina={tavoloFuoriPiantina[b.id]}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
