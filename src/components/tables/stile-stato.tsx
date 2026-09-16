import { Ban, CircleDot, Clock, Receipt, Sparkles, Timer, UtensilsCrossed } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TABLE_LIVE_HINTS, TABLE_LIVE_LABELS, type TableLiveStatus } from "@/lib/table-status";

/**
 * Come si **vede** uno stato di tavolo, una volta per tutto il prodotto.
 *
 * Il vocabolario delle parole stava già in un posto solo (`lib/table-status`,
 * vedi DESIGN.md §12); il vestito no — viveva dentro `room-live-view.tsx`, e
 * quando il pannello del tavolo ha avuto bisogno dello stesso riquadro la
 * scelta era copiarlo. Copiato, «al conto» sarebbe stato terracotta in una
 * schermata e chissà cosa nell'altra al primo ritocco.
 *
 * Colore **e** icona, sempre: una sala si guarda di sfuggita, di lato, con le
 * luci basse, e circa un uomo su dodici non distingue il rosso dal verde.
 */
export const STILE_STATO: Record<TableLiveStatus, { icona: LucideIcon; classe: string; testo: string }> = {
  /**
   * Libero e Prenotato erano lo stesso verde a due opacità: sulla mappa si
   * distinguevano **solo leggendo la parola**, ed è la coppia più frequente
   * della sala. Libero è un buco nel pavimento — nessun riempimento — e
   * prenotato porta un velo chiaro: «questo tavolo è di qualcuno, anche se
   * adesso è vuoto».
   */
  LIBERO: {
    icona: CircleDot,
    classe: "border-dashed border-border/70 bg-transparent text-muted-foreground",
    testo: "text-muted-foreground",
  },
  PRENOTATO: { icona: Clock, classe: "border-cream/40 bg-cream/12 text-foreground", testo: "text-foreground" },
  IN_ARRIVO: { icona: Sparkles, classe: "border-sage bg-sage/25 text-foreground", testo: "text-foreground" },
  OCCUPATO: {
    icona: UtensilsCrossed,
    classe: "border-surface-brown bg-surface-brown text-cream",
    testo: "text-cream",
  },
  CONTO: { icona: Receipt, classe: "border-accent bg-accent/80 text-cream", testo: "text-cream" },
  PULIZIA: {
    icona: Timer,
    classe: "border-dashed border-border-strong bg-secondary/60 text-muted-foreground",
    testo: "text-muted-foreground",
  },
  BLOCCATO: {
    icona: Ban,
    classe: "border-dashed border-border bg-muted/40 text-tertiary-foreground",
    testo: "text-tertiary-foreground",
  },
};

/**
 * La **superficie** del riquadro principale del profilo, per stato.
 *
 * È il pezzo che fa leggere un tavolo senza leggerlo: il colore dello sfondo
 * dice già se c'è gente, se sta per arrivare o se non c'è nessuno, e le parole
 * dentro lo confermano invece di annunciarlo.
 *
 * Sono velature a bassa opacità sul verde del pannello, non tinte piene: il
 * testo crema sopra resta lo stesso testo crema di tutto il prodotto, con lo
 * stesso contrasto. Una campitura piena avrebbe voluto dire un secondo colore
 * di testo per ogni stato, cioè sette coppie da verificare invece di una.
 *
 * Libero e «da riassettare» condividono la superficie più quieta di tutte —
 * incassata, come un posto vuoto — perché sono gli unici due stati in cui la
 * risposta giusta è «non c'è niente da fare qui».
 */
export const SUPERFICIE_STATO: Record<TableLiveStatus, string> = {
  LIBERO: "border-border bg-card-sunken/70",
  PRENOTATO: "border-border-strong bg-secondary/45",
  IN_ARRIVO: "border-sage/40 bg-sage/10",
  OCCUPATO: "border-surface-brown/50 bg-surface-brown/15",
  CONTO: "border-accent/45 bg-accent/12",
  PULIZIA: "border-border bg-card-sunken/70",
  BLOCCATO: "border-border bg-muted/30",
};

/**
 * Lo stato di un tavolo come pillola.
 *
 * `grande` è la misura del pannello, dove lo stato è **la prima cosa che si
 * legge** e ha diritto al suo peso; la misura normale è quella dell'elenco e
 * della legenda, dove convive con altre dieci parole.
 */
export function StatoTavoloBadge({
  stato,
  grande = false,
  className,
}: {
  stato: TableLiveStatus;
  grande?: boolean;
  className?: string;
}) {
  const stile = STILE_STATO[stato];
  const Icona = stile.icona;
  return (
    <span
      title={TABLE_LIVE_HINTS[stato]}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border",
        grande ? "px-3 py-1 text-sm font-medium" : "px-2 py-0.5 text-xs",
        stile.classe,
        className,
      )}
    >
      <Icona className={grande ? "h-4 w-4" : "h-3 w-3"} aria-hidden="true" />
      {TABLE_LIVE_LABELS[stato]}
    </span>
  );
}
