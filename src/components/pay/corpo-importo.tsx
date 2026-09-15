"use client";

import { centesimiDaTesto } from "@/lib/conto-diviso";

/**
 * «Quanto vuoi pagare?»
 *
 * Il campo accetta la virgola, il punto, gli spazi e il simbolo dell'euro,
 * perché è quello che la gente scrive davvero (vedi `centesimiDaTesto`). Il
 * controllo qui serve solo a dare una risposta immediata: **il limite vero lo
 * mette il server**, che è l'unico a sapere quanto resta in questo istante.
 *
 * `inputMode="decimal"` apre il tastierino numerico invece della tastiera
 * intera: una riga di differenza, e su un telefono è la differenza fra due
 * tocchi e sei.
 *
 * Le tre scorciatoie sono frazioni del residuo arrotondate all'euro, non
 * cifre tonde decise a tavolino: su un conto da 90 € «22 · 45 · 67» serve,
 * «25 · 50 · 75» su un residuo da 30 € offrirebbe due importi impossibili.
 */
export function CorpoImporto({
  residuoCents,
  minimoCents,
  currency,
  euro,
  testo,
  onTesto,
  problema,
}: {
  residuoCents: number;
  minimoCents: number;
  currency: string;
  euro: (c: number) => string;
  testo: string;
  onTesto: (v: string) => void;
  problema: string | null;
}) {
  const centesimi = centesimiDaTesto(testo);

  const scorciatoie = [...new Set([0.25, 0.5, 0.75].map((f) => Math.round((residuoCents * f) / 100) * 100))]
    .filter((c) => c >= minimoCents && c < residuoCents)
    .slice(0, 3);

  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-[20px] border border-border/70 bg-background/40 px-4 py-3.5">
        <label
          htmlFor="importo"
          className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          Il tuo importo
        </label>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-display text-[34px] text-muted-foreground" aria-hidden="true">
            {currency === "EUR" ? "€" : currency}
          </span>
          <input
            id="importo"
            value={testo}
            onChange={(e) => onTesto(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            aria-invalid={!!problema}
            aria-describedby={problema ? "importo-problema" : undefined}
            className="text-display w-full bg-transparent text-[40px] leading-none tabular-nums outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        {problema ? (
          <p id="importo-problema" role="alert" className="mt-2 text-[13px] text-destructive-soft">
            {problema}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Restano {euro(residuoCents)} da pagare.
          </p>
        )}
      </div>

      {scorciatoie.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scorciatoie.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onTesto((c / 100).toFixed(2).replace(".", ","))}
              aria-pressed={centesimi === c}
              className={`h-12 rounded-2xl px-4 text-[16px] font-semibold tabular-nums transition duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                centesimi === c
                  ? "bg-cream text-clay-ink"
                  : "border border-border-strong text-foreground hover:border-accent/50"
              }`}
            >
              {euro(c)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
