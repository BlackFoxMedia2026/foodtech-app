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
  attenzione: { icona: AlertTriangle, classe: "text-accent" },
  bello: { icona: Sparkles, classe: "text-foreground" },
  neutro: { icona: Info, classe: "text-muted-foreground" },
} as const;

export function CosaSapere({
  righe,
  className,
  /** In riga (Servizio, mappa) o una sotto l'altra (dettaglio). */
  disposizione = "riga",
}: {
  righe: RigaDaSapere[];
  className?: string;
  disposizione?: "riga" | "colonna";
}) {
  // Niente da sapere non è «nessuna informazione disponibile»: non si stampa
  // niente, e lo spazio resta a chi ha qualcosa da dire.
  if (righe.length === 0) return null;

  return (
    <div
      className={cn(
        "text-xs",
        disposizione === "riga" ? "flex flex-wrap items-center gap-x-3 gap-y-1" : "space-y-1",
        className,
      )}
    >
      {righe.map((r) => {
        const stile = STILE[r.tono];
        const Icona = stile.icona;
        return (
          <span key={`${r.tono}-${r.testo}`} className={cn("flex items-center gap-1", stile.classe)} title={r.fonte}>
            <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />
            {r.testo}
          </span>
        );
      })}
    </div>
  );
}
