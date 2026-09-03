"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { WallElement } from "@/lib/room-layout";
import { generateLShape, generateRectangle } from "./perimeter-generator";

export type Shape = "RECTANGLE" | "SQUARE" | "L" | "FREEHAND";

export type WizardFormState = {
  shape: Shape | null;
  /** True once "Continua" is clicked on the shape step — separates "a shape
   * is highlighted/previewed" from "the choice is locked in and we've moved
   * to Dimensioni" (brief §9/§12), so hovering or picking a row never
   * auto-advances the wizard. */
  shapeConfirmed: boolean;
  width: string;
  depth: string;
  notchWidth: string;
  notchDepth: string;
};

export const DEFAULT_WIZARD_FORM: WizardFormState = {
  shape: null,
  shapeConfirmed: false,
  width: "12",
  depth: "8",
  notchWidth: "4",
  notchDepth: "3",
};

type PreviewComponent = (props: { className?: string }) => React.JSX.Element;

type ShapeRowDef = {
  value: Shape;
  label: string;
  description: string;
  preview: PreviewComponent;
};

const SHAPE_ROWS: ShapeRowDef[] = [
  { value: "RECTANGLE", label: "Rettangolare", description: "Per sale lineari.", preview: RectanglePreview },
  { value: "SQUARE", label: "Quadrata", description: "Per ambienti regolari.", preview: SquarePreview },
  { value: "L", label: "A L", description: "Per sale articolate.", preview: LShapePreview },
  { value: "FREEHAND", label: "Disegno libero", description: "Per forme irregolari.", preview: FreehandPreview },
];

const SHAPE_PREVIEW: Record<Shape, PreviewComponent> = {
  RECTANGLE: RectanglePreview,
  SQUARE: SquarePreview,
  L: LShapePreview,
  FREEHAND: FreehandPreview,
};

/**
 * Step "Forma" + "Dimensioni" of "Costruisci la sala" — a compact config
 * panel on the left, a live preview on the right, in the same slot the
 * editor's canvas will occupy in step 3 (brief §5/§15/§31). Controlled by the
 * parent (RoomBuilderOverlay) so choices survive the wizard being
 * unmounted/remounted (e.g. "Modifica forma e dimensioni" from step 3).
 * Freehand skips dimensions entirely and jumps straight into manual wall
 * drawing, same as before.
 */
