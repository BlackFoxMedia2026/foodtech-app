"use client";

import { useState } from "react";
import { PenLine, RectangleHorizontal, Square, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WallElement } from "@/lib/room-layout";
import { generateLShape, generateRectangle } from "./perimeter-generator";

type Shape = "RECTANGLE" | "SQUARE" | "L" | "FREEHAND";

/**
 * "Da dove vuoi partire?" — the guided entry point into a brand new Room
 * Builder layout (brief §5-7, §37). Deliberately just two questions (shape,
 * then size) so a manager gets a usable perimeter in under a minute; the
 * room's name is already set from the existing Sala rename flow, so this
 * doesn't repeat it.
 */
export function ShapeWizard({
  onComplete,
}: {
  onComplete: (result: { elements: WallElement[]; startTool: "idle" | "drawing-wall" }) => void;
}) {
  const [shape, setShape] = useState<Shape | null>(null);
  const [width, setWidth] = useState("12");
  const [depth, setDepth] = useState("8");
  const [notchWidth, setNotchWidth] = useState("4");
  const [notchDepth, setNotchDepth] = useState("3");

  if (!shape) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-8 text-center">
        <h2 className="text-display text-xl font-semibold">Che forma ha la sala?</h2>
        <p className="text-sm text-muted-foreground">Scegli il punto di partenza più vicino alla tua sala: potrai sistemare ogni dettaglio dopo.</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <ShapeCard icon={RectangleHorizontal} label="Rettangolare" onClick={() => setShape("RECTANGLE")} />
          <ShapeCard icon={Square} label="Quadrata" onClick={() => setShape("SQUARE")} />
          <ShapeCard icon={Waypoints} label="A L" onClick={() => setShape("L")} />
          <ShapeCard icon={PenLine} label="Disegno libero" onClick={() => onComplete({ elements: [], startTool: "drawing-wall" })} />
        </div>
      </div>
    );
  }

  function generate() {
    const w = Number(width) || 1;
    const d = Number(depth) || 1;
    const elements: WallElement[] =
      shape === "L" ? generateLShape(w, d, Number(notchWidth) || 1, Number(notchDepth) || 1) : generateRectangle(w, shape === "SQUARE" ? w : d);
    onComplete({ elements, startTool: "idle" });
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h2 className="text-display text-xl font-semibold">Dimensioni della sala</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Larghezza (m)</span>
        <Input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal" />
      </label>
      {shape !== "SQUARE" && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Profondità (m)</span>
          <Input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" />
        </label>
      )}
      {shape === "L" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Larghezza rientranza (m)</span>
            <Input value={notchWidth} onChange={(e) => setNotchWidth(e.target.value)} inputMode="decimal" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Profondità rientranza (m)</span>
            <Input value={notchDepth} onChange={(e) => setNotchDepth(e.target.value)} inputMode="decimal" />
          </label>
        </>
      )}
      <div className="mt-2 flex justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setShape(null)}>
          Indietro
        </Button>
        <Button type="button" variant="accent" onClick={generate}>
          Genera piantina
        </Button>
      </div>
    </div>
  );
}

function ShapeCard({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 transition-colors hover:border-accent-strong hover:bg-accent-strong/10"
    >
      <Icon className="h-6 w-6 text-accent-strong" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
