"use client";

import {
  Armchair,
  ChefHat,
  CircleDot,
  DoorOpen,
  GlassWater,
  LandPlot,
  PanelTop,
  RectangleHorizontal,
  Square,
  SquareStack,
  Warehouse,
  RectangleVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AREA_LABELS, AREA_TYPES, type AreaType } from "@/lib/room-layout";
import { UnplacedTablesPanel } from "./unplaced-tables-panel";
import type { RoomBuilder, PlaceableType } from "./use-room-builder";

export type ToolCategory = "structure" | "areas" | "tables";

const AREA_ICONS: Record<AreaType, React.ComponentType<{ className?: string }>> = {
  AREA_KITCHEN: ChefHat,
  AREA_BAR: GlassWater,
  AREA_WC: SquareStack,
  AREA_STORAGE: Warehouse,
  AREA_PRIVATE: PanelTop,
  AREA_ENTRANCE: DoorOpen,
  AREA_TERRACE: LandPlot,
};

type TableShapePreset = { label: string; shape: "ROUND" | "SQUARE" | "RECT"; seats: number };
const TABLE_PRESETS: TableShapePreset[] = [
  { label: "Tavolo rotondo", shape: "ROUND", seats: 4 },
  { label: "Tavolo quadrato", shape: "SQUARE", seats: 4 },
  { label: "Tavolo rettangolare", shape: "RECT", seats: 6 },
];

/** Content of the panel next to the tool rail — one category at a time
 * (brief §26-28), Illustrator/Canva-style: pick a category on the rail, its
 * tools replace the panel content. Structural items and areas are placed via
 * a single click-to-arm + click-to-place flow (keyboard/touch friendly) and
 * are also natively HTML5-draggable onto the canvas. Table presets create a
 * REAL Table row on drop (brief §18/20/21) instead of a purely visual shape,
 * so there is never a "graphic table" separate from the gestionale table. */
export function ElementLibraryPanel({ builder, category }: { builder: RoomBuilder; category: ToolCategory }) {
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

  if (category === "structure") {
    return (
      <div className="flex h-full w-full flex-col gap-2 overflow-y-auto p-3 text-sm">
        <LibrarySection title="Struttura">
          <LibraryButton
            icon={SquareStack}
            label="Parete"
            active={builder.tool.mode === "drawing-wall"}
            onClick={() => builder.setTool(builder.tool.mode === "drawing-wall" ? { mode: "idle" } : { mode: "drawing-wall" })}
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
      </div>
    );
  }

  if (category === "areas") {
    return (
      <div className="flex h-full w-full flex-col gap-2 overflow-y-auto p-3 text-sm">
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
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-sm">
      <div className="shrink-0 overflow-y-auto p-3">
        <LibrarySection title="Tavoli">
          {TABLE_PRESETS.map((preset) => (
            <LibraryButton
              key={preset.shape}
              icon={preset.shape === "ROUND" ? CircleDot : preset.shape === "SQUARE" ? Square : RectangleHorizontal}
              label={preset.label}
              active={builder.tool.mode === "placing-table" && builder.tool.shape === preset.shape}
              onClick={() => armTablePreset(preset)}
              draggable
              onDragStart={(e) => onDragStartTablePreset(e, preset)}
            />
          ))}
        </LibrarySection>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
        <UnplacedTablesPanel builder={builder} />
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
  onClick,
  draggable,
  onDragStart,
  onDrop,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (e) => e.preventDefault() : undefined}
      onDrop={onDrop}
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border border-border px-2 py-2.5 text-center text-[11px] leading-tight transition-colors hover:bg-secondary",
        active && "border-accent-strong bg-accent-strong/10 text-accent-strong",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

// Referenced for potential future decorative-furniture expansion; kept
// imported so the icon set stays visible in one place if ARREDO grows.
void Armchair;
void RectangleVertical;
