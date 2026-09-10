import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      tone: {
        /* La «strada B», scelta il 10 settembre: ogni tono è una **tinta del
         * tema con il testo crema sopra**, e nessun colore viene da fuori
         * tavolozza. I rapporti sono misurati sul fondo peggiore di una scheda
         * (`#224639`: angolo chiaro del gradiente, velatura bianca inclusa).
         *
         * Le velature stanno solo sui passi della scala di Tailwind (5, 10, 15,
         * 20...): `bg-cream/6` o `bg-accent/22` **non vengono generati** e
         * lasciano il fondo trasparente, senza un errore da nessuna parte.
         *
         * Il crema è il testo di quasi tutti: una tinta non ripete mai il
         * proprio colore nel testo, perché farlo sta sempre sotto soglia
         * (2,6 : 1) — vedi DESIGN.md. */

        /** Il quieto. Il fondo è una velatura DEL COLORE DEL TESTO, quindi il
         * contrasto dipende da ciò che eredita: qui il colore è dichiarato,
         * così è sempre lo stesso. Tenue su tenue/5 → 4,71 : 1. */
        neutral: "border-muted-foreground/25 bg-muted-foreground/5 text-muted-foreground",
        /** Terracotta leggera: «c'è, ma non chiede niente». 7,80 : 1 */
        gold: "border-accent/30 bg-accent/10 text-cream",
        /** Terracotta piena: l'unico tono che **avvisa**. 7,09 : 1 */
        warning: "border-accent/50 bg-accent/20 text-cream",
        /** Il positivo. 6,50 : 1 */
        success: "border-sage/45 bg-sage/20 text-cream",
        /** Il negativo. 8,53 : 1 */
        danger: "border-destructive/50 bg-destructive/25 text-cream",
        /** Informazione neutra, la più silenziosa con il testo pieno. 7,53 : 1 */
        info: "border-cream/20 bg-cream/5 text-cream",
        /** Il neutro solido: più presente di `info` senza essere un colore.
         * 5,12 : 1 */
        carbon: "border-cream/30 bg-cream/20 text-cream",
        /** L'unico tono di materiale, non di stato: la madreperla dei livelli
         * di fedeltà (VIP). Nero su bianco sfumato, 17,4 : 1. Resta fuori
         * tavolozza per scelta — è un materiale, non un significato. */
        pearl: "border-white/60 bg-gradient-to-br from-white to-[#F2F2F2] text-carbon-900 shadow-sm",
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