export function ShapeWizard({
  value,
  onChange,
  onComplete,
}: {
  value: WizardFormState;
  onChange: (next: WizardFormState) => void;
  onComplete: (result: { elements: WallElement[]; startTool: "idle" | "drawing-wall" }) => void;
}) {
  const [hoveredShape, setHoveredShape] = useState<Shape | null>(null);

  if (!value.shapeConfirmed) {
    const displayedShape = hoveredShape ?? value.shape;
    return (
      <WizardWorkspace
        panel={
          <div className="flex h-full flex-col gap-5">
            <div>
              <h2 className="text-display text-lg font-semibold">Che forma ha la sala?</h2>
              <p className="mt-1 text-xs text-muted-foreground">Scegli quella più simile. Potrai modificarla liberamente dopo.</p>
            </div>
            <div className="flex flex-col gap-2">
              {SHAPE_ROWS.map((row) => (
                <ShapeRow
                  key={row.value}
                  preview={row.preview}
                  label={row.label}
                  description={row.description}
                  selected={value.shape === row.value}
                  onClick={() => onChange({ ...value, shape: row.value })}
                  onHoverChange={(hovering) =>
                    setHoveredShape((cur) => (hovering ? row.value : cur === row.value ? null : cur))
                  }
                />
              ))}
            </div>
            <Button
              type="button"
              variant="accent"
              className="mt-auto w-full"
              disabled={!value.shape}
              onClick={() => {
                if (!value.shape) return;
                if (value.shape === "FREEHAND") onComplete({ elements: [], startTool: "drawing-wall" });
                else onChange({ ...value, shapeConfirmed: true });
              }}
            >
              Continua <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        }
        preview={<ShapeBigPreview shape={displayedShape} />}
      />
    );
  }

  // Freehand never sets shapeConfirmed (its row's Continua calls onComplete
  // directly) — this is just a defensive narrowing guard for the type checker.
  if (value.shape === "FREEHAND" || !value.shape) return null;

  const shape = value.shape;
  const width = Number(value.width) || 1;
  const depth = shape === "SQUARE" ? width : Number(value.depth) || 1;
  const notchWidth = Number(value.notchWidth) || 0;
  const notchDepth = Number(value.notchDepth) || 0;
  const area = computeAreaM2(shape, width, depth, notchWidth, notchDepth);

  function set(patch: Partial<WizardFormState>) {
    onChange({ ...value, ...patch });
  }

  function generate() {
    const w = Number(value.width) || 1;
    const d = shape === "SQUARE" ? w : Number(value.depth) || 1;
    const elements =
      shape === "L" ? generateLShape(w, d, Number(value.notchWidth) || 1, Number(value.notchDepth) || 1) : generateRectangle(w, d);
    onComplete({ elements, startTool: "idle" });
  }

  return (
    <WizardWorkspace
      panel={
        <div className="flex h-full flex-col gap-5">
          <div>
            <h2 className="text-display text-lg font-semibold">Dimensioni</h2>
            <p className="mt-1 text-xs text-muted-foreground">Definisci le misure principali della sala.</p>
          </div>
          <div className="flex flex-col gap-4">
            <DimensionField label="Larghezza" value={value.width} onChange={(v) => set({ width: v })} />
            {shape !== "SQUARE" && <DimensionField label="Profondità" value={value.depth} onChange={(v) => set({ depth: v })} />}
            {shape === "L" && (
              <>
                <DimensionField label="Larghezza rientranza" value={value.notchWidth} onChange={(v) => set({ notchWidth: v })} compact />
                <DimensionField label="Profondità rientranza" value={value.notchDepth} onChange={(v) => set({ notchDepth: v })} compact />
              </>
            )}
            {area !== null && (
              <div className="rounded-md border border-border bg-card/60 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Superficie indicativa</p>
                <p className="text-sm font-semibold text-card-foreground">{area.toFixed(1).replace(".", ",")} m²</p>
              </div>
            )}
          </div>
          <div className="mt-auto flex items-center gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1 whitespace-nowrap" onClick={() => set({ shapeConfirmed: false })}>
              <ArrowLeft className="h-4 w-4" /> Indietro
            </Button>
            <Button type="button" variant="accent" className="flex-1 whitespace-nowrap" onClick={generate}>
              Continua <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      }
      preview={<DimensionPreview shape={shape} width={width} depth={depth} notchWidth={notchWidth} notchDepth={notchDepth} />}
    />
  );
}

/** Shared shell for Forma/Dimensioni — a fixed-width dark config panel next
 * to a cream preview, in the exact slot the editor's rail+panel / canvas
 * occupy in step 3, so the three steps read as one workspace (brief §31). */
