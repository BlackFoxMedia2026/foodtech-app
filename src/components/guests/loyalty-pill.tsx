import type { LoyaltyTier } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const MAP: Record<LoyaltyTier, { label: string; tone: "neutral" | "info" | "gold" | "carbon" }> = {
  NEW: { label: "Nuovo", tone: "neutral" },
  REGULAR: { label: "Abituale", tone: "info" },
  VIP: { label: "VIP", tone: "gold" },
  AMBASSADOR: { label: "Ambassador", tone: "carbon" },
};

export function LoyaltyPill({ tier }: { tier: LoyaltyTier }) {
  const v = MAP[tier];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
