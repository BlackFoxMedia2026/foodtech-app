"use client";

import { forwardRef, memo } from "react";
import type { Booking, Guest, Table } from "@prisma/client";
import { Circle, Lock, MoreHorizontal, Trash2, Users } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TABLE_ASSIGNABLE_CAPABILITIES, TABLE_ROLE_LABELS } from "@/lib/staff-roles";
import { TABLE_ROLE_ICONS } from "@/components/floor/staff-role-icons";
import { LARGHEZZA_PER_PAROLA, TABLE_SIZE, visualSize, type LocalTable, type TableStaffMap, type TableLod } from "@/components/floor/table-node";
import type { TableOperationalStatus } from "@/lib/table-status";

export type RoomTableMode = "STAFF" | "RESERVATIONS" | "READONLY";
/*
  Senza `totalSpend`: è un `Decimal` di Prisma, e i `Decimal` non attraversano
  il confine fra server e componente client. Qui non serve — di un ospite, sulla
  pianta della sala, contano il nome, le allergie e il livello, non quanto ha
  speso. Vedi la nota in `bookings-page-client.tsx`.
*/
export type FloorBooking = Booking & { guest: Omit<Guest, "totalSpend"> | null };

/** Perceived "thickness" of the table object — the bottom edge slab that
 * reads as depth (brief section 29: 4-8px), scaled a little by footprint so
 * larger shapes (booth/lounge) don't look thinner than small ones. */
const EDGE_DEPTH: Record<Table["shape"], number> = {
  ROUND: 6,
  SQUARE: 6,
  RECT: 5,
  BOOTH: 7,
  LOUNGE: 8,
};

const SHAPE_ROUNDING: Record<Table["shape"], string> = {
  ROUND: "rounded-full",
  SQUARE: "rounded-md",
  RECT: "rounded-md",
  BOOTH: "rounded-2xl",
  LOUNGE: "rounded-3xl",
};

/** BOOTH/LOUNGE already imply built-in bench/sofa seating — individual
 * chair marks only read correctly for a freestanding table (brief §22). */
const CHAIR_SHAPES = new Set<Table["shape"]>(["ROUND", "SQUARE", "RECT"]);
const MAX_CHAIRS = 8;

/** Chair anchors on an ellipse just outside the table footprint, evenly
 * spaced by seat count — schematic, not a real seating-plan solver, just
 * enough to read "how many seats + roughly which way they face" per the
 * reference mockup. */
function chairPositions(seats: number, visualW: number, visualH: number) {
  const n = Math.min(seats, MAX_CHAIRS);
  if (n <= 0) return [];
  const rx = visualW / 2 + 9;
  const ry = visualH / 2 + 9;
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return {
      x: rx * Math.cos(angle),
      y: ry * Math.sin(angle),
      rotationDeg: (angle * 180) / Math.PI + 90,
    };
  });
}

