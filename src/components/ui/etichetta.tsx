import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tre linguaggi visivi per tre cose diverse (§29 del brief).
 *
 * Sulla scheda di un ospite finiscono etichette che sembrano tutte uguali e
 * non lo sono per niente:
 *
 * | | Esempi | Chi lo dice |
 * |---|---|---|
 * | **segnale** | un'allergia, un compleanno, due assenze | un fatto: cambia il servizio adesso |
 * | **manuale** | VIP, giornalista, amico dello chef | una **persona** del locale: è un'opinione |
 * | **calcolata** | abituale, inattivo, preferisce il pranzo | una **formula**: può sbagliarsi |
 *
 * Prima avevano la stessa forma di pillola, e «VIP» — deciso da chi lavora al
 * ristorante — si leggeva identico a «abituale», dedotto da un conteggio di
 * visite con una soglia scelta da noi. Distinguerli non è decorazione: è dire
 * a chi legge **quanto fidarsi**, che è la stessa disciplina del
 * misurato/stimato applicata alle etichette.
 *
 * La differenza è di **forma**, non solo di colore: un segnale è quadrato, un
 * tag è una pillola; il tag manuale è pieno, quello calcolato ha solo il
 * bordo. Si distinguono in una sala con le luci basse e da chi non separa il
 * rosso dal verde.
 *
 * Nelle righe del servizio i segnali continuano a rendersi con `CosaSapere` —
 * icona e colore, senza contenitore — perché lì la riga è **fatta** di
 * segnali e non c'è niente da cui distinguerli; qui invece un segnale sta in
 * mezzo ai tag, e deve battere una pillola piena.
 */
export type LinguaggioEtichetta = "segnale" | "manuale" | "calcolata";

const FORMA: Record<LinguaggioEtichetta, string> = {
  // Quadrato e tinto: la forma che non è una pillola, quindi si vede prima.
  segnale: "rounded-md border border-accent/50 bg-accent/15 px-2 py-0.5 font-medium",
  /*
    Pillola piena: l'ha scritta una persona.

    Il pieno è `bg-secondary` e non `bg-current/15`: su verde scuro il quindici
    per cento del colore del testo non si vede — misurato sulla lista ospiti,
    dove «fedele» sembrava testo normale e non un tag. Un token del tema, non
    una trasparenza, così il pieno resta pieno anche dentro una scheda già
    tinta.
  */
  manuale: "rounded-full border border-transparent bg-secondary px-2.5 py-0.5 font-medium",
  // Pillola vuota: l'ha dedotta una formula. Il bordo senza pieno è
  // volutamente più leggero — pesa meno perché vale meno.
  calcolata: "rounded-full border border-current/30 px-2.5 py-0.5 text-muted-foreground",
};

export function Etichetta({
  linguaggio,
  icona: Icona,
  /** Perché questa etichetta c'è: un'etichetta calcolata senza il perché è un'opinione. */
  perche,
  className,
  children,
}: {
  linguaggio: LinguaggioEtichetta;
  icona?: ComponentType<{ className?: string }>;
  perche?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={perche}
      className={cn("inline-flex items-center gap-1 text-xs", FORMA[linguaggio], className)}
    >
      {Icona && <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
