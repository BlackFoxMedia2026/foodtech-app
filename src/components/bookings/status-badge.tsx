import type { BookingStatus, BookingSource } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

type Tono = "neutral" | "gold" | "success" | "success-soft" | "warning" | "danger" | "info";

/**
 * I sette stati, in ordine di come una prenotazione li attraversa.
 *
 * `conclusa` non è un dato in più: è il pallino della pillola. Pieno finché la
 * prenotazione è viva, ad anello quando è finita — con sette tinte del tema
 * («strada B») il fondo da solo distingue poco, e il pallino dice a colpo
 * d'occhio se quella riga è ancora roba di stasera.
 */
const STATUS: Record<BookingStatus, { label: string; tone: Tono; conclusa?: true }> = {
  PENDING: { label: "In attesa", tone: "warning" },
  CONFIRMED: { label: "Confermata", tone: "info" },
  ARRIVED: { label: "Arrivato", tone: "gold" },
  SEATED: { label: "Seduto", tone: "success-soft" },
  COMPLETED: { label: "Completata", tone: "success", conclusa: true },
  CANCELLED: { label: "Cancellata", tone: "neutral", conclusa: true },
  NO_SHOW: { label: "No-show", tone: "danger", conclusa: true },
};

const SOURCE: Record<BookingSource, string> = {
  WIDGET: "Sito",
  PHONE: "Telefono",
  WALK_IN: "Walk-in",
  GOOGLE: "Google",
  SOCIAL: "Social",
  CONCIERGE: "Concierge",
  EVENT: "Evento",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone} className={s.conclusa ? "badge-dot badge-dot-anello" : "badge-dot"}>
      {s.label}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: BookingSource }) {
  return <Badge tone="neutral">{SOURCE[source]}</Badge>;
}

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<BookingStatus, string>;
