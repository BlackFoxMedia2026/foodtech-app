"use client";

import { useEffect, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Palette,
  Sparkles,
  Strikethrough,
  Underline,
} from "lucide-react";
import { CAMPAIGN_VARIABLES, CAMPAIGN_VARIABLE_GROUPS, type Block, type BlockAlign } from "@/lib/campaign-blocks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TextStyleKind = "p" | "h1" | "h2" | "h3";

export interface AiAction {
  id: string;
  label: string;
}

/** Le azioni AI sul testo: poche, tutte con un risultato prevedibile. */
export const AI_ACTIONS: AiAction[] = [
  { id: "rewrite", label: "Riscrivi" },
  { id: "shorter", label: "Più breve" },
  { id: "elegant", label: "Più elegante" },
  { id: "persuasive", label: "Più persuasivo" },
  { id: "fix", label: "Correggi" },
  { id: "alternative", label: "Genera alternativa" },
];

function ToolButton({
  onClick,
  title,
  children,
  active,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      // Il punto delicato dell'intera toolbar: premere un pulsante non deve
      // togliere il fuoco al testo, altrimenti la selezione sparisce e il
      // comando non ha più niente su cui agire.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-foreground transition-colors hover:bg-secondary",
        active && "bg-cream text-clay-ink"
      )}
    >
      {children}
    </button>
  );
}

function exec(command: string, value?: string) {
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand(command, false, value);
}

function VariablesPopover({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-accent-strong hover:bg-accent/20"
        >
          <Braces className="h-3.5 w-3.5" /> Variabili
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        {CAMPAIGN_VARIABLE_GROUPS.map((group) => {
          const items = CAMPAIGN_VARIABLES.filter((v) => v.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="space-y-1.5">
              <p className="t-etichetta">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {items.map((v) => (
                  <button
                    key={v.token}
                    type="button"
                    title={v.token}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onInsert(v.token);
                      setOpen(false);
                    }}
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-secondary"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="t-nota leading-relaxed">
          La variabile viene inserita nel punto del cursore e sostituita all&apos;invio.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function AiMenu({ onAction, busy }: { onAction: (id: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-accent-strong hover:bg-accent/20"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} AI
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {AI_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onAction(a.id);
              setOpen(false);
            }}
            className="block w-full rounded px-2.5 py-1.5 text-left text-sm hover:bg-secondary"
          >
            {a.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ColorPop({
  icon,
  title,
  onPick,
  colors,
}: {
  icon: React.ReactNode;
  title: string;
  onPick: (color: string) => void;
  colors: { color: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          onMouseDown={(e) => e.preventDefault()}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-secondary"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex flex-wrap gap-1.5">
          {colors.map((c) => (
            <button
              key={c.color + c.label}
              type="button"
              title={c.label}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c.color);
                setOpen(false);
              }}
              className="h-7 w-7 rounded-md border border-foreground/20"
              style={{ background: c.color }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface TextToolbarProps {
  block: Block;
  brandColors: { color: string; label: string }[];
  aiBusy: boolean;
  onConvert: (kind: TextStyleKind) => void;
  onAlign: (align: BlockAlign) => void;
  onAi: (actionId: string) => void;
  onInsertVariable: (token: string) => void;
}

/**
 * La barra che compare sopra il testo selezionato.
 *
 * Ciò che vale per la *porzione* selezionata (grassetto, colore, link) passa
 * per `execCommand`; ciò che vale per l'intero blocco (allineamento, livello
 * del titolo) passa per lo stato. È la stessa distinzione che fa l'email
 * finale: l'allineamento è un attributo della cella, non del testo.
 */
export function TextToolbar(props: TextToolbarProps) {
  const { block } = props;
  const isRich = block.type === "text";
  const isTitle = block.type === "title";
  const currentKind: TextStyleKind = isTitle ? (`h${block.level ?? 1}` as TextStyleKind) : "p";
  const align = (block.style?.align ?? ("align" in block ? block.align : "left")) as BlockAlign;

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-border-strong bg-card p-1 shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {(isRich || isTitle) && (
        <select
          value={currentKind}
          onChange={(e) => props.onConvert(e.target.value as TextStyleKind)}
          onMouseDown={(e) => e.stopPropagation()}
          className="h-7 rounded bg-transparent px-1.5 text-xs text-foreground outline-none hover:bg-secondary"
        >
          <option value="p">Paragrafo</option>
          <option value="h1">Titolo 1</option>
          <option value="h2">Titolo 2</option>
          <option value="h3">Titolo 3</option>
        </select>
      )}

      {isRich && (
        <>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolButton title="Grassetto" onClick={() => exec("bold")}>
            <Bold className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton title="Corsivo" onClick={() => exec("italic")}>
            <Italic className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton title="Sottolineato" onClick={() => exec("underline")}>
            <Underline className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton title="Barrato" onClick={() => exec("strikeThrough")}>
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolButton>
          <ColorPop
            title="Colore testo"
            icon={<Palette className="h-3.5 w-3.5" />}
            colors={props.brandColors}
            onPick={(c) => exec("foreColor", c)}
          />
          <ColorPop
            title="Evidenziazione"
            icon={<Highlighter className="h-3.5 w-3.5" />}
            colors={props.brandColors}
            onPick={(c) => exec("hiliteColor", c)}
          />
          <span className="mx-0.5 h-4 w-px bg-border" />
          <ToolButton title="Elenco puntato" onClick={() => exec("insertUnorderedList")}>
            <List className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton title="Elenco numerato" onClick={() => exec("insertOrderedList")}>
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            title="Link"
            onClick={() => {
              const url = window.prompt("Indirizzo del link", "https://");
              if (url) exec("createLink", url);
            }}
          >
            <Link2 className="h-3.5 w-3.5" />
          </ToolButton>
        </>
      )}

      <span className="mx-0.5 h-4 w-px bg-border" />
      <ToolButton title="Allinea a sinistra" active={align === "left"} onClick={() => props.onAlign("left")}>
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton title="Centra" active={align === "center"} onClick={() => props.onAlign("center")}>
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolButton>
      <ToolButton title="Allinea a destra" active={align === "right"} onClick={() => props.onAlign("right")}>
        <AlignRight className="h-3.5 w-3.5" />
      </ToolButton>

      <span className="mx-0.5 h-4 w-px bg-border" />
      <VariablesPopover onInsert={props.onInsertVariable} />
      <AiMenu onAction={props.onAi} busy={props.aiBusy} />
    </div>
  );
}

/**
 * Tiene la barra incollata sopra il blocco selezionato mentre il canvas
 * scorre o la finestra cambia dimensione.
 */
export function useAnchorRect(blockId: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!blockId) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    const observer = new MutationObserver(measure);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [blockId]);

  return rect;
}