function compactName(fullName: string, max = 10) {
  if (fullName.length <= max) return fullName;
  const [first, ...rest] = fullName.split(" ");
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0]}.` : first;
}

/** LIBERO reads as the cream/sage "free" look already established by the
 * Reservations map; PRENOTATO/OCCUPATO scale up through the same brown
 * family (brief section 19); NON_DISPONIBILE stays the neutral/desaturated
 * look the inactive-table state already had. No status = today's neutral
 * table-pearl look (callers not passing `status` yet keep prior visuals). */
const STATUS_SURFACE: Record<TableOperationalStatus, string> = {
  LIBERO: "table-wood text-clay-ink",
  PRENOTATO: "bg-surface-brown-light text-clay-ink",
  OCCUPATO: "bg-surface-brown-dark text-cream",
  NON_DISPONIBILE: "bg-muted text-muted-foreground",
};
const STATUS_EDGE: Record<TableOperationalStatus, string> = {
  LIBERO: "bg-surface-brown-light",
  PRENOTATO: "bg-surface-brown",
  OCCUPATO: "bg-clay-ink",
  NON_DISPONIBILE: "bg-muted-foreground/30",
};
const STATUS_RING: Record<TableOperationalStatus, string> = {
  LIBERO: "ring-1 ring-sage-deep/50",
  PRENOTATO: "ring-1 ring-surface-brown/60",
  OCCUPATO: "ring-1 ring-clay-ink/60",
  NON_DISPONIBILE: "ring-1 ring-muted-foreground/30",
};

type MenuProps = {
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpenAssignStaff: (tableId: string) => void;
};

/**
 * Shared physical 2.5D table object for the operational room view — the
 * same component renders in Sala (mode STAFF) and Prenotazioni→Mappa (mode
 * RESERVATIONS); only the badge content and interaction affordances change.
 * Depth comes from a stacked "edge" slab + layered box-shadow, never from
 * filter:blur/backdrop-filter (kept cheap at 50 tables — brief section 42).
 *
 * No onStartDrag/onStartRotate here by design: table repositioning stays
 * exclusive to the Room Builder (TableNode), never reachable from this
 * component (brief section 22).
 */
export const RoomTableNode = memo(
  forwardRef<
    HTMLDivElement,
    {
      table: LocalTable;
      mode: RoomTableMode;
      status?: TableOperationalStatus;
      isSelected: boolean;
      lod?: TableLod;
      onSelect?: (id: string) => void;
      className?: string;
      // mode="STAFF"
      staff?: TableStaffMap;
      matchesFilter?: boolean;
      onDelete?: (id: string) => void;
      menu?: MenuProps;
      // mode="RESERVATIONS"
      bookings?: FloorBooking[];
      isDragActive?: boolean;
      isCompatibleDropTarget?: boolean;
      isOver?: boolean;
    }
  >(function RoomTableNode(
    {
      table: t,
      mode,
      status,
      isSelected,
      lod = "full",
      onSelect,
      className,
      staff,
      matchesFilter = true,
      onDelete,
      menu,
      bookings,
      isDragActive = false,
      isCompatibleDropTarget = false,
      isOver = false,
    },
    ref,
  ) {
    const size = TABLE_SIZE[t.shape];
    const visual = visualSize(t.shape, t.seats);
    const rounding = SHAPE_ROUNDING[t.shape];
    const depth = EDGE_DEPTH[t.shape];

    const assignedRoles =
      mode === "STAFF"
        ? TABLE_ASSIGNABLE_CAPABILITIES.map((role) => ({ role, person: staff?.[role] })).filter(
            (a): a is { role: (typeof TABLE_ASSIGNABLE_CAPABILITIES)[number]; person: NonNullable<typeof a.person> } =>
              Boolean(a.person),
          )
        : [];
    const hasAnyAssignment = assignedRoles.length > 0;
    const primaryStaff = assignedRoles[0];
    const primaryStaffLabel = primaryStaff
      ? lod === "full"
        ? primaryStaff.person.name
        : compactName(primaryStaff.person.name)
      : "Non assegnato";
    const visibleRoleIcons = assignedRoles.slice(0, 3);
    const overflowRoles = assignedRoles.slice(3);

    const primaryBooking = mode === "RESERVATIONS" ? bookings?.[0] ?? null : null;
    const extraBookingsCount = mode === "RESERVATIONS" ? Math.max(0, (bookings?.length ?? 0) - 1) : 0;
    const isBooked = !!primaryBooking;
    const guestName = primaryBooking?.guest
      ? `${primaryBooking.guest.firstName} ${primaryBooking.guest.lastName ?? ""}`.trim()
      : "Walk-in";

    // Explicit `status` (once wired) always wins. Until then: STAFF keeps
    // the neutral pearl look it always had (assignment shows via the ring/
    // badge, never by recoloring the table — see table-node.tsx); RESERVATIONS
    // falls back to the same isBooked-driven brown tint BookingTableNode used
    // to render, so this merge doesn't regress that visual cue.
    const effectiveStatus: TableOperationalStatus | null =
      status ?? (!t.active ? "NON_DISPONIBILE" : mode === "RESERVATIONS" && isBooked ? "PRENOTATO" : null);
    const surfaceClass = effectiveStatus ? STATUS_SURFACE[effectiveStatus] : "table-wood text-clay-ink";
    const edgeClass = effectiveStatus ? STATUS_EDGE[effectiveStatus] : "bg-surface-brown-light";
    const statusRing = effectiveStatus
      ? STATUS_RING[effectiveStatus]
      : mode === "RESERVATIONS"
        ? STATUS_RING.LIBERO
        : "ring-1 ring-surface-brown-light/50";

    const ringClass = isSelected
      ? "ring-4 ring-accent/70"
      : mode === "RESERVATIONS" && isDragActive
        ? isCompatibleDropTarget
          ? "ring-2 ring-sage"
          : "ring-1 ring-surface-brown-light/30 opacity-60"
        : mode === "STAFF"
          ? hasAnyAssignment
            ? "ring-1 ring-sage-deep/50"
            : "ring-1 ring-surface-brown-light/50"
          : statusRing;

    return (
      <div
        ref={ref}
        role={mode === "READONLY" ? undefined : "button"}
        tabIndex={mode === "READONLY" ? undefined : 0}
        // Always stop here, regardless of mode: OperationalRoomView's
        // viewport treats an unclaimed pointerdown as the start of a
        // background pan/click, which would otherwise immediately clear
        // the selection this node's own onClick just set (confirmed via
        // browser testing — clicking a table silently failed to select it
        // once onStartDrag, which used to carry this same stopPropagation,
        // was removed here by design).
        onPointerDown={(e) => e.stopPropagation()}
        onClick={
          mode === "READONLY"
            ? undefined
            : (e) => {
                e.stopPropagation();
                onSelect?.(t.id);
              }
        }
        onKeyDown={
          mode === "READONLY"
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(t.id);
                } else if ((e.key === "Delete" || e.key === "Backspace") && isSelected) {
                  onDelete?.(t.id);
                }
              }
        }
        className={cn(
          "group absolute select-none",
          mode === "READONLY" ? "touch-none" : "touch-none cursor-pointer",
          className,
        )}
        style={{
          left: t.posX,
          top: t.posY,
          width: size.w,
          height: size.h,
          transform: `rotate(${t.rotation}deg)`,
        }}
      >
        <div
          className={cn("relative grid h-full w-full place-items-center", mode === "STAFF" && !matchesFilter && "opacity-20")}
        >
          {/* Bottom edge slab — the extruded "side" of the table object that
              reads as physical thickness (no isometric projection, just a
              flat offset copy underneath). */}
          <div
            aria-hidden="true"
            className={cn("absolute rounded-[inherit]", rounding, edgeClass)}
            style={{ width: visual.w, height: visual.h, transform: `translateY(${depth}px)` }}
          />

          {lod !== "low" && CHAIR_SHAPES.has(t.shape) && (
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{ transform: "scale(var(--ui-scale, 1))" }}
            >
              {chairPositions(t.seats, visual.w, visual.h).map((c, i) => (
                <div
                  key={i}
                  className="absolute rounded-[3px] bg-forest shadow-sm"
                  style={{
                    left: "50%",
                    top: "50%",
                    width: 11,
                    height: 13,
                    transform: `translate(-50%, -50%) translate(${c.x}px, ${c.y}px) rotate(${c.rotationDeg}deg)`,
                  }}
                />
              ))}
            </div>
          )}

          <div
            className={cn(
              "relative grid place-items-center transition-all duration-150 group-hover:-translate-y-0.5",
              rounding,
              surfaceClass,
              ringClass,
              isOver && isCompatibleDropTarget && "scale-105 ring-4 ring-sage",
              isSelected && "-translate-y-0.5",
            )}
            style={{
              width: visual.w,
              height: visual.h,
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,.7), 0 2px 0 rgba(0,0,0,.14), 0 6px 10px -2px rgba(0,0,0,.28), 0 14px 20px -6px rgba(0,0,0,.18)",
            }}
          >
            <div
              className="flex flex-col items-center justify-center gap-0.5 px-1 text-center leading-none"
              style={{ transform: "scale(var(--ui-scale, 1))" }}
            >
              <span className="text-display text-sm font-semibold">{t.label}</span>
              {lod === "full" && (
                <span className="text-xs opacity-80">
                  {visual.w >= LARGHEZZA_PER_PAROLA ? `${t.seats} posti` : `${t.seats}p`}
                </span>
              )}
            </div>

            {lod === "low" && (
              <span
                className={cn(
                  "absolute bottom-0.5 h-2 w-2 rounded-full ring-2 ring-white/70",
                  mode === "STAFF" ? (hasAnyAssignment ? "bg-sage" : "bg-muted-foreground/50") : isBooked ? "bg-surface-brown" : "bg-sage",
                )}
                style={{ transform: "scale(var(--ui-scale, 1))" }}
                aria-hidden="true"
              />
            )}

            {!t.active && <Lock className="absolute bottom-1 left-1 h-3 w-3" />}

            {mode === "STAFF" && isSelected && menu && (
              <div
                className="absolute -right-2.5 -top-2.5"
                style={{ transform: "scale(var(--ui-scale, 1))", transformOrigin: "top right" }}
              >
                <DropdownMenu open={menu.menuOpen} onOpenChange={menu.onMenuOpenChange}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Azioni tavolo ${t.label}`}
                      aria-haspopup="menu"
                      aria-expanded={menu.menuOpen}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="grid h-6 w-6 place-items-center rounded-full border border-surface-brown-light bg-forest text-cream shadow-md transition-all hover:border-accent-strong hover:brightness-110 active:scale-90"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="min-w-[200px]"
                  >
                    <DropdownMenuItem onSelect={() => menu.onOpenAssignStaff(t.id)}>
                      <Users className="h-4 w-4" /> Assegna personale
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete?.(t.id)}>
                      <Trash2 className="h-4 w-4" /> Elimina tavolo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {lod !== "low" && mode === "STAFF" && (
              <div
                className="absolute left-1/2 top-full mt-1"
                style={{ transform: "translateX(-50%) scale(var(--ui-scale, 1))", transformOrigin: "top center" }}
              >
                {hasAnyAssignment ? (
                  <div className="flex w-max max-w-[180px] items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-0.5 shadow-sm backdrop-blur-sm">
                    <span className="truncate text-xs font-semibold text-card-foreground">{primaryStaffLabel}</span>
                    {visibleRoleIcons.map(({ role, person }) => {
                      const Icon = TABLE_ROLE_ICONS[role];
                      return (
                        <span key={role} title={`${TABLE_ROLE_LABELS[role]}: ${person.name}`} className="shrink-0">
                          <Icon
                            className={cn("h-3.5 w-3.5", person.status === "RESTING" ? "text-destructive" : "text-accent-strong")}
                          />
                        </span>
                      );
                    })}
                    {overflowRoles.length > 0 && (
                      <span
                        title={overflowRoles.map(({ role, person }) => `${TABLE_ROLE_LABELS[role]}: ${person.name}`).join(" · ")}
                        className="shrink-0 rounded-full bg-secondary px-1 text-[10px] font-semibold leading-4 text-card-foreground"
                      >
                        +{overflowRoles.length}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex w-max items-center gap-1 rounded-full border border-surface-brown-light bg-forest px-2 py-0.5 shadow-sm">
                    <Circle className="h-2.5 w-2.5 shrink-0 text-cream" aria-hidden="true" />
                    <span className="text-xs font-semibold text-cream">Non assegnato</span>
                  </div>
                )}
              </div>
            )}

            {lod !== "low" && mode === "RESERVATIONS" && (
              <div
                className="absolute left-1/2 top-full mt-1"
                style={{ transform: "translateX(-50%) scale(var(--ui-scale, 1))", transformOrigin: "top center" }}
              >
                {isBooked && primaryBooking ? (
                  <div className="flex w-max max-w-[180px] flex-col items-center gap-0 riquadro bg-card/95 px-2 py-1 shadow-sm backdrop-blur-sm">
                    <span className="whitespace-nowrap text-[10px] font-medium text-accent-strong">
                      {formatTime(primaryBooking.startsAt)}
                    </span>
                    <span className="truncate text-xs font-semibold text-card-foreground">{compactName(guestName, 12)}</span>
                    {extraBookingsCount > 0 && <span className="text-[10px] text-muted-foreground">+{extraBookingsCount} altre</span>}
                  </div>
                ) : (
                  <div className="flex w-max items-center gap-1 rounded-full border border-sage-deep/40 bg-forest px-2 py-0.5 shadow-sm">
                    <span className="text-xs font-semibold text-cream">Libero</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }),
);