function WizardWorkspace({ panel, preview }: { panel: React.ReactNode; preview: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 w-full gap-3 p-3">
      <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground">
        {panel}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-[#F4EFE4]">
        {preview}
      </div>
    </div>
  );
}

function ShapeRow({
  preview: Preview,
  label,
  description,
  selected,
  onClick,
  onHoverChange,
}: {
  preview: PreviewComponent;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  onHoverChange: (hovering: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      aria-pressed={selected}
      className={cn(
        "group flex items-center gap-3 rounded-md border px-3 py-2.5 text-left text-card-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-accent-strong bg-accent-strong/10"
          : "border-border bg-card/60 hover:-translate-y-px hover:border-accent-strong hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
          selected ? "border-accent-strong text-accent-strong" : "border-border text-accent-strong/80 group-hover:text-accent-strong",
        )}
      >
        <Preview className="h-4 w-6" />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
      {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-accent-strong" aria-hidden />}
    </button>
  );
}

function ShapeBigPreview({ shape }: { shape: Shape | null }) {
  if (!shape) {
    return <p className="px-6 text-center text-sm text-muted-foreground">Seleziona una forma per vedere l&apos;anteprima.</p>;
  }
  const Preview = SHAPE_PREVIEW[shape];
  return (
    <div className="flex flex-col items-center gap-3">
      <Preview className="h-40 w-60 text-surface-brown-light transition-all duration-200" />
      {shape === "FREEHAND" && (
        <p className="max-w-[220px] text-center text-xs text-muted-foreground">Disegna manualmente il perimetro nell&apos;editor.</p>
      )}
    </div>
  );
}

function slug(label: string) {
  return `dim-${label.toLowerCase().replace(/\s+/g, "-")}`;
}

function DimensionField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  const min = compact ? 0.5 : 1;
  const max = compact ? 20 : 60;
  const step = 0.5;
  const current = Number(value) || 0;
  const id = slug(label);

  function clamp(n: number) {
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(String(clamp(current - step)))}
          aria-label={`Diminuisci ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div className="relative flex-1">
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-full pr-8 text-center"
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">m</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange(String(clamp(current + step)))}
          aria-label={`Aumenta ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatM(value: number) {
  return `${value.toFixed(1).replace(".", ",")} m`;
}

/** Brief §22: only computed where the geometry makes it unambiguous — a
 * straight width×depth for rectangle/square, and for the L the exact same
 * "outer box minus the notch" shape generateLShape itself builds, so this
 * mirrors real geometry rather than guessing at one. */
function computeAreaM2(shape: Exclude<Shape, "FREEHAND">, width: number, depth: number, notchWidth: number, notchDepth: number) {
  if (shape !== "L") return width * depth;
  const nw = Math.min(Math.max(notchWidth, 0), width);
  const nd = Math.min(Math.max(notchDepth, 0), depth);
  return Math.max(0, width * depth - nw * nd);
}

/** Simplified live preview — proportional to width/depth, not a canvas
 * replica. Drawn as a wall outline (not a filled block) using the same
 * stroke tone real walls render with in the editor, so this reads as "what
 * your walls will look like" rather than a generic diagram. The aspect ratio
 * is clamped purely for legibility so an extreme 20×5 room doesn't collapse
 * into an unreadable sliver. */
function DimensionPreview({
  shape,
  width,
  depth,
  notchWidth,
  notchDepth,
}: {
  shape: Exclude<Shape, "FREEHAND">;
  width: number;
  depth: number;
  notchWidth: number;
  notchDepth: number;
}) {
  const w = Math.max(width, 0.1);
  const d = Math.max(depth, 0.1);
  const rawRatio = w / d;
  const ratio = Math.min(2.6, Math.max(0.4, rawRatio));
  const MAX_W = 340;
  const MAX_H = 240;
  const fitsWidth = ratio >= MAX_W / MAX_H;
  const boxW = fitsWidth ? MAX_W : MAX_H * ratio;
  const boxH = fitsWidth ? MAX_W / ratio : MAX_H;

  const nwRatio = shape === "L" ? Math.min(0.7, Math.max(0.15, notchWidth / w || 0.3)) : 0;
  const ndRatio = shape === "L" ? Math.min(0.7, Math.max(0.15, notchDepth / d || 0.3)) : 0;
  const nw = boxW * nwRatio;
  const nd = boxH * ndRatio;

  const path =
    shape === "L" ? `M2 2 H${boxW - nw} V${2 + nd} H${boxW - 2} V${boxH - 2} H2 Z` : `M2 2 H${boxW - 2} V${boxH - 2} H2 Z`;

  return (
    <div className="flex flex-col items-center gap-3">
      <span className="text-xs font-medium text-surface-brown">{formatM(w)}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-surface-brown">{formatM(d)}</span>
        <svg width={boxW} height={boxH} viewBox={`0 0 ${boxW} ${boxH}`} className="shrink-0 transition-all duration-200" aria-hidden>
          <path d={path} fill="none" stroke="#3a3b42" strokeWidth={5} strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

function RectanglePreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 40" className={className} fill="none" aria-hidden>
      <rect x="4" y="8" width="48" height="24" rx="3" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function SquarePreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 40" className={className} fill="none" aria-hidden>
      <rect x="14" y="4" width="28" height="28" rx="3" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function LShapePreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 40" className={className} fill="none" aria-hidden>
      <path d="M6 6 H36 V18 H50 V34 H6 Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

function FreehandPreview({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 40" className={className} fill="none" aria-hidden>
      <path
        d="M8 28 C6 18 14 8 24 10 C34 12 30 20 38 18 C46 16 50 24 46 30 C40 36 14 34 8 28 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
