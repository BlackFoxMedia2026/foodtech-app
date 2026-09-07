import type { CampaignStatus } from "@prisma/client";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * Come si chiama uno stato di campagna, in italiano.
 *
 * L'interfaccia mostrava il valore del database: «DRAFT», «SENT». Il
 * ristoratore non parla enum, e soprattutto «SENT» compariva anche quando
 * l'invio era solo stato *chiesto*. Ora gli stati sono sei e ognuno dice una
 * cosa diversa, quindi vanno detti bene.
 */
export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone; hint?: string }> = {
  DRAFT: { label: "Bozza", tone: "neutral" },
  SCHEDULED: { label: "Programmata", tone: "info", hint: "Partirà all'ora indicata." },
  SENDING: {
    label: "In invio",
    tone: "warning",
    hint: "Stiamo preparando i destinatari. Ci vuole qualche minuto, e puoi chiudere la pagina.",
  },
  SENT: { label: "Inviata", tone: "success" },
  FAILED: { label: "Non riuscita", tone: "danger", hint: "L'invio non è andato a termine." },
  ARCHIVED: { label: "Archiviata", tone: "neutral" },
};
