"use client";

import {
  ChefHat,
  CircleDot,
  DoorOpen,
  Frame,
  GlassWater,
  Layers,
  LandPlot,
  PanelTop,
  RectangleHorizontal,
  Ruler,
  SeparatorVertical,
  Sofa,
  Square,
  SquareStack,
  Type,
  Warehouse,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS, AREA_TYPES, type AreaType } from "@/lib/room-layout";
import { UnplacedTablesPanel } from "./unplaced-tables-panel";
import type { RoomBuilder, PlaceableType } from "./use-room-builder";

const AREA_ICONS: Record<AreaType, React.ComponentType<{ className?: string }>> = {
  AREA_ZONE: Frame,
  AREA_KITCHEN: ChefHat,
  AREA_BAR: GlassWater,
  AREA_WC: SquareStack,
  AREA_STORAGE: Warehouse,
  AREA_PRIVATE: PanelTop,
  AREA_ENTRANCE: DoorOpen,
  AREA_TERRACE: LandPlot,
  AREA_STAIRS: Layers,
};

type TableShapePreset = { label: string; shape: "ROUND" | "SQUARE" | "RECT" | "BOOTH" | "LOUNGE"; seats: number };
const TABLE_PRESETS: TableShapePreset[] = [
  { label: "Tavolo rotondo", shape: "ROUND", seats: 4 },
  { label: "Tavolo quadrato", shape: "SQUARE", seats: 4 },
  { label: "Tavolo rettangolare", shape: "RECT", seats: 6 },
  { label: "Booth", shape: "BOOTH", seats: 6 },
];

/** Content of the "Elementi" sidebar — every category stacked in one
 * scrollable list (brief: struttura come SCREEN 1), Illustrator/Canva-style
 * only in the sense that each item is arm-then-place (click or native HTML5
 * drag) rather than a rail-driven category switch. Structural items and
 * areas are placed via a single click-to-arm + click-to-place flow (keyboard/
 * touch friendly) and are also natively HTML5-draggable onto the canvas.
 * Table presets create a REAL Table row on drop so there is never a
 * "graphic table" separate from the gestionale table. */
export function ElementLibraryPanel({ builder }: { builder: RoomBuilder }) {
  function arm(type: PlaceableType) {
    builder.setTool(builder.tool.mode === "placing" && builder.tool.elementType === type ? { mode: "idle" } : { mode: "placing", elementType: type });
  }

  function onDragStartElement(e: React.DragEvent, type: PlaceableType) {
    e.dataTransfer.setData("application/x-element-type", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  function onDragStartTablePreset(e: React.DragEvent, preset: TableShapePreset) {
    e.dataTransfer.setData("application/x-new-table", `${preset.shape}:${preset.seats}`);
    e.dataTransfer.effectAllowed = "copy";
  }

  function armTablePreset(preset: TableShapePreset) {
    builder.setTool(
      builder.tool.mode === "placing-table" && builder.tool.shape === preset.shape
        ? { mode: "idle" }
        : { mode: "placing-table", shape: preset.shape, seats: preset.seats },
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-sm">
      <div className="shrink-0 border-b border-border px-3 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Elementi</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-3">
          <LibrarySection title="Tavoli">
            {TABLE_PRESETS.map((preset) => (
              <LibraryButton
                key={preset.shape}
                icon={preset.shape === "ROUND" ? CircleDot : preset.shape === "SQUARE" ? Square : preset.shape === "BOOTH" ? Sofa : RectangleHorizontal}
                label={preset.label}
                active={builder.tool.mode === "placing-table" && builder.tool.shape === preset.shape}
                onClick={() => armTablePreset(preset)}
                draggable
                onDragStart={(e) => onDragStartTablePreset(e, preset)}
              />
            ))}
            <LibraryButton icon={Ruler} label="Tavolo personalizzato" disabled comingSoon />
          </LibrarySection>

          <LibrarySection title="Struttura">
            <LibraryButton
              icon={SquareStack}
              label="Parete"
              active={builder.tool.mode === "drawing-wall"}
              onClick={() => builder.setTool(builder.tool.mode === "drawing-wall" ? { mode: "idle" } : { mode: "drawing-wall" })}
            />
            <LibraryButton
              icon={SeparatorVertical}
              label="Divisorio"
              active={builder.tool.mode === "drawing-divider"}
              onClick={() => builder.setTool(builder.tool.mode === "drawing-divider" ? { mode: "idle" } : { mode: "drawing-divider" })}
            />
            <LibraryButton
              icon={DoorOpen}
              label="Porta"
              active={builder.tool.mode === "placing" && builder.tool.elementType === "DOOR"}
              onClick={() => arm("DOOR")}
              draggable
              onDragStart={(e) => onDragStartElement(e, "DOOR")}
            />
            <LibraryButton
              icon={PanelTop}
              label="Finestra"
              active={builder.tool.mode === "placing" && builder.tool.elementType === "WINDOW"}
              onClick={() => arm("WINDOW")}
              draggable
              onDragStart={(e) => onDragStartElement(e, "WINDOW")}
            />
            <LibraryButton
              icon={CircleDot}
              label="Colonna"
              active={builder.tool.mode === "placing" && builder.tool.elementType === "COLUMN"}
              onClick={() => arm("COLUMN")}
              draggable
              onDragStart={(e) => onDragStartElement(e, "COLUMN")}
            />
          </LibrarySection>

          <LibrarySection title="Aree">
            {AREA_TYPES.map((type) => (
              <LibraryButton
                key={type}
                icon={AREA_ICONS[type]}
                label={AREA_LABELS[type]}
                active={builder.tool.mode === "placing" && builder.tool.elementType === type}
                onClick={() => arm(type)}
                draggable
                onDragStart={(e) => onDragStartElement(e, type)}
              />
            ))}
          </LibrarySection>

          <LibrarySection title="Altro">
            <LibraryButton icon={Type} label="Testo" disabled comingSoon />
            <LibraryButton icon={Frame} label="Elemento libero" disabled comingSoon />
          </LibrarySection>
        </div>

        <div className="border-t border-border">
          <UnplacedTablesPanel builder={builder} />
        </div>
      </div>
    </div>
  );
}

function LibrarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

function LibraryButton({
  icon: Icon,
  label,
  active,
  disabled,
  comingSoon,
  onClick,
  draggable,
  onDragStart,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** Shows a small "Prossimamente" tag instead of wiring up a feature that
   * would need a new element type (free text/shape, custom table size) —
   * same honest pattern already used in ManagePlanDialog's "Importa da
   * foto" card, so the sidebar can match SCREEN 1's full list without
   * pretending unbuilt tools work. */
  comingSoon?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable={draggable && !disabled}
      onDragStart={onDragStart}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={comingSoon ? `${label} · Prossimamente` : label}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2.5 text-center text-[11px] leading-tight transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-secondary",
        active && "border-accent-strong bg-accent-strong/10 text-accent-strong",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {comingSoon && (
        <span className="absolute right-1 top-1 rounded-full bg-secondary px-1 py-px text-[8px] font-medium uppercase tracking-wide text-muted-foreground">
          Presto
        </span>
      )}
    </button>
  );
}
