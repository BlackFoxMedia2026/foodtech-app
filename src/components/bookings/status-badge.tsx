import type { BookingStatus, BookingSource } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const STATUS: Record<BookingStatus, { label: string; tone: "neutral" | "gold" | "success" | "warning" | "danger" | "info" | "carbon" }> = {
  CONFIRMED: { label: "Confermata", tone: "info" },
  PENDING: { label: "In attesa", tone: "warning" },
  ARRIVED: { label: "Arrivato", tone: "gold" },
  SEATED: { label: "Seduto", tone: "carbon" },
  COMPLETED: { label: "Completata", tone: "success" },
  CANCELLED: { label: "Cancellata", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "danger" },
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
    <Badge tone={s.tone} className="badge-dot">
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
