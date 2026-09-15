"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { LIBRARY_ITEMS, STRUCTURE_ITEMS, type LibraryItem, type StructureItem } from "./block-library";

function DraggableTile({ item, onClick }: { item: LibraryItem; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `new:${item.id}`,
    data: { kind: "new", itemId: item.id },
  });
  const Icon = item.icon;
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={cn(
        "flex h-[74px] cursor-grab flex-col items-center justify-center gap-1.5 rounded-md border text-[13px] transition-colors active:cursor-grabbing",
        item.group === "ristorante"
          ? "border-accent/55 bg-accent/10 hover:bg-accent/20"
          : "border-border bg-secondary/40 hover:bg-secondary/70",
        isDragging && "opacity-40"
      )}
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      {item.label}
    </button>
  );
}

function RowIcon({ weights }: { weights: number[] }) {
  return (
    <div className="flex h-6 w-14 overflow-hidden rounded-[3px] border border-muted-foreground/70">
      {weights.map((w, i) => (
        <div
          key={i}
          style={{ flexGrow: w }}
          className={cn("h-full", i < weights.length - 1 && "border-r border-muted-foreground/70")}
        />
      ))}
    </div>
  );
}

function DraggableRow({ item, onClick }: { item: StructureItem; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `row:${item.ratio}`,
    data: { kind: "row", ratio: item.ratio },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={cn(
        "flex h-[46px] w-full cursor-grab items-center gap-2.5 rounded-md border border-border bg-secondary/40 px-2.5 text-sm hover:bg-secondary/70 active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <RowIcon weights={item.weights} />
      {item.label}
    </button>
  );
}

export function LibraryPanel({
  onAddBlock,
  onAddRow,
}: {
  onAddBlock: (itemId: string) => void;
  onAddRow: (ratio: StructureItem["ratio"]) => void;
}) {
  const [tab, setTab] = useState<"contenuti" | "struttura">("contenuti");
  const base = LIBRARY_ITEMS.filter((i) => i.group === "base");
  const restaurant = LIBRARY_ITEMS.filter((i) => i.group === "ristorante");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 p-3 pb-2">
        {(["contenuti", "struttura"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm capitalize transition-colors",
              tab === t ? "bg-cream font-medium text-clay-ink" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="fill-scroll space-y-5 px-3 pb-4">
        {tab === "contenuti" ? (
          <>
            <section className="space-y-2">
              <p className="t-etichetta">Base</p>
              <div className="grid grid-cols-3 gap-2">
                {base.map((item) => (
                  <DraggableTile key={item.id} item={item} onClick={() => onAddBlock(item.id)} />
                ))}
              </div>
            </section>
            <section className="space-y-2">
              <p className="t-etichetta">Ristorante</p>
              <div className="grid grid-cols-3 gap-2">
                {restaurant.map((item) => (
                  <DraggableTile key={item.id} item={item} onClick={() => onAddBlock(item.id)} />
                ))}
              </div>
              <p className="t-nota leading-relaxed">
                Questi blocchi arrivano già compilati con i dati del locale.
              </p>
            </section>
          </>
        ) : (
          <section className="space-y-2">
            <p className="t-etichetta">Righe</p>
            <div className="space-y-2">
              {STRUCTURE_ITEMS.map((item) => (
                <DraggableRow key={item.ratio} item={item} onClick={() => onAddRow(item.ratio)} />
              ))}
            </div>
            <p className="t-nota leading-relaxed">
              Aggiungi una riga, poi trascina i contenuti dentro le sue colonne.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
