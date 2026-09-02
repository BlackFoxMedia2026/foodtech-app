"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TableShape } from "@prisma/client";
import type { RoomBuilder } from "./use-room-builder";

const SHAPE_OPTIONS: { value: TableShape; label: string }[] = [
  { value: "ROUND", label: "Rotondo" },
  { value: "SQUARE", label: "Quadrato" },
  { value: "RECT", label: "Rettangolare" },
];

/**
 * "Tavoli non posizionati" — every Table row for this room that isn't yet
 * referenced by a TABLE element in the layout. Dragging one onto the canvas
 * places the *same* table (brief §19): no copy is ever created here.
 */
export function UnplacedTablesPanel({ builder }: { builder: RoomBuilder }) {
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState("2");
  const [shape, setShape] = useState<TableShape>("ROUND");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    const table = await builder.createUnplacedTable({ label: label.trim(), seats: Number(seats) || 2, shape });
    setBusy(false);
    if (table) {
      setCreating(false);
      setLabel("");
      setSeats("2");
      setShape("ROUND");
    }
  }

  return (
    <div className="flex h-full flex-col gap-2 border-t border-border p-3 text-sm">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tavoli non posizionati</h3>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCreating((v) => !v)} aria-label="Nuovo tavolo">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {creating && (
        <form onSubmit={submit} className="flex flex-col gap-1.5 rounded-md border border-border bg-secondary/40 p-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome (es. T20)" className="h-7 text-xs" autoFocus />
          <div className="flex gap-1.5">
            <Input value={seats} onChange={(e) => setSeats(e.target.value)} placeholder="Posti" inputMode="numeric" className="h-7 w-16 text-xs" />
            <select
              value={shape}
              onChange={(e) => setShape(e.target.value as TableShape)}
              className="h-7 flex-1 rounded-md border border-input bg-background px-1.5 text-xs"
            >
              {SHAPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" variant="accent" disabled={busy || !label.trim()} className="mt-0.5 h-7 text-xs">
            {busy ? "Creo…" : "Crea tavolo"}
          </Button>
        </form>
      )}

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {builder.unplacedTables.length === 0 && !creating && (
          <p className="px-1 py-2 text-xs text-muted-foreground">Tutti i tavoli sono posizionati sulla piantina.</p>
        )}
        {builder.unplacedTables.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-table-id", t.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex cursor-grab items-center justify-between rounded-md border border-border bg-card px-2 py-1.5 text-xs shadow-sm active:cursor-grabbing"
          >
            <span className="font-medium">{t.label}</span>
            <span className="text-muted-foreground">{t.seats} posti</span>
          </div>
        ))}
      </div>
    </div>
  );
}
