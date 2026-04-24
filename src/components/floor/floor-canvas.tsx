"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Table } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Save, Lock } from "lucide-react";

type Local = Table & { dirty?: boolean };

export function FloorCanvas({ initialTables, width = 1200, height = 760 }: {
  initialTables: Table[];
  width?: number;
  height?: number;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [tables, setTables] = useState<Local[]>(initialTables);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onDrag(id: string, e: React.MouseEvent) {
    const card = ref.current?.getBoundingClientRect();
    if (!card) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const t = tables.find((x) => x.id === id);
    if (!t) return;
    const baseX = t.posX;
    const baseY = t.posY;

    function move(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setTables((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                posX: Math.max(0, Math.min(width - 80, baseX + dx)),
                posY: Math.max(0, Math.min(height - 80, baseY + dy)),
                dirty: true,
              }
            : p,
        ),
      );
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  async function persist() {
    const dirty = tables.filter((t) => t.dirty);
    if (dirty.length === 0) return;
    setSaving(true);
    await Promise.all(
      dirty.map((t) =>
        fetch(`/api/tables/${t.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ posX: t.posX, posY: t.posY, rotation: t.rotation, seats: t.seats, label: t.label }),
        }),
      ),
    );
    setTables((prev) => prev.map((t) => ({ ...t, dirty: false })));
    setSaving(false);
    router.refresh();
  }

  async function addTable() {
    const label = prompt("Etichetta nuovo tavolo (es. T20)") ?? "";
    if (!label) return;
    const seats = Number(prompt("Posti", "2") ?? 2);
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, seats, posX: 80, posY: 80 }),
    });
    if (res.ok) {
      const t = await res.json();
      setTables((prev) => [...prev, t]);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Trascina i tavoli per riorganizzare la sala. Clicca per selezionare.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="subtle" size="sm" onClick={addTable}>
            <Plus className="h-4 w-4" /> Nuovo tavolo
          </Button>
          <Button variant="gold" size="sm" onClick={persist} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Salvataggio…" : "Salva sala"}
          </Button>
        </div>
      </div>

      <div
        ref={ref}
        className="relative overflow-hidden rounded-xl border-2 border-dashed border-border bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] [background-size:20px_20px]"
        style={{ height }}
      >
        {tables.map((t) => {
          const isSelected = selectedId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => onDrag(t.id, e)}
              onClick={() => setSelectedId(t.id)}
              className={cn(
                "absolute grid place-items-center select-none transition-shadow",
                t.shape === "ROUND" && "rounded-full",
                t.shape === "SQUARE" && "rounded-md",
                t.shape === "RECT" && "rounded-md",
                t.shape === "BOOTH" && "rounded-2xl",
                t.shape === "LOUNGE" && "rounded-3xl",
                t.active ? "bg-carbon-800 text-sand-50" : "bg-muted text-muted-foreground",
                isSelected && "ring-4 ring-gilt/60",
                "shadow-lg hover:shadow-xl cursor-grab active:cursor-grabbing",
              )}
              style={{
                left: t.posX,
                top: t.posY,
                width: t.shape === "RECT" ? 120 : t.shape === "BOOTH" ? 160 : t.shape === "LOUNGE" ? 140 : 80,
                height: t.shape === "RECT" ? 70 : t.shape === "BOOTH" ? 90 : t.shape === "LOUNGE" ? 100 : 80,
                transform: `rotate(${t.rotation}deg)`,
              }}
            >
              <span className="text-display text-sm font-semibold">{t.label}</span>
              <span className="text-[10px] opacity-70">{t.seats} posti</span>
              {!t.active && <Lock className="absolute right-1 top-1 h-3 w-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
