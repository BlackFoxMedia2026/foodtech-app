import { cn } from "@/lib/utils";

/**
 * Da dove viene un numero, in un segno.
 *
 * Tutto questo prodotto distingue tre cose che sembrano uguali su uno
 * schermo: un dato **misurato** (sta nelle righe), una **stima** (un dato
 * moltiplicato per un valore dichiarato), e una **previsione** (una misura
 * proiettata avanti). La distinzione era scritta a parole nelle didascalie —
 * «questa cifra usa lo scontrino medio che hai dichiarato: è una stima» — e
 * chi guarda un numero non legge la didascalia.
 *
 * L'audit visivo chiedeva di renderla **visiva**: un segno accanto al numero,
 * sempre lo stesso in tutto il prodotto, con la spiegazione a portata di
 * puntatore. Non un colore diverso — il colore qui significa già
 * urgenza — ma una parola piccolissima e maiuscoletta.
 *
 * Non sostituisce le didascalie: le riassume. La regola resta quella di
 * sempre: dove non si misura, si dice cosa manca.
 */

export type BaseNumero = "misurato" | "stimato" | "previsto";

const TESTO: Record<BaseNumero, string> = {
  misurato: "misurato",
  stimato: "stima",
  previsto: "previsto",
};

const STILE: Record<BaseNumero, string> = {
  // Il misurato è il caso normale: si dichiara, ma non chiede attenzione.
  misurato: "border-sage/40 text-sage",
  // La stima è la sola che va guardata con prudenza.
  stimato: "border-accent/40 text-accent",
  previsto: "border-border text-muted-foreground",
};

export function Base({
  base,
  dettaglio,
  className,
}: {
  base: BaseNumero;
  /** Su cosa poggia: quante righe, quale copertura, quale valore dichiarato. */
  dettaglio: string;
  className?: string;
}) {
  return (
    <span
      title={dettaglio}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-px align-middle text-[9px] font-medium uppercase tracking-wide",
        STILE[base],
        className,
      )}
    >
      {TESTO[base]}
    </span>
  );
}
