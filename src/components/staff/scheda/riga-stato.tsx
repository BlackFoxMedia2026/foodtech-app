import type { ReactNode } from "react";
import { Check, CircleAlert, Plus, Upload } from "lucide-react";

export type StatoRiga = "ok" | "in_scadenza" | "scaduto" | "mancante" | "facoltativo";

const STILE: Record<StatoRiga, { icona: string; riga: string; pillola: string; testo: string }> = {
  ok: {
    icona: "bg-[hsl(var(--turno-sala))] text-white",
    riga: "border-border/50 bg-card/60",
    pillola: "bg-[hsl(var(--turno-sala)/0.12)] text-[hsl(var(--turno-sala))]",
    testo: "Caricato",
  },
  in_scadenza: {
    icona: "bg-accent-strong text-white",
    riga: "border-accent/40 bg-card/60",
    pillola: "bg-accent/15 text-accent-strong",
    testo: "In scadenza",
  },
  scaduto: {
    icona: "bg-destructive text-white",
    riga: "border-destructive/30 bg-destructive/5",
    pillola: "bg-destructive/10 text-destructive-soft",
    testo: "Scaduto",
  },
  mancante: {
    icona: "border-2 border-dashed border-accent-strong/60 text-accent-strong",
    riga: "border-dashed border-accent-strong/40 bg-accent/5",
    pillola: "bg-accent/15 text-accent-strong",
    testo: "Da caricare",
  },
  facoltativo: {
    icona: "border-2 border-dashed border-border-strong text-tertiary-foreground",
    riga: "border-dashed border-border/70",
    pillola: "bg-veil-6 text-muted-foreground",
    testo: "Facoltativo",
  },
};

/**
 * Una riga di un adempimento — un documento obbligatorio, un corso — che si
 * legge a colpo d'occhio: cosa, se c'è (il pallino e la pillola), e fino a
 * quando vale. I dettagli stanno nell'anteprima e nel menu, non qui.
 * Quello che manca si stacca: bordo tratteggiato, fondo caldo.
 *
 * È la stessa riga in Documenti e in Formazione, perché è la stessa domanda:
 * «questa persona è in regola?».
 */
export function RigaStato({
  titolo,
  stato,
  sottotitolo,
  azioni,
  pillola,
}: {
  titolo: string;
  stato: StatoRiga;
  sottotitolo: ReactNode;
  azioni?: ReactNode;
  /** Il testo della pillola, quando quello dello stato non basta («Valido»). */
  pillola?: string;
}) {
  const st = STILE[stato];
  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${st.riga}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${st.icona}`} aria-hidden="true">
        {stato === "mancante" ? (
          <Upload className="h-3.5 w-3.5" />
        ) : stato === "facoltativo" ? (
          <Plus className="h-3.5 w-3.5" />
        ) : stato === "ok" ? (
          <Check className="h-4 w-4" strokeWidth={2.5} />
        ) : (
          <CircleAlert className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base font-medium text-foreground">
          {titolo}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.pillola}`}>{pillola ?? st.testo}</span>
        </p>
        <p className="truncate text-sm text-muted-foreground">{sottotitolo}</p>
      </div>
      {azioni && <div className="flex shrink-0 items-center gap-1">{azioni}</div>}
    </li>
  );
}
