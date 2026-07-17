"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { Block } from "@/lib/campaign-blocks";
import { BlockItem } from "./block-item";

export function BlockCanvas({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (blocks: Block[]) => void;
  onDelete: (id: string) => void;
}) {
  const draggable = blocks.filter((b) => b.type !== "unsubscribe_link");
  const fixed = blocks.filter((b) => b.type === "unsubscribe_link");

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = draggable.findIndex((b) => b.id === active.id);
    const newIndex = draggable.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder([...arrayMove(draggable, oldIndex, newIndex), ...fixed]);
  }

  return (
    <div className="space-y-2">
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draggable.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {draggable.map((block) => (
              <BlockItem
                key={block.id}
                block={block}
                selected={block.id === selectedId}
                onSelect={() => onSelect(block.id)}
                onDelete={() => onDelete(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {draggable.length === 0 && (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Aggiungi un blocco per iniziare a comporre l&apos;email.
        </p>
      )}
      {fixed.map((block) => (
        <div key={block.id} className="rounded-md border border-border bg-secondary/50 p-3 text-sm">
          <p className="font-medium">Link di disiscrizione</p>
          <p className="text-xs text-muted-foreground">Obbligatorio, sempre presente in fondo all&apos;email — non eliminabile.</p>
        </div>
      ))}
    </div>
  );
}
