"use client";

import { useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* Le briciole del pannello proprietà: piccole, ma usate ovunque e quindi
   scritte una volta sola. Le misure (32px di altezza, 14px di corpo) vengono
   dal §28 del brief: niente controlli minuscoli. */

export function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="t-etichetta">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 200,
  step = 1,
  suffix,
  decimals = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  decimals?: number;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(decimals))));
  return (
    <div className="flex h-8 items-center rounded-md border border-border bg-background/50">
      <button
        type="button"
        aria-label="Diminuisci"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-10 text-center text-sm tabular-nums">
        {value.toFixed(decimals)}
        {suffix}
      </span>
      <button
        type="button"
        aria-label="Aumenta"
        onClick={() => onChange(clamp(value + step))}
        className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 items-center justify-center rounded px-2.5 text-xs transition-colors",
            value === o.value ? "bg-cream text-clay-ink" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const RECENT_COLORS_KEY = "tavolo.editor-email.colori-recenti";

function readRecentColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_COLORS_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function rememberColor(color: string) {
  try {
    const next = [color, ...readRecentColors().filter((c) => c !== color)].slice(0, 8);
    window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
  } catch {
    /* Le impostazioni del browser possono vietare la memoria locale: i colori
       recenti sono una comodità, non un dato — se non si possono ricordare,
       il selettore funziona lo stesso. */
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Il selettore di colori.
 *
 * I colori del brand vengono per primi e sono grossi: è il modo di far sì che
 * la scelta facile sia anche quella giusta, e che una newsletter non diventi
 * un carnevale cromatico per la sola ragione che il selettore di sistema
 * offriva tutto l'arcobaleno alla stessa distanza.
 */
export function ColorField({
  value,
  onChange,
  brandColors,
  allowEmpty,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  brandColors: { color: string; label: string }[];
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const recent = readRecentColors();

  function pick(color: string) {
    rememberColor(color);
    onChange(color);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-md border border-border px-2 text-xs hover:border-border-strong"
        >
          <span
            className="h-4 w-4 rounded border border-foreground/20"
            style={
              value
                ? { background: value }
                : { backgroundImage: "repeating-linear-gradient(45deg,#0000 0 4px,#8883 4px 8px)" }
            }
          />
          <span className="tabular-nums text-muted-foreground">{value ?? "auto"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-3">
        <div className="space-y-2">
          <p className="t-etichetta">Colori del brand</p>
          <div className="flex flex-wrap gap-1.5">
            {brandColors.map((c) => (
              <button
                key={c.color + c.label}
                type="button"
                title={c.label}
                onClick={() => pick(c.color)}
                className="h-7 w-7 rounded-md border border-foreground/20"
                style={{ background: c.color }}
              />
            ))}
          </div>
        </div>

        {recent.length > 0 && (
          <div className="space-y-2">
            <p className="t-etichetta">Recenti</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className="h-6 w-6 rounded border border-foreground/20"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="t-etichetta">Altro colore</p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={HEX_RE.test(value ?? "") ? value : "#ffffff"}
              onChange={(e) => {
                setDraft(e.target.value);
                onChange(e.target.value);
              }}
              onBlur={(e) => rememberColor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
            />
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (HEX_RE.test(e.target.value)) onChange(e.target.value);
              }}
              placeholder="#000000"
              className="h-8 w-full rounded-md border border-border bg-background/50 px-2 text-xs tabular-nums outline-none focus:border-border-strong"
            />
          </div>
        </div>

        {allowEmpty && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Nessun colore
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
