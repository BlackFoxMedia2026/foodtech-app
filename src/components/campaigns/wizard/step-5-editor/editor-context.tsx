"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { Block, EmailDocument, EmailSettings } from "@/lib/campaign-blocks";
import {
  duplicateBlock as duplicateInDoc,
  insertBlock as insertInDoc,
  moveBlock as moveInDoc,
  removeBlock as removeFromDoc,
  setBlockStyle as setStyleInDoc,
  updateBlock as updateInDoc,
  type DropTarget,
} from "@/lib/campaign-document-ops";

export type Viewport = "desktop" | "mobile";
export type SaveState = "idle" | "saving" | "saved" | "error";

interface EditorState {
  doc: EmailDocument;
  /** `null` significa «niente selezionato», che nel pannello destro vuol dire impostazioni dell'email. */
  selectedId: string | null;
  past: EmailDocument[];
  future: EmailDocument[];
  /** Chiave e istante dell'ultima modifica, per non riempire la cronologia di un passo per tasto premuto. */
  lastCommit: { key: string; at: number } | null;
  viewport: Viewport;
  zoom: number;
  saveState: SaveState;
}

type Action =
  | { type: "COMMIT"; doc: EmailDocument; coalesceKey?: string; select?: string | null }
  | { type: "SELECT"; id: string | null }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_VIEWPORT"; viewport: Viewport }
  | { type: "SET_ZOOM"; zoom: number }
  | { type: "SET_SAVE_STATE"; saveState: SaveState };

const HISTORY_LIMIT = 60;
const COALESCE_MS = 700;

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "COMMIT": {
      if (action.doc === state.doc) {
        return action.select !== undefined ? { ...state, selectedId: action.select } : state;
      }
      const now = Date.now();
      // Scrivere in un blocco di testo produce una modifica per carattere: senza
      // accorpamento, un annullamento tornerebbe indietro di una lettera e
      // trenta annullamenti servirebbero a disfare una frase.
      const coalesce =
        action.coalesceKey !== undefined &&
        state.lastCommit?.key === action.coalesceKey &&
        now - state.lastCommit.at < COALESCE_MS;
      const past = coalesce ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT);
      return {
        ...state,
        doc: action.doc,
        past,
        future: [],
        lastCommit: action.coalesceKey ? { key: action.coalesceKey, at: now } : null,
        selectedId: action.select !== undefined ? action.select : state.selectedId,
      };
    }
    case "SELECT":
      return { ...state, selectedId: action.id };
    case "UNDO": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        lastCommit: null,
      };
    }
    case "REDO": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        lastCommit: null,
      };
    }
    case "SET_VIEWPORT":
      return { ...state, viewport: action.viewport };
    case "SET_ZOOM":
      return { ...state, zoom: action.zoom };
    case "SET_SAVE_STATE":
      return { ...state, saveState: action.saveState };
  }
}

export interface EditorApi {
  state: EditorState;
  canUndo: boolean;
  canRedo: boolean;
  select: (id: string | null) => void;
  undo: () => void;
  redo: () => void;
  insert: (block: Block, target: DropTarget) => void;
  move: (id: string, target: DropTarget) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  update: (id: string, patch: Partial<Block>, coalesceKey?: string) => void;
  setStyle: (id: string, patch: Record<string, unknown>) => void;
  setSettings: (patch: Partial<EmailSettings>) => void;
  setViewport: (v: Viewport) => void;
  setZoom: (z: number) => void;
  setSaveState: (s: SaveState) => void;
}

const EditorContext = createContext<EditorApi | null>(null);

export function EditorProvider({ initialDoc, children }: { initialDoc: EmailDocument; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    doc: initialDoc,
    selectedId: null,
    past: [],
    future: [],
    lastCommit: null,
    viewport: "desktop",
    zoom: 1,
    saveState: "idle",
  });

  const commit = useCallback(
    (doc: EmailDocument, opts?: { coalesceKey?: string; select?: string | null }) =>
      dispatch({ type: "COMMIT", doc, coalesceKey: opts?.coalesceKey, select: opts?.select }),
    []
  );

  const api = useMemo<EditorApi>(
    () => ({
      state,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      select: (id) => dispatch({ type: "SELECT", id }),
      undo: () => dispatch({ type: "UNDO" }),
      redo: () => dispatch({ type: "REDO" }),
      insert: (block, target) => commit(insertInDoc(state.doc, block, target), { select: block.id }),
      move: (id, target) => commit(moveInDoc(state.doc, id, target), { select: id }),
      remove: (id) => commit(removeFromDoc(state.doc, id), { select: null }),
      duplicate: (id) => {
        const result = duplicateInDoc(state.doc, id);
        commit(result.doc, { select: result.newId ?? state.selectedId });
      },
      update: (id, patch, coalesceKey) => commit(updateInDoc(state.doc, id, patch), { coalesceKey }),
      setStyle: (id, patch) => commit(setStyleInDoc(state.doc, id, patch)),
      setSettings: (patch) => commit({ ...state.doc, settings: { ...state.doc.settings, ...patch } }),
      setViewport: (viewport) => dispatch({ type: "SET_VIEWPORT", viewport }),
      setZoom: (zoom) => dispatch({ type: "SET_ZOOM", zoom }),
      setSaveState: (saveState) => dispatch({ type: "SET_SAVE_STATE", saveState }),
    }),
    [state, commit]
  );

  return <EditorContext.Provider value={api}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorApi {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditor va usato dentro EditorProvider");
  return ctx;
}
