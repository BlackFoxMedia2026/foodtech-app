"use client";

import { memo } from "react";
import type { StaffCapability, Table, TableShape } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Circle, Lock, MoreHorizontal, RotateCw, Trash2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TABLE_ASSIGNABLE_CAPABILITIES, TABLE_ROLE_LABELS } from "@/lib/staff-roles";
import { TABLE_ROLE_ICONS } from "./staff-role-icons";

export type LocalTable = Table & { dirty?: boolean };

export type TableStaffPerson = { id: string; name: string; status: "ACTIVE" | "RESTING" };
export type TableStaffMap = Partial<Record<(typeof TABLE_ASSIGNABLE_CAPABILITIES)[number], TableStaffPerson>>;

export const TABLE_SIZE: Record<TableShape, { w: number; h: number }> = {
  ROUND: { w: 80, h: 80 },
  SQUARE: { w: 80, h: 80 },
  RECT: { w: 120, h: 70 },
  BOOTH: { w: 160, h: 90 },
  LOUNGE: { w: 140, h: 100 },
};

/**
 * TABLE_SIZE stays the hit/drag footprint (untouched — drag clamping and
 * hit-testing in floor-canvas.tsx key off it directly). The rendered shape is
 * drawn smaller and centered inside that footprint, so the hit area is
 * naturally a bit larger than what's visible without any extra math.
 */
const VISUAL_SCALE = 0.72;

function visualSize(shape: TableShape) {
  const s = TABLE_SIZE[shape];
  return {
    w: Math.round(s.w * VISUAL_SCALE),
    h: Math.round(s.h * VISUAL_SCALE),
  };
}

export type TableLod = "full" | "medium" | "low";

/** At most this many role icons render inline next to the primary name; any
 * further assignments collapse into a "+N" chip (brief point 16) — with only
 * 4 assignable capabilities this only ever bites when all 4 are covered. */
const MAX_ROLE_ICONS = 3;

function compactName(fullName: string) {
  if (fullName.length <= 10) return fullName;
  const [first, ...rest] = fullName.split(" ");
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0]}.` : first;
}

type MenuProps = {
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpenAssignStaff: (tableId: string) => void;
};

export const TableNode = memo(function TableNode({
  table: t,
  isSelected,
  matchesFilter,
  staff,
  lod = "full",
  onSelect,
  onDelete,
  onStartDrag,
  onStartRotate,
  menu,
}: {
  table: LocalTable;
  isSelected: boolean;
  matchesFilter: boolean;
  staff?: TableStaffMap;
  lod?: TableLod;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onStartDrag: (id: string, e: React.PointerEvent) => void;
  /** Room Builder only: shows a rotate handle above the table when selected. */
  onStartRotate?: (id: string, e: React.PointerEvent) => void;
  menu?: MenuProps;
}) {
  const size = TABLE_SIZE[t.shape];
  const visual = visualSize(t.shape);

  // TABLE_ASSIGNABLE_CAPABILITIES is already in priority order (Responsabile
  // tavolo first) — the primary name shown on the node follows that same
  // order, falling through to whichever *other* role is actually covered
  // instead of only ever looking at TABLE_RESPONSIBLE. That fallback is the
  // fix for "a table with only a Sommelier assigned showed as Non assegnato".
  const assignedRoles = TABLE_ASSIGNABLE_CAPABILITIES.map((role) => ({ role, person: staff?.[role] })).filter(
    (a): a is { role: (typeof TABLE_ASSIGNABLE_CAPABILITIES)[number]; person: TableStaffPerson } => Boolean(a.person),
  );
  const hasAnyAssignment = assignedRoles.length > 0;
  const primary = assignedRoles[0];
  const primaryLabel = primary ? (lod === "full" ? primary.person.name : compactName(primary.person.name)) : "Non assegnato";
  const visibleRoleIcons = assignedRoles.slice(0, MAX_ROLE_ICONS);
  const overflowRoles = assignedRoles.slice(MAX_ROLE_ICONS);

  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => {
        e.stopPropagation();
        onStartDrag(t.id, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(t.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(t.id);
        } else if (e.key === "Delete" || e.key === "Backspace") {
          if (isSelected) onDelete(t.id);
        }
      }}
      className="group absolute select-none touch-none cursor-grab active:cursor-grabbing"
      style={{
        left: t.posX,
        top: t.posY,
        width: size.w,
        height: size.h,
        transform: `rotate(${t.rotation}deg)`,
      }}
    >
      <div
        className={cn(
          "relative grid h-full w-full place-items-center",
          // Assignment state is communicated via the ring/badge below, never
          // by dimming the whole table — a table with staff assigned should
          // never look "more disabled" than one without.
          !matchesFilter && "opacity-20",
        )}
      >
        <div
          className={cn(
            "relative grid place-items-center shadow-lg transition-shadow group-hover:shadow-xl",
            t.shape === "ROUND" && "rounded-full",
            t.shape === "SQUARE" && "rounded-md",
            t.shape === "RECT" && "rounded-md",
            t.shape === "BOOTH" && "rounded-2xl",
            t.shape === "LOUNGE" && "rounded-3xl",
            t.active ? "table-pearl text-carbon-900" : "bg-muted text-muted-foreground",
            isSelected
              ? "ring-4 ring-accent/70"
              : hasAnyAssignment
                ? "ring-1 ring-sage-deep/50"
                : "ring-1 ring-surface-brown-light/50",
          )}
          style={{ width: visual.w, height: visual.h }}
        >
          <div
            className="flex flex-col items-center justify-center gap-0.5 px-1 text-center leading-none"
            style={{ transform: "scale(var(--ui-scale, 1))" }}
          >
            <span className="text-display text-sm font-semibold">{t.label}</span>
            {lod === "full" && <span className="text-xs opacity-80">{t.seats} posti</span>}
          </div>

          {lod === "low" && (
            <span
              className={cn(
                "absolute bottom-0.5 h-2 w-2 rounded-full ring-2 ring-white/70",
                hasAnyAssignment ? "bg-sage" : "bg-muted-foreground/50",
              )}
              style={{ transform: "scale(var(--ui-scale, 1))" }}
              aria-hidden="true"
            />
          )}

          {!t.active && <Lock className="absolute bottom-1 left-1 h-3 w-3" />}

          {isSelected && onStartRotate && (
            <button
              type="button"
              aria-label={`Ruota tavolo ${t.label}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onStartRotate(t.id, e);
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute -top-3 left-1/2 grid h-5 w-5 -translate-x-1/2 cursor-grab place-items-center rounded-full bg-accent-strong text-white shadow-md active:cursor-grabbing"
              style={{ transform: `translateX(-50%) scale(var(--ui-scale, 1))`, transformOrigin: "bottom center" }}
            >
              <RotateCw className="h-3 w-3" />
            </button>
          )}

          {isSelected && menu && (
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
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(t.id)}>
                    <Trash2 className="h-4 w-4" /> Elimina tavolo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {lod !== "low" && (
            <div
              className="absolute left-1/2 top-full mt-1"
              style={{ transform: "translateX(-50%) scale(var(--ui-scale, 1))", transformOrigin: "top center" }}
            >
              {hasAnyAssignment ? (
                <div className="flex w-max max-w-[180px] items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-0.5 shadow-sm backdrop-blur-sm">
                  <span className="truncate text-xs font-semibold text-card-foreground">{primaryLabel}</span>
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
        </div>
      </div>
    </div>
  );
});
