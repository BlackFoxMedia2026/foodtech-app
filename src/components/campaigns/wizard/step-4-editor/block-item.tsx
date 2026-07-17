"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/campaign-blocks";
import { ADDABLE_BLOCK_LABELS, type AddableBlockType } from "./block-factory";

function blockSummary(block: Block): string {
  switch (block.type) {
    case "title":
      return block.text;
    case "text":
      return block.text.slice(0, 60);
    case "button_cta":
      return block.label;
    case "offer_box":
      return block.title;
    case "footer":
      return block.text;
    case "logo":
    case "hero_image":
    case "image":
      if (!block.imageUrl) return "(nessuna immagine impostata)";
      // Un URL data: (es. i placeholder generati per i template, o un file
      // appena caricato) è lunghissimo e illeggibile se mostrato per intero.
      return block.imageUrl.startsWith("data:") ? "Immagine impostata" : block.imageUrl;
    default:
      return "";
  }
}

export function BlockItem({
  block,
  selected,
  onSelect,
  onDelete,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = ADDABLE_BLOCK_LABELS[block.type as AddableBlockType] ?? "Blocco";

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-2 rounded-md border p-3 text-sm",
        selected ? "border-accent bg-accent/10" : "border-border hover:bg-secondary",
      )}
    >
      <button type="button" {...attributes} {...listeners} className="cursor-grab text-muted-foreground" aria-label="Trascina per riordinare">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{blockSummary(block)}</p>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
