"use client";

import { useRef, useState, type ReactNode } from "react";
import { ImagePlus, Minus, Plus, X } from "lucide-react";
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
            value === o.value ? "bg-segment text-segment-ink" : "text-muted-foreground hover:text-foreground"
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

/* ------------------------------------------------- tinta, saturazione, luce */

type Hsv = { h: number; s: number; v: number };

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)]
    .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Il selettore visivo: il quadrato per saturazione e luce, la barra per la
 * tinta. Quello di sistema (`input type=color`) era un quadratino da 40 px
 * che su ogni sistema apriva una finestra diversa; questo sta nel pannello,
 * si trascina col dito, e il colore cambia sul foglio mentre lo si muove.
 */
function SelettoreTinta({
  value,
  onChange,
  onFine,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** A gesto finito: è lì che il colore entra fra i recenti. */
  onFine: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(HEX_RE.test(value) ? value : "#ffffff"));
  const ultimo = useRef(value);
  // Se il colore cambia da fuori (un tondino del brand), il selettore lo segue.
  if (HEX_RE.test(value) && value.toLowerCase() !== ultimo.current.toLowerCase()) {
    ultimo.current = value;
    setHsv(hexToHsv(value));
  }

  function aggiorna(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next);
    ultimo.current = hex;
    onChange(hex);
  }

  function trascina(
    e: React.PointerEvent<HTMLDivElement>,
    da: (x: number, y: number) => Hsv,
  ) {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const muovi = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      aggiorna(da(x, y));
    };
    muovi(e);
    const su = () => {
      el.removeEventListener("pointermove", muovi);
      el.removeEventListener("pointerup", su);
      el.removeEventListener("pointercancel", su);
      onFine(ultimo.current);
    };
    el.addEventListener("pointermove", muovi);
    el.addEventListener("pointerup", su);
    el.addEventListener("pointercancel", su);
  }

  return (
    <div className="space-y-2.5">
      <div
        role="slider"
        aria-label="Saturazione e luminosità"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={hsvToHex(hsv)}
        tabIndex={0}
        onPointerDown={(e) => trascina(e, (x, y) => ({ ...hsv, s: x, v: 1 - y }))}
        className="relative h-32 w-full cursor-crosshair touch-none rounded-lg"
        style={{
          backgroundColor: `hsl(${hsv.h} 100% 50%)`,
          backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
        }}
      >
        <span
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.3)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hsvToHex(hsv) }}
        />
      </div>
      <div
        role="slider"
        aria-label="Tinta"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onPointerDown={(e) => trascina(e, (x) => ({ ...hsv, h: x * 359.9 }))}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full"
        style={{
          background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.3)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        />
      </div>
    </div>
  );
}

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
  immagine,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  brandColors: { color: string; label: string }[];
  allowEmpty?: boolean;
  /**
   * Solo per gli sfondi: un'immagine sopra il colore. `onScegli` apre la
   * libreria delle immagini (caricare, riusare, incollare un indirizzo).
   */
  immagine?: { url?: string; onScegli: () => void; onTogli: () => void };
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
            className="h-4 w-4 rounded border border-foreground/20 bg-cover bg-center"
            style={
              immagine?.url
                ? { backgroundImage: `url("${immagine.url}")` }
                : value
                  ? { background: value }
                  : { backgroundImage: "repeating-linear-gradient(45deg,#0000 0 4px,#8883 4px 8px)" }
            }
          />
          <span className="tabular-nums text-muted-foreground">{immagine?.url ? "immagine" : (value ?? "auto")}</span>
        </button>
      </PopoverTrigger>
      {/* `p-4`: il contenitore del popover non ha margini suoi, e i titoli,
          il quadrato e i cursori agli estremi finivano contro il bordo. */}
      <PopoverContent align="end" className="w-72 space-y-3.5 p-4">
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
          <SelettoreTinta
            value={HEX_RE.test(value ?? "") ? value! : "#ffffff"}
            onChange={(hex) => {
              setDraft(hex);
              onChange(hex);
            }}
            onFine={rememberColor}
          />
          <div className="flex items-center gap-2">
            <span
              className="h-8 w-8 shrink-0 rounded-md border border-foreground/20"
              style={{ background: HEX_RE.test(value ?? "") ? value : "#ffffff" }}
              aria-hidden="true"
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

        {immagine && (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="t-etichetta">Immagine di sfondo</p>
            {immagine.url ? (
              <div className="flex items-center gap-2">
                <span
                  className="h-10 w-14 shrink-0 rounded-md border border-foreground/20 bg-cover bg-center"
                  style={{ backgroundImage: `url("${immagine.url}")` }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    immagine.onScegli();
                  }}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  Cambia
                </button>
                <button
                  type="button"
                  onClick={immagine.onTogli}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Togli
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  immagine.onScegli();
                }}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs font-medium text-primary hover:border-border-strong hover:bg-primary/5"
              >
                <ImagePlus className="h-4 w-4" /> Carica un&apos;immagine
              </button>
            )}
            <p className="t-nota text-[11px] leading-snug">
              Il colore resta sotto: lo vede chi ha le immagini spente, e Outlook sul computer.
            </p>
          </div>
        )}

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
