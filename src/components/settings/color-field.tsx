"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOGLIA_AA, rapportoLeggibile, testoSu } from "@/lib/colore-leggibile";

const HEX_6_RE = /^#[0-9a-fA-F]{6}$/;

export function ColorField({
  label,
  value,
  onChange,
  placeholder = "#FFD400",
  /** Su questo colore ci andrà del testo: se non ce ne sta di leggibile, si dice. */
  portaTesto = false,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  placeholder?: string;
  portaTesto?: boolean;
}) {
  const pickerValue = HEX_6_RE.test(value) ? value : "#000000";

  /* Il colore principale finisce sotto la scritta del pulsante «Prenota» che
     vedono i clienti. Il testo lo deriviamo — chiaro o scuro, quello che si
     legge meglio — ma esistono colori su cui **nessuno dei due** basta: quelli
     vanno detti a chi sta scegliendo, non lasciati scoprire ai suoi clienti. */
  const resa = portaTesto && HEX_6_RE.test(value) ? testoSu(value) : null;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={pickerValue}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer riquadro bg-transparent p-0.5"
          aria-label={label}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-sm" />
      </div>

      {resa && (
        <p className={resa.leggibile ? "t-nota" : "text-xs font-medium text-accent-strong"}>
          {resa.leggibile ? (
            <>
              La scritta sul pulsante sarà {resa.colore === "#2F1F11" ? "scura" : "chiara"} —
              si legge {rapportoLeggibile(resa.rapporto)} volte più del fondo.
            </>
          ) : (
            <>
              Su questo colore nessuna scritta si legge bene: il massimo è{" "}
              {rapportoLeggibile(resa.rapporto)} volte il fondo, e ne servono{" "}
              {rapportoLeggibile(SOGLIA_AA)}. Scegline uno più scuro o più chiaro,
              altrimenti i tuoi clienti non leggeranno il pulsante «Prenota».
            </>
          )}
        </p>
      )}
    </div>
  );
}
