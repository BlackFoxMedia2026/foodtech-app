import {
  COLUMN_RATIO_WEIGHTS,
  type Block,
  type ColumnChildBlock,
  type ColumnRatio,
  type EmailDocument,
} from "./campaign-blocks";

/**
 * Dove finisce un blocco quando lo si lascia cadere.
 *
 * Due soli casi, e non è una semplificazione provvisoria: le colonne non si
 * annidano dentro altre colonne. Una riga a colonne dentro una colonna è una
 * cosa che nessun ristoratore chiede e che i client email rendono in modo
 * imprevedibile — quindi la struttura dati non la ammette e l'interfaccia non
 * deve difendersene.
 */
export type DropTarget =
  | { kind: "root"; index: number }
  | { kind: "column"; rowId: string; col: number; index: number };

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `b-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Una copia dei blocchi con identità nuova, **fino in fondo**.
 *
 * Serve ogni volta che un documento esistente diventa il punto di partenza di
 * un altro: un modello scelto nella libreria, o una newsletter già inviata
 * ripresa come base. La versione precedente rinfrescava solo gli id di primo
 * livello: i figli dentro le colonne conservavano quelli originali, e due
 * righe a colonne copiate dallo stesso modello finivano per contenere blocchi
 * con lo stesso id — l'editor allora seleziona e modifica il blocco sbagliato.
 *
 * È una copia: l'originale non viene toccato in nessun caso.
 */
export function cloneBlocksWithNewIds(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.type === "columns") {
      return {
        ...b,
        id: newId(),
        columns: b.columns.map((column) => column.map((child) => ({ ...child, id: newId() }))),
      };
    }
    if (b.type === "two_columns") {
      return {
        ...b,
        id: newId(),
        left: b.left.map((child) => ({ ...child, id: newId() })),
        right: b.right.map((child) => ({ ...child, id: newId() })),
      };
    }
    return { ...b, id: newId() };
  });
}

/** Il blocco obbligatorio sta in fondo: nessun inserimento può finirgli sotto. */
function lastInsertableIndex(blocks: Block[]): number {
  const unsubIndex = blocks.findIndex((b) => b.type === "unsubscribe_link");
  return unsubIndex === -1 ? blocks.length : unsubIndex;
}

export function clampRootIndex(doc: EmailDocument, index: number): number {
  return Math.max(0, Math.min(index, lastInsertableIndex(doc.blocks)));
}

export function findBlock(doc: EmailDocument, id: string): Block | null {
  for (const block of doc.blocks) {
    if (block.id === id) return block;
    if (block.type === "columns") {
      for (const column of block.columns) {
        const hit = column.find((c) => c.id === id);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/** Il blocco riga che contiene un figlio, se quel figlio sta dentro una colonna. */
export function findParentRow(doc: EmailDocument, id: string): { rowId: string; col: number; index: number } | null {
  for (const block of doc.blocks) {
    if (block.type !== "columns") continue;
    for (let col = 0; col < block.columns.length; col++) {
      const index = block.columns[col].findIndex((c) => c.id === id);
      if (index !== -1) return { rowId: block.id, col, index };
    }
  }
  return null;
}

/** I tipi che possono stare dentro una colonna: gli altri vengono rifiutati all'inserimento. */
const COLUMN_CHILD_TYPES: ReadonlySet<Block["type"]> = new Set([
  "text",
  "image",
  "button_cta",
  "title",
  "divider",
  "spacer",
]);

export function canDropInColumn(block: Block): block is ColumnChildBlock {
  return COLUMN_CHILD_TYPES.has(block.type);
}

function mapBlocks(doc: EmailDocument, fn: (blocks: Block[]) => Block[]): EmailDocument {
  return { ...doc, blocks: fn(doc.blocks) };
}

export function insertBlock(doc: EmailDocument, block: Block, target: DropTarget): EmailDocument {
  if (target.kind === "root") {
    const index = clampRootIndex(doc, target.index);
    return mapBlocks(doc, (blocks) => [...blocks.slice(0, index), block, ...blocks.slice(index)]);
  }
  if (!canDropInColumn(block)) return doc;
  return mapBlocks(doc, (blocks) =>
    blocks.map((b) => {
      if (b.id !== target.rowId || b.type !== "columns") return b;
      const columns = b.columns.map((column, i) =>
        i === target.col
          ? [...column.slice(0, target.index), block, ...column.slice(target.index)]
          : column
      );
      return { ...b, columns };
    })
  );
}

export function removeBlock(doc: EmailDocument, id: string): EmailDocument {
  const block = findBlock(doc, id);
  if (!block || block.type === "unsubscribe_link") return doc;
  return mapBlocks(doc, (blocks) =>
    blocks
      .filter((b) => b.id !== id)
      .map((b) =>
        b.type === "columns"
          ? { ...b, columns: b.columns.map((column) => column.filter((c) => c.id !== id)) }
          : b
      )
  );
}

export function updateBlock(doc: EmailDocument, id: string, patch: Partial<Block>): EmailDocument {
  const apply = <T extends Block>(b: T): T => (b.id === id ? ({ ...b, ...patch } as T) : b);
  return mapBlocks(doc, (blocks) =>
    blocks.map((b) => {
      const updated = apply(b);
      if (updated.type === "columns") {
        return { ...updated, columns: updated.columns.map((column) => column.map(apply)) };
      }
      return updated;
    })
  );
}

/** Copia profonda con identificatori nuovi: due blocchi con lo stesso id sono un bug che si vede tardi. */
export function cloneBlockWithFreshIds(block: Block): Block {
  const copy = JSON.parse(JSON.stringify(block)) as Block;
  copy.id = newId();
  if (copy.type === "columns") {
    copy.columns = copy.columns.map((column) => column.map((c) => ({ ...c, id: newId() })));
  }
  if (copy.type === "two_columns") {
    copy.left = copy.left.map((c) => ({ ...c, id: newId() }));
    copy.right = copy.right.map((c) => ({ ...c, id: newId() }));
  }
  return copy;
}

export function duplicateBlock(doc: EmailDocument, id: string): { doc: EmailDocument; newId: string | null } {
  const block = findBlock(doc, id);
  if (!block || block.type === "unsubscribe_link") return { doc, newId: null };
  const copy = cloneBlockWithFreshIds(block);
  const parent = findParentRow(doc, id);
  const target: DropTarget = parent
    ? { kind: "column", rowId: parent.rowId, col: parent.col, index: parent.index + 1 }
    : { kind: "root", index: doc.blocks.findIndex((b) => b.id === id) + 1 };
  return { doc: insertBlock(doc, copy, target), newId: copy.id };
}

/**
 * Sposta un blocco già presente.
 *
 * L'ordine conta: si toglie **prima** e si inserisce **dopo**, e l'indice di
 * destinazione va corretto di uno quando il blocco veniva da più in alto nella
 * stessa lista — senza quella correzione, trascinare un blocco di una
 * posizione in giù non lo muove affatto, che è il modo classico in cui un
 * riordino sembra rotto pur essendo "giusto".
 */
export function moveBlock(doc: EmailDocument, id: string, target: DropTarget): EmailDocument {
  const block = findBlock(doc, id);
  if (!block || block.type === "unsubscribe_link") return doc;
  if (target.kind === "column" && !canDropInColumn(block)) return doc;

  const parent = findParentRow(doc, id);
  let adjusted = target;
  if (target.kind === "root" && !parent) {
    const from = doc.blocks.findIndex((b) => b.id === id);
    if (from !== -1 && from < target.index) adjusted = { ...target, index: target.index - 1 };
  } else if (target.kind === "column" && parent && parent.rowId === target.rowId && parent.col === target.col) {
    if (parent.index < target.index) adjusted = { ...target, index: target.index - 1 };
  }

  const without = removeBlock(doc, id);
  return insertBlock(without, block, adjusted);
}

export function setBlockStyle(doc: EmailDocument, id: string, patch: Record<string, unknown>): EmailDocument {
  const block = findBlock(doc, id);
  if (!block) return doc;
  const style = { ...(block.style ?? {}), ...patch };
  // Un valore rimosso dal pannello torna a essere "non impostato", non zero:
  // zero è una scelta, assente è il predefinito del compilatore.
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (style as Record<string, unknown>)[k];
  }
  return updateBlock(doc, id, { style } as Partial<Block>);
}

/**
 * La riga «due colonne» di prima diventa una riga vera.
 *
 * Il vecchio `two_columns` non è modificabile nel nuovo editor — non ha zone
 * di rilascio, non si può aggiungere niente dentro, e il pannello proprietà
 * non saprebbe cosa mostrarne. Invece di lasciare quei blocchi muti dentro il
 * foglio, all'apertura diventano una riga 50/50 con lo stesso contenuto: è la
 * stessa email, con dentro qualcosa che si può toccare. La conversione avviene
 * solo quando la campagna passa dall'editor, e si salva al primo
 * salvataggio automatico; le campagne mai riaperte restano come sono e il
 * compilatore continua a renderizzare entrambe le forme.
 */
export function upgradeLegacyBlocks(blocks: Block[]): Block[] {
  return blocks.map((block) => {
    if (block.type !== "two_columns") return block;
    return {
      id: block.id,
      type: "columns",
      ratio: "50-50",
      columns: [block.left, block.right],
      style: block.style,
    };
  });
}

/** Una riga a colonne vuote: le colonne si riempiono trascinandoci dentro. */
export function createColumnsBlock(ratio: ColumnRatio): Block {
  const count = COLUMN_RATIO_WEIGHTS[ratio].length;
  return {
    id: newId(),
    type: "columns",
    ratio,
    columns: Array.from({ length: count }, () => [] as ColumnChildBlock[]),
  };
}
