"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Block } from "@/lib/campaign-blocks";
import { useWizardDispatch, useWizardState } from "../wizard-context";
import { BlockCanvas } from "./block-canvas";
import { BlockInspector } from "./block-inspector";
import { VariablesPanel } from "./variables-panel";
import { ADDABLE_BLOCK_LABELS, createDefaultBlock, type AddableBlockType } from "./block-factory";

export function Step4Editor() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [selectedId, setSelectedId] = useState<string | null>(state.contentBlocks[0]?.id ?? null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const blocks = state.contentBlocks;
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;
  const canInsertVariable = !!selectedBlock && !!focusedField && selectedBlock.type !== "two_columns";

  function setBlocks(next: Block[]) {
    dispatch({ type: "SET_BLOCKS", blocks: next });
  }

  function updateBlock(updated: Block) {
    setBlocks(blocks.map((b) => (b.id === updated.id ? updated : b)));
  }

  function deleteBlock(id: string) {
    setBlocks(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function addBlock(type: AddableBlockType) {
    const newBlock = createDefaultBlock(type);
    const withoutUnsub = blocks.filter((b) => b.type !== "unsubscribe_link");
    const unsub = blocks.filter((b) => b.type === "unsubscribe_link");
    setBlocks([...withoutUnsub, newBlock, ...unsub]);
    setSelectedId(newBlock.id);
  }

  function insertVariable(token: string) {
    if (!selectedBlock || !focusedField) return;
    const current = (selectedBlock as unknown as Record<string, unknown>)[focusedField];
    if (typeof current !== "string") return;
    updateBlock({ ...selectedBlock, [focusedField]: current + token } as Block);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-display text-lg">Componi l&apos;email</h2>
        <p className="text-sm text-muted-foreground">
          Aggiungi e riordina i blocchi trascinandoli. Nessun HTML da scrivere.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Aggiungi blocco:</span>
        <Select onValueChange={(v) => addBlock(v as AddableBlockType)}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue placeholder="Scegli un blocco" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ADDABLE_BLOCK_LABELS) as AddableBlockType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {ADDABLE_BLOCK_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <BlockCanvas
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={setBlocks}
          onDelete={deleteBlock}
        />
        <div className="space-y-6 rounded-md border border-border p-4">
          <BlockInspector block={selectedBlock} onChange={updateBlock} onFieldFocus={setFocusedField} />
          <div className="border-t border-border pt-4">
            <VariablesPanel onInsert={insertVariable} disabled={!canInsertVariable} />
          </div>
        </div>
      </div>
    </div>
  );
}
