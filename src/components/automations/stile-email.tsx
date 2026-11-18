"use client";

import Link from "next/link";
import { Check, ImageOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EMAIL_FONT_STACKS } from "@/lib/campaign-blocks";
import {
  type AutomationStyle,
  COLORI_EMAIL,
  fontDi,
  type FormaPulsante,
  inchiostroSu,
  SFONDI_EMAIL,
  stiliPronti,
} from "@/lib/automazioni-email";
import { cn } from "@/lib/utils";

const FORME: { id: FormaPulsante; nome: string; raggio: string }[] = [
  { id: "pillola", nome: "Tonda", raggio: "999px" },
  { id: "morbido", nome: "Morbida", raggio: "6px" },
  { id: "squadrato", nome: "Squadrata", raggio: "0" },
];

/**
 * Lo stile dell'email: un piccolo builder.
 *
 * In cima gli **stili pronti**, perché la maggior parte dei locali sceglie e
 * basta; sotto le stesse scelte una per una, per ritoccare. Ogni scelta si
 * vede nell'anteprima mentre la si fa, quindi qui niente spiegazioni lunghe:
 * il risultato è a sinistra.
 */
export function StileEmail({
  stile,
  onChange,
  coloreLocale,
  logoUrl,
  disabled,
  onFocusPulsante,
  onBlurPulsante,
}: {
  stile: AutomationStyle;
  onChange: (s: AutomationStyle) => void;
  coloreLocale: string | null;
  logoUrl: string | null;
  disabled: boolean;
  onFocusPulsante: () => void;
  onBlurPulsante: () => void;
}) {
  const metti = (parziale: Partial<AutomationStyle>) => onChange({ ...stile, ...parziale });
  const pronti = stiliPronti(coloreLocale);
  const colori = [
    ...(coloreLocale && /^#[0-9a-fA-F]{6}$/.test(coloreLocale) ? [{ nome: "Del locale", hex: coloreLocale }] : []),
    ...COLORI_EMAIL.filter((c) => c.hex.toLowerCase() !== coloreLocale?.toLowerCase()),
  ];
  const coloreLibero = !colori.some((c) => c.hex.toLowerCase() === stile.colore.toLowerCase());

  return (
    <div className="space-y-6">
      {/* ── Stili pronti ───────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h3 className="t-titolo-scheda text-card-foreground">Stili pronti</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {pronti.map((p) => {
            // Lo stesso confronto di quello che si applica: senza logo caricato,
            // il logo dello stile pronto non c'è.
            const applicato = { ...p.stile, pulsante: stile.pulsante, logo: p.stile.logo && !!logoUrl };
            const scelto = JSON.stringify(applicato) === JSON.stringify({ ...stile, logo: stile.logo && !!logoUrl });
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                aria-pressed={scelto}
                aria-label={`Stile ${p.nome}`}
                onClick={() =>
                  // Il testo del pulsante è una scelta di parole, non di stile:
                  // cambiare faccia all'email non lo riscrive.
                  onChange(applicato)
                }
                className={cn(
                  "group overflow-hidden rounded-xl border text-left transition-shadow disabled:opacity-50",
                  scelto
                    ? "border-primary ring-2 ring-primary/25"
                    : "border-border hover:shadow-[0_6px_16px_-10px_rgba(60,40,15,0.45)]",
                )}
              >
                {/* Un'email in miniatura: foglio, due righe, il pulsante. */}
                <span
                  className="flex h-[4.5rem] flex-col justify-center gap-1.5 px-3"
                  style={{
                    background: p.stile.sfondo,
                    fontFamily: fontDi(p.stile.carattere),
                    alignItems: p.stile.allineamento === "centro" ? "center" : "flex-start",
                  }}
                  aria-hidden="true"
                >
                  <span className="text-[13px] leading-none text-[#2F1F11]">Ciao Giulia,</span>
                  <span className="h-1 w-16 rounded-full bg-[#2F1F11]/15" />
                  <span
                    className="mt-0.5 px-2.5 py-1 text-[10px] font-semibold leading-none"
                    style={{
                      background: p.stile.colore,
                      color: inchiostroSu(p.stile.colore),
                      borderRadius: FORME.find((f) => f.id === p.stile.forma)?.raggio,
                    }}
                  >
                    Prenota
                  </span>
                </span>
                <span className="flex items-center justify-between border-t border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground">
                  {p.nome}
                  {scelto && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Colore ─────────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h3 className="t-titolo-scheda text-card-foreground">Colore del pulsante</h3>
        <div className="flex flex-wrap items-center gap-2">
          {colori.map((c) => {
            const scelto = c.hex.toLowerCase() === stile.colore.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                disabled={disabled}
                title={c.nome}
                aria-label={c.nome}
                aria-pressed={scelto}
                onClick={() => metti({ colore: c.hex })}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-card transition-shadow",
                  scelto ? "ring-2 ring-primary" : "ring-1 ring-black/10 hover:ring-black/25",
                )}
                style={{ background: c.hex }}
              >
                {scelto && <Check className="h-4 w-4" style={{ color: inchiostroSu(c.hex) }} aria-hidden="true" />}
              </button>
            );
          })}
          {/* Un colore qualunque: il selettore del sistema dietro un tondo
              arcobaleno, acceso quando il colore scelto non è fra quelli sopra. */}
          <label
            title="Un altro colore"
            className={cn(
              "relative grid h-9 w-9 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-card",
              coloreLibero ? "ring-2 ring-primary" : "ring-1 ring-black/10",
            )}
            style={{
              background: coloreLibero
                ? stile.colore
                : "conic-gradient(#e0533d, #e3b23c, #4caf6d, #3d8fd1, #8e5bd6, #e0533d)",
            }}
          >
            <input
              type="color"
              value={stile.colore}
              disabled={disabled}
              onChange={(e) => metti({ colore: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Un altro colore"
            />
          </label>
        </div>
      </section>

      {/* ── Sfondo ─────────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h3 className="t-titolo-scheda text-card-foreground">Sfondo</h3>
        <Segmenti
          disabled={disabled}
          valore={stile.sfondo.toLowerCase()}
          onChange={(v) => metti({ sfondo: v })}
          opzioni={SFONDI_EMAIL.map((s) => ({
            id: s.hex,
            contenuto: (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full ring-1 ring-black/15" style={{ background: s.hex }} />
                {s.nome}
              </span>
            ),
          }))}
        />
      </section>

      {/* ── Carattere ──────────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h3 className="t-titolo-scheda text-card-foreground">Carattere</h3>
        <div className="grid grid-cols-2 gap-2">
          {EMAIL_FONT_STACKS.map((f) => {
            const scelto = stile.carattere === f.id;
            return (
              <button
                key={f.id}
                type="button"
                disabled={disabled}
                aria-pressed={scelto}
                onClick={() => metti({ carattere: f.id })}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  scelto ? "border-primary bg-primary/5" : "border-border hover:bg-[#c9a96a]/10",
                )}
              >
                <span className="text-2xl leading-none text-card-foreground" style={{ fontFamily: f.stack }}>
                  Aa
                </span>
                <span className="min-w-0 text-xs leading-tight text-muted-foreground">{f.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Impaginazione ──────────────────────────────────────────────── */}
      <section className="space-y-2.5">
        <h3 className="t-titolo-scheda text-card-foreground">Allineamento</h3>
        <Segmenti
          disabled={disabled}
          valore={stile.allineamento}
          onChange={(v) => metti({ allineamento: v as AutomationStyle["allineamento"] })}
          opzioni={[
            { id: "sinistra", contenuto: "A sinistra" },
            { id: "centro", contenuto: "Al centro" },
          ]}
        />

        <label
          htmlFor="stile-logo"
          className={cn(
            "mt-1 flex min-h-[52px] items-center gap-3 rounded-xl border px-3.5",
            logoUrl ? "cursor-pointer" : "opacity-80",
            stile.logo && logoUrl ? "border-[#c9a96a]/45 bg-[#c9a96a]/10" : "border-border",
          )}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- il logo del locale, già caricato altrove
            <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
          ) : (
            <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="flex-1 text-sm">
            <span className="font-medium text-card-foreground">Logo in testa</span>
            <span className="block text-xs text-muted-foreground">
              {logoUrl ? (
                "Il logo del locale sopra il saluto."
              ) : (
                <>
                  Nessun logo caricato.{" "}
                  <Link href="/settings/brand" className="font-medium text-accent-strong underline underline-offset-2">
                    Caricalo nel Brand
                  </Link>
                </>
              )}
            </span>
          </span>
          <Switch
            id="stile-logo"
            checked={stile.logo && !!logoUrl}
            disabled={disabled || !logoUrl}
            onCheckedChange={(v) => metti({ logo: v })}
          />
        </label>
      </section>

      {/* ── Il pulsante ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="t-titolo-scheda text-card-foreground">Il pulsante</h3>
        <div className="space-y-1.5">
          <Label htmlFor="stile-pulsante">Cosa c&apos;è scritto</Label>
          <Input
            id="stile-pulsante"
            value={stile.pulsante}
            maxLength={40}
            disabled={disabled}
            onChange={(e) => metti({ pulsante: e.target.value })}
            onFocus={onFocusPulsante}
            onBlur={onBlurPulsante}
          />
          <p className="t-nota">Porta sempre alla pagina delle prenotazioni del locale.</p>
        </div>
        <Segmenti
          disabled={disabled}
          valore={stile.forma}
          onChange={(v) => metti({ forma: v as FormaPulsante })}
          opzioni={FORME.map((f) => ({
            id: f.id,
            contenuto: (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-6 border-[1.5px] border-current" style={{ borderRadius: f.raggio }} />
                {f.nome}
              </span>
            ),
          }))}
        />
      </section>
    </div>
  );
}

/** Una scelta fra poche opzioni, a capsula: come le viste del resto del prodotto. */
function Segmenti({
  opzioni,
  valore,
  onChange,
  disabled,
}: {
  opzioni: { id: string; contenuto: React.ReactNode }[];
  valore: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="grid gap-1 rounded-full bg-[#c9a96a]/15 p-1"
      style={{ gridTemplateColumns: `repeat(${opzioni.length}, minmax(0, 1fr))` }}
    >
      {opzioni.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          aria-pressed={valore === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-9 items-center justify-center rounded-full px-2 text-sm transition-colors",
            valore === o.id ? "bg-card font-medium text-card-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.contenuto}
        </button>
      ))}
    </div>
  );
}
