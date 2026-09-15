"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Copy, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { COLUMN_RATIO_WEIGHTS, type Block, type EmailSettings } from "@/lib/campaign-blocks";
import type { DropTarget } from "@/lib/campaign-document-ops";
import { cn } from "@/lib/utils";
import { BlockView } from "./block-view";
import { STRUCTURE_ITEMS } from "./block-library";

/* ------------------------------------------------------------------ *
 * Le zone di rilascio
 * ------------------------------------------------------------------ */

function targetId(target: DropTarget): string {
  return target.kind === "root"
    ? `drop:root:${target.index}`
    : `drop:col:${target.rowId}:${target.col}:${target.index}`;
}

/**
 * Lo spazio fra due blocchi.
 *
 * Fuori dal trascinamento è alto due pixel e non si vede; durante un
 * trascinamento diventa un bersaglio da dodici e, quando è quello attivo,
 * disegna la riga color terracotta che dice *qui*. È l'affordance che nel
 * vecchio editor mancava del tutto: si trascinava al buio.
 */
function DropGap({ target, dragging }: { target: DropTarget; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: targetId(target), data: { target } });
  return (
    <div
      ref={setNodeRef}
      className={cn("relative transition-all", dragging ? "h-3" : "h-0.5")}
      aria-hidden
    >
      {isOver && (
        <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_3px_rgba(176,122,69,0.25)]" />
      )}
    </div>
  );
}

/** Il rilascio dentro una colonna vuota: senza, una colonna nuova sarebbe irraggiungibile. */
function EmptyColumnDrop({ target, dragging }: { target: DropTarget; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: targetId(target), data: { target } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-20 items-center justify-center rounded border-2 border-dashed text-[12px] transition-colors",
        isOver ? "border-[#b07a45] bg-[#b07a45]/10 text-[#74432d]" : "border-[#e0d6c5] text-[#b3a68f]",
        !dragging && "border-[#ebe3d6]"
      )}
    >
      Trascina qui
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Il blocco con i suoi comandi
 * ------------------------------------------------------------------ */

