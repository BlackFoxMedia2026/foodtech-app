import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      tone: {
        /* La «strada B», scelta il 10 settembre: ogni tono è una **tinta del
         * tema con il testo crema sopra**, e nessuno viene da fuori tavolozza.
         * I rapporti sono misurati sul fondo peggiore di una scheda
         * (`#224639`: angolo chiaro del gradiente, velatura bianca inclusa).
         *
         * Le velature stanno solo sui passi della scala di Tailwind (5, 10,
         * 15, 20...): `bg-cream/6` o `bg-accent/22` **non vengono generati** e
         * lasciano il fondo trasparente, senza un errore da nessuna parte.
         *
         * E i sette toni devono distinguersi **a colpo d'occhio**, non solo
         * superare la soglia: la prima versione li aveva tutti fra il 5% e il
         * 20% e quattro pillole erano indistinguibili. Il contrasto misura se
         * il testo si legge, non se lo stato si riconosce. */

        /** Spento: chiuso, e non c'è niente da fare. Il fondo è una velatura
         * DEL COLORE DEL TESTO, quindi il colore è dichiarato per non dipendere
         * da ciò che eredita. Tenue su tenue/5 → 4,71 : 1. */
        neutral: "border-muted-foreground/25 bg-muted-foreground/5 text-muted-foreground",
        /** Il più silenzioso: solo un contorno, nessun fondo. 8,54 : 1 */
        info: "border-cream/25 text-cream",
        /** Terracotta appena accennata: «c'è, ma non chiede niente». 7,80 : 1 */
        gold: "border-accent/30 bg-accent/10 text-cream",
        /** Terracotta piena: l'unico tono che **avvisa**. 5,12 : 1 */
        warning: "border-accent/60 bg-accent/50 text-cream",
        /** Verde leggero: sta andando bene, adesso. 6,50 : 1 */
        "success-soft": "border-sage/40 bg-sage/20 text-cream",
        /** Verde pieno: è andata bene. 4,94 : 1 */
        success: "border-sage/60 bg-sage/40 text-cream",
        /** È andata male. 8,53 : 1 */
        danger: "border-destructive/50 bg-destructive/25 text-cream",
        /* I due toni di **materiale**, non di stato: sono i livelli di fedeltà,
         * la madreperla e la carta nera. Stanno fuori tavolozza per scelta —
         * dicono di che cosa è fatta la tessera, non che cosa sta accadendo. */
        /** Madreperla (VIP). Nero su bianco sfumato, 17,4 : 1 */
        pearl: "border-white/60 bg-gradient-to-br from-white to-[#F2F2F2] text-carbon-900 shadow-sm",
        /** Carta nera (Ambassador). 17,2 : 1 */
        carbon: "border-carbon-700 bg-carbon-800 text-sand-50",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
