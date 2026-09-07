import type { LoyaltyTier } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const MAP: Record<LoyaltyTier, { label: string; tone: "neutral" | "gold" | "pearl" | "carbon" } | null> = {
  // NEW e REGULAR non si mostrano più: sono deduzioni, e ora le deduce il
  // profilo dalle prenotazioni vere. La pillola diceva "Nuovo" accanto al tag
  // calcolato "Abituale", per la stessa persona con quattro visite alle spalle.
  NEW: null,
  REGULAR: null,
  VIP: { label: "VIP", tone: "pearl" },
  AMBASSADOR: { label: "Ambassador", tone: "carbon" },
};

/** Il riconoscimento assegnato a mano dal locale, non una deduzione. */
export function LoyaltyPill({ tier }: { tier: LoyaltyTier }) {
  const v = MAP[tier];
  if (!v) return null;
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