function BlockChrome({
  block,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  children,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const locked = block.type === "unsubscribe_link";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    data: { kind: "move", blockId: block.id },
    disabled: locked,
  });

  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      onMouseDown={onSelect}
      className={cn(
        "group relative",
        isDragging && "opacity-30",
        selected
          ? "outline outline-[1.5px] outline-offset-[-1px] outline-[#b07a45]"
          : "outline outline-[1.5px] outline-offset-[-1px] outline-transparent hover:outline-[#b07a45]/40"
      )}
    >
      {/* I comandi compaiono al passaggio o quando il blocco è selezionato:
          lasciarli sempre visibili renderebbe il foglio una tavolozza di
          pulsanti invece di un'anteprima dell'email. */}
      <div
        className={cn(
          "absolute -top-[30px] right-0 z-20 flex items-center gap-0.5 rounded-md border border-border-strong bg-card p-0.5 shadow-lg transition-opacity",
          selected ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        )}
      >
        {locked ? (
          <span className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-accent-strong">
            <Lock className="h-3 w-3" /> Obbligatorio
          </span>
        ) : (
          <>
            <button
              type="button"
              aria-label="Trascina per spostare"
              className="flex h-6 w-6 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
              {...listeners}
              {...attributes}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Duplica"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Elimina"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-destructive-soft"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Il foglio
 * ------------------------------------------------------------------ */

export interface CanvasProps {
  blocks: Block[];
  settings: EmailSettings;
  accent: string;
  selectedId: string | null;
  dragging: boolean;
  width: number;
  onSelect: (id: string | null) => void;
  onChangeBlock: (id: string, patch: Partial<Block>, coalesceKey?: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRequestMedia: (id: string) => void;
  onTextFocus: (id: string) => void;
  onTextBlur: () => void;
  onAddFirst: () => void;
  onAddRow: (ratio: (typeof STRUCTURE_ITEMS)[number]["ratio"]) => void;
}

export function Canvas(props: CanvasProps) {
  const { blocks, settings, accent, selectedId, dragging, width } = props;
  const hasContent = blocks.some((b) => b.type !== "unsubscribe_link");

  function renderBlock(block: Block) {
    const common = {
      settings,
      accent,
      onRequestMedia: () => props.onRequestMedia(block.id),
      onTextFocus: props.onTextFocus,
      onTextBlur: props.onTextBlur,
    };

    if (block.type === "columns") {
      const weights = COLUMN_RATIO_WEIGHTS[block.ratio] ?? [50, 50];
      return (
        <div style={{ padding: "8px 24px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {block.columns.map((column, col) => (
              <div key={col} style={{ width: `${weights[col]}%` }}>
                {column.length === 0 ? (
                  <EmptyColumnDrop
                    target={{ kind: "column", rowId: block.id, col, index: 0 }}
                    dragging={dragging}
                  />
                ) : (
                  <>
                    <DropGap target={{ kind: "column", rowId: block.id, col, index: 0 }} dragging={dragging} />
                    {column.map((child, i) => (
                      <div key={child.id}>
                        <BlockChrome
                          block={child}
                          selected={selectedId === child.id}
                          onSelect={() => props.onSelect(child.id)}
                          onDuplicate={() => props.onDuplicate(child.id)}
                          onDelete={() => props.onDelete(child.id)}
                        >
                          <BlockView
                            block={child}
                            {...common}
                            onRequestMedia={() => props.onRequestMedia(child.id)}
                            onChange={(patch, key) => props.onChangeBlock(child.id, patch, key)}
                          />
                        </BlockChrome>
                        <DropGap
                          target={{ kind: "column", rowId: block.id, col, index: i + 1 }}
                          dragging={dragging}
                        />
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <BlockView
        block={block}
        {...common}
        onChange={(patch, key) => props.onChangeBlock(block.id, patch, key)}
      />
    );
  }

  return (
    <div
      className="mx-auto shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
      style={{ width, backgroundColor: settings.emailBackground, fontFamily: settings.fontFamily }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onSelect(null);
      }}
    >
      {!hasContent && (
        <div className="px-9 py-11 text-center">
          <p className="text-[23px] text-[#1a1a1a]" style={{ fontFamily: settings.fontFamily }}>
            Inizia la tua email
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#6b6b6b]">
            Trascina un elemento dalla colonna di sinistra, oppure
          </p>
          <button
            type="button"
            onClick={props.onAddFirst}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-full px-5 text-[15px] font-medium text-white"
            style={{ background: accent }}
          >
            <Plus className="h-4 w-4" /> Aggiungi contenuto
          </button>
          <div className="mt-7 border-t border-[#ede5d8] pt-5">
            <p className="text-[13px] text-[#8a8a8a]">Puoi iniziare anche da una struttura</p>
            <div className="mt-3 flex justify-center gap-2.5">
              {STRUCTURE_ITEMS.map((item) => (
                <button
                  key={item.ratio}
                  type="button"
                  onClick={() => props.onAddRow(item.ratio)}
                  title={item.label}
                  className="flex h-11 w-16 overflow-hidden rounded border-[1.5px] border-[#d9cebc] transition-colors hover:border-[#b07a45]"
                >
                  {item.weights.map((w, i) => (
                    <span
                      key={i}
                      style={{ flexGrow: w }}
                      className={cn("h-full", i < item.weights.length - 1 && "border-r-[1.5px] border-[#d9cebc]")}
                    />
                  ))}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <DropGap target={{ kind: "root", index: 0 }} dragging={dragging} />
      {blocks.map((block, index) => (
        <div key={block.id}>
          <BlockChrome
            block={block}
            selected={selectedId === block.id}
            onSelect={() => props.onSelect(block.id)}
            onDuplicate={() => props.onDuplicate(block.id)}
            onDelete={() => props.onDelete(block.id)}
          >
            {renderBlock(block)}
          </BlockChrome>
          <DropGap target={{ kind: "root", index: index + 1 }} dragging={dragging} />
        </div>
      ))}
    </div>
  );
}
