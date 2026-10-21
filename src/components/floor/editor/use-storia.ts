"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HISTORY_LIMIT = 100;

/**
 * Generic undo/redo over a snapshot of editor state (the Room Builder uses it
 * for { elements, tables }). Two ways to change state:
 *  - `setLive(next)`: replaces the current state without touching the undo
 *    stack — for continuous updates during a drag/resize (would otherwise
 *    flood history with one entry per pointermove).
 *  - `commit(before, after)`: pushes the explicit pre-operation snapshot onto
 *    the undo stack and sets state to `after`, clearing redo. Callers capture
 *    `before` themselves (e.g. state-at-drag-start) since by the time a drag
 *    ends, `state` already reflects the live in-progress value — commit
 *    can't infer "before" from React's previous-state alone. Use this once
 *    when a drag/resize/rotate ends, or immediately for atomic ops
 *    (create/delete element).
 * History lives only in the editor for the current session (brief §26/41):
 * it is never persisted, and is naturally discarded when the builder closes.
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState(initial);
  /*
    Lo stato corrente anche fuori da React. Annulla e Ripeti spostano voci fra
    le due pile, e farlo **dentro** un `setState((prev) => …)` era il difetto:
    React in sviluppo (Strict Mode) esegue quella funzione due volte, quindi
    ogni clic toglieva due voci — e con una modifica sola la seconda non
    trovava niente e lasciava tutto com'era. Le pile si toccano qui fuori, una
    volta per clic, e a React si passa solo il valore finale.
  */
  const corrente = useRef(initial);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const [, forceRender] = useState(0);

  const imposta = useCallback((next: T) => {
    corrente.current = next;
    setState(next);
  }, []);

  const setLive = useCallback((next: T) => imposta(next), [imposta]);

  const commit = useCallback(
    (before: T, after: T) => {
      undoStack.current.push(before);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
      imposta(after);
      forceRender((n) => n + 1);
    },
    [imposta],
  );

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (previous === undefined) return;
    redoStack.current.push(corrente.current);
    imposta(previous);
    forceRender((n) => n + 1);
  }, [imposta]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    undoStack.current.push(corrente.current);
    imposta(next);
    forceRender((n) => n + 1);
  }, [imposta]);

  const reset = useCallback(
    (next: T) => {
      undoStack.current = [];
      redoStack.current = [];
      imposta(next);
      forceRender((n) => n + 1);
    },
    [imposta],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Dentro un campo Cmd+Z annulla il testo scritto, non la piantina.
      const bersaglio = e.target as HTMLElement | null;
      if (bersaglio && (bersaglio.tagName === "INPUT" || bersaglio.tagName === "TEXTAREA" || bersaglio.isContentEditable)) {
        return;
      }
      if (e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  return {
    state,
    setLive,
    commit,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}
