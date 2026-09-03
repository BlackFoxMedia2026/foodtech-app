"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Booking, Guest, Table } from "@prisma/client";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils";
import { TABLE_SIZE } from "@/components/floor/table-node";

export type FloorBooking = Booking & { guest: Guest | null };

const VISUAL_SCALE = 0.72;

function visualSize(shape: Table["shape"]) {
  const s = TABLE_SIZE[shape];
  return { w: Math.round(s.w * VISUAL_SCALE), h: Math.round(s.h * VISUAL_SCALE) };
}

function compactName(fullName: string) {
  if (fullName.length <= 12) return fullName;
  const [first, ...rest] = fullName.split(" ");
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0]}.` : first;
}

/**
 * Reservation-mode table visual — sibling to (not a fork of) the Room
 * Builder's TableNode: same TABLE_SIZE footprint/shape rounding so tables
 * read identically between Sala and Prenotazioni, but read-only (no
 * onStartDrag/repositioning, brief section 8) and droppable via dnd-kit
 * instead of staff-badge rendering.
 */
export function BookingTableNode({
  table,
  bookings,
  isSelected,
  isDragActive,
  isCompatibleDropTarget,
  onSelect,
}: {
  table: Table;
  bookings: FloorBooking[];
  isSelected: boolean;
  isDragActive: boolean;
  isCompatibleDropTarget: boolean;
  onSelect: (tableId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: table.id, data: { type: "table", tableId: table.id, seats: table.seats } });

  const size = TABLE_SIZE[table.shape];
  const visual = visualSize(table.shape);
  const primary = bookings[0] ?? null;
  const extraCount = Math.max(0, bookings.length - 1);
  const isBooked = !!primary;
  const guestName = primary?.guest ? `${primary.guest.firstName} ${primary.guest.lastName ?? ""}`.trim() : "Walk-in";

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      // Without this, the canvas viewport's own onPointerDown (pan-gesture
      // tracking) still fires on bubbling and treats the release as a
      // "background click", clearing the selection right before this node's
      // own onClick would have set it — same fix table-node.tsx already
      // applies for the Room Builder's pan/click distinction.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(table.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(table.id);
        }
      }}
      className="group absolute select-none"
      style={{
        left: table.posX,
        top: table.posY,
        width: size.w,
        height: size.h,
        transform: `rotate(${table.rotation}deg)`,
      }}
    >
      <div className="relative grid h-full w-full place-items-center">
        <div
          className={cn(
            "relative grid cursor-pointer place-items-center shadow-lg transition-all group-hover:shadow-xl",
            table.shape === "ROUND" && "rounded-full",
            table.shape === "SQUARE" && "rounded-md",
            table.shape === "RECT" && "rounded-md",
            table.shape === "BOOTH" && "rounded-2xl",
            table.shape === "LOUNGE" && "rounded-3xl",
            !table.active
              ? "bg-muted text-muted-foreground"
              : isBooked
                ? "bg-surface-brown-light text-clay-ink"
                : "table-pearl text-carbon-900",
            isSelected
              ? "ring-4 ring-accent/70"
              : isDragActive && isCompatibleDropTarget
                ? "ring-2 ring-sage"
                : isDragActive
                  ? "ring-1 ring-surface-brown-light/30 opacity-60"
                  : isBooked
                    ? "ring-1 ring-surface-brown/50"
                    : "ring-1 ring-sage-deep/40",
            isOver && isCompatibleDropTarget && "scale-105 ring-4 ring-sage",
          )}
          style={{ width: visual.w, height: visual.h }}
        >
          <div
            className="flex flex-col items-center justify-center gap-0.5 px-1 text-center leading-none"
            style={{ transform: "scale(var(--ui-scale, 1))" }}
          >
            <span className="text-display text-sm font-semibold">{table.label}</span>
            <span className="text-xs opacity-80">{table.seats} posti</span>
          </div>

          {!table.active && <Lock className="absolute bottom-1 left-1 h-3 w-3" />}

          <div
            className="absolute left-1/2 top-full mt-1"
            style={{ transform: "translateX(-50%) scale(var(--ui-scale, 1))", transformOrigin: "top center" }}
          >
            {isBooked ? (
              <div className="flex w-max max-w-[180px] flex-col items-center gap-0 rounded-md border border-border bg-card/95 px-2 py-1 shadow-sm backdrop-blur-sm">
                <span className="whitespace-nowrap text-[10px] font-medium text-accent-strong">{formatTime(primary.startsAt)}</span>
                <span className="truncate text-xs font-semibold text-card-foreground">{compactName(guestName)}</span>
                {extraCount > 0 && <span className="text-[10px] text-muted-foreground">+{extraCount} altre</span>}
              </div>
            ) : (
              <div className="flex w-max items-center gap-1 rounded-full border border-sage-deep/40 bg-forest px-2 py-0.5 shadow-sm">
                <span className="text-xs font-semibold text-cream">Libero</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
