import { cn } from "@/lib/utils";

/**
 * L'avanzamento di una procedura a passi, nella forma del telefono.
 *
 * Lo stepper a tondi numerati sulla scrivania sta in fila col titolo; a
 * 390 px sei tondi da 24 px sono una riga intera di bersagli troppo piccoli
 * per il pollice, e non dicono il nome del passo. Qui una riga di testo
 * («Passo 2 di 6 · Filtri») e una barra a segmenti, come nelle app: si legge
 * dove si è, e per tornare indietro c'è «Indietro» in basso.
 */
export function AvanzamentoPassi({
  passi,
  corrente,
  className,
}: {
  passi: { label: string }[];
  corrente: number;
  className?: string;
}) {
  const totale = passi.length;
  return (
    <div className={cn("w-full", className)}>
      <p className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="tabular-nums">
          Passo {corrente + 1} di {totale}
        </span>
        <span className="font-medium text-foreground">{passi[corrente]?.label}</span>
      </p>
      <div
        className="mt-2 flex gap-1"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={totale}
        aria-valuenow={corrente + 1}
        aria-label={`Passo ${corrente + 1} di ${totale}`}
      >
        {passi.map((p, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={cn("h-1 flex-1 rounded-full transition-colors", i <= corrente ? "bg-accent-strong" : "bg-border")}
          />
        ))}
      </div>
    </div>
  );
}
