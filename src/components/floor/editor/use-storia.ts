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
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const [, forceRender] = useState(0);

  const setLive = useCallback((next: T) => setState(next), []);

  const commit = useCallback((before: T, after: T) => {
    undoStack.current.push(before);
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    setState(after);
    forceRender((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      const previous = undoStack.current.pop();
      if (previous === undefined) return prev;
      redoStack.current.push(prev);
      forceRender((n) => n + 1);
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const next = redoStack.current.pop();
      if (next === undefined) return prev;
      undoStack.current.push(prev);
      forceRender((n) => n + 1);
      return next;
    });
  }, []);

  const reset = useCallback((next: T) => {
    undoStack.current = [];
    redoStack.current = [];
    setState(next);
    forceRender((n) => n + 1);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
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
