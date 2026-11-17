import type { ReactNode } from "react";

/** Il pulsante che porta indietro di un passo: contorno, a sinistra. */
export const CLASSE_INDIETRO =
  "inline-flex h-11 items-center gap-1.5 rounded-full border border-border/70 px-4 text-sm font-medium text-foreground/90 transition-colors hover:bg-veil-10 disabled:opacity-50";

/** Il pulsante che manda avanti: pieno, a destra. */
export const CLASSE_AVANTI =
  "inline-flex h-11 items-center gap-1.5 rounded-full bg-cta px-5 text-sm font-medium text-cta-ink shadow-[shadow:var(--button-accent-shadow)] transition hover:brightness-105 disabled:opacity-50";

/**
 * Il piede fermo in fondo alla registrazione: indietro a sinistra, avanti a
 * destra, e in mezzo una riga che dice cosa succede premendo avanti.
 *
 * Sta fuori dalla regione che scorre: con trenta campi, un «Avanti» in fondo
 * al modulo è un «Avanti» che si cerca.
 */
export function PiedePassi({
  indietro,
  nota,
  errore,
  children,
}: {
  indietro?: ReactNode;
  nota?: ReactNode;
  errore?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="fissa flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-card/70 px-3 py-2.5 backdrop-blur">
      <div className="shrink-0">{indietro}</div>
      <div className="min-w-0 flex-1 text-center">
        {errore ? (
          <p role="alert" className="text-sm text-destructive-soft">
            {errore}
          </p>
        ) : nota ? (
          <p className="hidden text-xs text-muted-foreground md:block">{nota}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
