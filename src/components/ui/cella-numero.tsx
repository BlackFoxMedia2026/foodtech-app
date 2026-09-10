import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Una cella della fascia dei numeri, quella che si guarda di sfuggita mentre
 * si cammina. Serve al Servizio e alla lista d'attesa: era scritta due volte,
 * in due file che si citavano a vicenda nei commenti, e il difetto qui sotto
 * viveva in entrambe.
 *
 * **L'etichetta va a capo, non si taglia.** Prima era `truncate`, e la prima
 * cosa che sparisce quando lo spazio manca è la fine — cioè proprio la
 * **base del numero**: «In attesa · persone» diventava «In attesa…» e i suoi
 * 12 finivano accanto a una pillola che diceva «Attesa 3», due numeri veri che
 * sembravano contraddirsi solo perché l'unità era stata tagliata. Misurato sul
 * telefono: dell'etichetta si vedeva il 64-80%.
 *
 * Un numero senza la sua base non è un numero, e su questo prodotto è una
 * regola scritta: se lo spazio non basta, si prende una riga in più.
 */
export function CellaNumero({
  icona: Icona,
  etichetta,
  valore,
  nota,
  allarme = false,
  className,
}: {
  icona: LucideIcon;
  etichetta: string;
  valore: number | string;
  /** La base del numero: «persone», «coperti», «entro 60 min». */
  nota?: string;
  allarme?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-2 px-3 py-2", className)}>
      <Icona
        className={cn("mt-0.5 h-4 w-4 shrink-0", allarme ? "text-accent-strong" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className={cn("text-lg font-semibold leading-none tabular-nums", allarme && "text-accent-strong")}>
          {valore}
        </p>
        <p className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
          {etichetta}
          {nota && <span className="normal-case tracking-normal text-tertiary-foreground"> · {nota}</span>}
        </p>
      </div>
    </div>
  );
}
