"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { richHtmlToPlainText, sanitizeRichText } from "@/lib/campaign-rich-text";
import { cn } from "@/lib/utils";

/**
 * Scrivere dentro l'email, non accanto.
 *
 * Il nodo delicato di un campo `contentEditable` governato da React è che lo
 * stato non deve mai riscrivere il DOM **mentre** qualcuno ci sta scrivendo
 * dentro: riscriverlo sposta il cursore all'inizio a ogni lettera. Qui la
 * regola è esplicita — il contenuto si impone solo quando l'elemento non ha il
 * fuoco, e mentre ce l'ha il DOM è la fonte di verità e lo stato lo insegue.
 */

function useSyncedContent(html: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML !== html) el.innerHTML = html;
  }, [html]);
  return ref;
}

export function EditableRich({
  html,
  onChange,
  onFocus,
  onBlur,
  className,
  style,
}: {
  html: string;
  onChange: (html: string, plain: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useSyncedContent(html);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-editable="rich"
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={(e) => {
        const raw = (e.target as HTMLDivElement).innerHTML;
        // Si ripulisce prima di salvare, non prima di mostrare: il canvas
        // rende questo HTML nel prodotto, quindi nello stato non deve mai
        // entrare marcatura che non sia nella lista bianca.
        const clean = sanitizeRichText(raw);
        onChange(clean, richHtmlToPlainText(clean));
      }}
      onPaste={(e) => {
        e.preventDefault();
        const html = e.clipboardData.getData("text/html");
        const text = e.clipboardData.getData("text/plain");
        const payload = html
          ? sanitizeRichText(html)
          : text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
        document.execCommand("insertHTML", false, payload);
      }}
      className={cn("outline-none", className)}
      style={style}
    />
  );
}

/**
 * Il testo senza formattazione — titoli ed etichette dei pulsanti. Non è una
 * versione ridotta per pigrizia: un titolo con dentro tre corpi diversi e un
 * link non è un titolo, e l'email lo renderebbe comunque a modo suo.
 */
export function EditablePlain({
  value,
  onChange,
  onFocus,
  onBlur,
  className,
  style,
  as: Tag = "div",
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "span";
}) {
  // Ref per callback e non `useRef` tipizzato su un elemento solo: `Tag` può
  // essere un div o uno span, e una funzione che accetta HTMLElement va bene
  // per entrambi senza bisogno di un cast.
  const ref = useRef<HTMLElement | null>(null);
  const setRef = (node: HTMLElement | null) => {
    ref.current = node;
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  return (
    <Tag
      ref={setRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-editable="plain"
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e: React.KeyboardEvent) => {
        // A capo dentro un titolo: l'email lo renderebbe, ma quasi sempre è
        // il tasto premuto per "ho finito".
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }
      }}
      onInput={(e: React.FormEvent) => onChange((e.target as HTMLElement).textContent ?? "")}
      onPaste={(e: React.ClipboardEvent) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
      className={cn("outline-none", className)}
      style={style}
    />
  );
}
