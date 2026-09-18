import type { BookingStatus, BookingSource } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

export type Tono = "neutral" | "gold" | "success" | "success-soft" | "warning" | "danger" | "info";

/**
 * I sette stati, in ordine di come una prenotazione li attraversa.
 *
 * `conclusa` non è un dato in più: è il pallino della pillola. Pieno finché la
 * prenotazione è viva, ad anello quando è finita — con sette tinte del tema
 * («strada B») il fondo da solo distingue poco, e il pallino dice a colpo
 * d'occhio se quella riga è ancora roba di stasera.
 */
export const STATUS: Record<BookingStatus, { label: string; tone: Tono; conclusa?: true }> = {
  PENDING: { label: "In attesa", tone: "warning" },
  CONFIRMED: { label: "Confermata", tone: "info" },
  ARRIVED: { label: "Arrivato", tone: "gold" },
  SEATED: { label: "Seduto", tone: "success-soft" },
  COMPLETED: { label: "Completata", tone: "success", conclusa: true },
  CANCELLED: { label: "Cancellata", tone: "neutral", conclusa: true },
  NO_SHOW: { label: "No-show", tone: "danger", conclusa: true },
};

/**
 * Il **flusso** del servizio, e i due modi in cui una prenotazione ne esce.
 *
 * Non è una riscrittura di `STATI`: è la stessa sequenza, dichiarata in due
 * pezzi perché il menu dello stato li tratta in modo diverso. I cinque
 * operativi hanno una progressione — si può dire «a che punto siamo» e qual è
 * il passo successivo — mentre cancellata e no-show non sono un avanzamento:
 * sono l'uscita, e stanno sotto una riga di separazione.
 */
export const STATI_OPERATIVI: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "ARRIVED",
  "SEATED",
  "COMPLETED",
];

export const STATI_NEGATIVI: BookingStatus[] = ["CANCELLED", "NO_SHOW"];

/** I sette stati in un elenco solo, nell'ordine in cui si attraversano. */
export const STATI: BookingStatus[] = [...STATI_OPERATIVI, ...STATI_NEGATIVI];

const SOURCE: Record<BookingSource, string> = {
  WIDGET: "Sito",
  /* «Telefono» per entrambe, e non «Voice» per una: per il ristoratore sono
     la stessa cosa — una prenotazione arrivata per telefono. La differenza fra
     `PHONE` (scritta a mano da chi ha risposto) e `VOICE` (nata dentro Tavolo
     Voice) serve a noi nelle analitiche, non a lui in un elenco. */
  PHONE: "Telefono",
  VOICE: "Telefono",
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

/** La provenienza detta come si dice, senza la pillola. */
export function etichettaFonte(source: BookingSource): string {
  return SOURCE[source];
}

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<BookingStatus, string>;
