import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RigaDaSapere } from "@/lib/cosa-sapere";

/**
 * «Cosa sapere di questo ospite», reso allo stesso modo in ogni schermata.
 *
 * Un componente e non tre blocchi copiati: la stessa persona deve leggersi
 * uguale nel Servizio, in Sala e sulla prenotazione — se l'allergia è rossa
 * in un posto e grigia in un altro, la seconda volta non la si vede.
 *
 * Colore **e** icona, come per gli stati dei tavoli: una sala si guarda di
 * sfuggita, con le luci basse, e circa un uomo su dodici non distingue il
 * rosso dal verde.
 */

const STILE = {
  attenzione: { icona: AlertTriangle, classe: "text-accent-strong" },
  bello: { icona: Sparkles, classe: "text-foreground" },
  neutro: { icona: Info, classe: "text-muted-foreground" },
} as const;

/** Quale segnale parla per tutti, quando al posto dei tag c'è un contatore. */
const PRIORITA: RigaDaSapere["tono"][] = ["attenzione", "bello", "neutro"];

export function CosaSapere({
  righe,
  className,
  /** In riga (Servizio, mappa) o una sotto l'altra (dettaglio). */
  disposizione = "riga",
  contatoreSottoMd = false,
}: {
  righe: RigaDaSapere[];
  className?: string;
  disposizione?: "riga" | "colonna";
  /**
   * Sotto `md` i segnali diventano un contatore.
   *
   * Un tag sta su una riga o diventa un contatore: non si spezza. Nella
   * colonna ospite della tabella, a 390 px, «Prima volta qui» andava a capo
   * tre volte — «Prima / volta / qui» — e rompeva il ritmo delle righe proprio
   * dove si scorre di più. Il contatore porta l'icona del segnale che conta
   * di più (l'attenzione prima di tutto) e il numero; il testo intero resta
   * nel `title` e per chi usa un lettore di schermo.
   */
  contatoreSottoMd?: boolean;
}) {
  // Niente da sapere non è «nessuna informazione disponibile»: non si stampa
  // niente, e lo spazio resta a chi ha qualcosa da dire.
  if (righe.length === 0) return null;

  const tutto = righe.map((r) => r.testo).join(" · ");
  const capofila =
    PRIORITA.map((t) => righe.find((r) => r.tono === t)).find(Boolean) ??
    righe[0];
  const StileCapo = STILE[capofila.tono];

  return (
    <>
      {contatoreSottoMd && (
        <span
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium tabular-nums md:hidden",
            StileCapo.classe,
          )}
          title={tutto}
        >
          <StileCapo.icona className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span aria-hidden="true">{righe.length}</span>
          <span className="sr-only">{tutto}</span>
        </span>
      )}
      <div
        className={cn(
          "text-xs",
          disposizione === "riga"
            ? "flex flex-wrap items-center gap-x-3 gap-y-1"
            : "space-y-1",
          contatoreSottoMd && "hidden md:flex",
          className,
        )}
      >
        {righe.map((r) => {
          const stile = STILE[r.tono];
          const Icona = stile.icona;
          return (
            <span
              key={`${r.tono}-${r.testo}`}
              className={cn(
                "flex items-center gap-1 whitespace-nowrap",
                stile.classe,
              )}
              title={r.fonte}
            >
              <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />
              {r.testo}
            </span>
          );
        })}
      </div>
    </>
  );
}
