import { Badge } from "@/components/ui/badge";
import { TESTO_STATO, TONO_STATO, type EtichettaStato } from "@/lib/stati-costo";

/**
 * Gli stati di un cliente, tutti quelli che valgono insieme.
 *
 * Il caso che questa scelta serve a rappresentare è Aurora Bistrot: al 40% del
 * budget — quindi regolare — e diretta a superarlo di trenta euro. Un badge
 * solo direbbe «regolare», e chi guarda la tabella passerebbe oltre.
 */
export function Stati({ etichette }: { etichette: EtichettaStato[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {etichette.map((e) => (
        <Badge key={e} tone={TONO_STATO[e]} className="whitespace-nowrap">
          {TESTO_STATO[e]}
        </Badge>
      ))}
    </span>
  );
}
