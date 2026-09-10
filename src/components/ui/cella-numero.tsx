import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { accorda, type Parola } from "@/lib/accordo";

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
 *
 * **E la base concorda col numero.** Etichetta e nota accettano anche la
 * coppia `[singolare, plurale]`: «1 confermati · stanno arrivando» non è
 * italiano, e un prodotto che lo scrive sembra fatto da una macchina. Dove la
 * parola non cambia («coperti», «entro 60 min») si passa una stringa sola.
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
  etichetta: Parola;
  valore: number | string;
  /** La base del numero: «persone», «coperti», «entro 60 min». */
  nota?: Parola;
  allarme?: boolean;
  className?: string;
}) {
  const etichettaResa = accorda(etichetta, valore);
  const notaResa = nota === undefined ? undefined : accorda(nota, valore);
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
          {etichettaResa}
          {notaResa && <span className="normal-case tracking-normal text-tertiary-foreground"> · {notaResa}</span>}
        </p>
      </div>
    </div>
  );
}
