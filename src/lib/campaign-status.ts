import type { CampaignStatus } from "@prisma/client";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/**
 * Come si chiama uno stato di campagna, in italiano.
 *
 * L'interfaccia mostrava il valore del database: «DRAFT», «SENT». Il
 * ristoratore non parla enum, e soprattutto «SENT» compariva anche quando
 * l'invio era solo stato *chiesto*. Ora ogni stato dice una cosa diversa —
 * «pronta» non è «in coda», «in coda» non è «in invio» — quindi vanno detti
 * bene, e detti al cliente come li direbbe lui.
 */
export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; tone: Tone; hint?: string }> = {
  DRAFT: { label: "Bozza", tone: "neutral" },
  READY: {
    label: "Pronta",
    tone: "info",
    hint: "Contenuto e destinatari decisi: manca solo il via.",
  },
  SCHEDULED: { label: "Programmata", tone: "info", hint: "Partirà all'ora indicata." },
  QUEUED: {
    label: "In coda",
    tone: "info",
    hint: "Gli invii sono riservati: la partenza è questione di minuti.",
  },
  SENDING: {
    label: "In invio",
    tone: "warning",
    hint: "I messaggi stanno partendo. Puoi chiudere la pagina: l'invio va avanti.",
  },
  SENT: { label: "Inviata", tone: "success" },
  PAUSED: {
    label: "In pausa",
    tone: "warning",
    hint: "L'invio è fermo e riprende da dove era: nessuno riceve due volte.",
  },
  FAILED: { label: "Non riuscita", tone: "danger", hint: "L'invio non è andato a termine." },
  CANCELLED: {
    label: "Annullata",
    tone: "neutral",
    hint: "Annullata prima di partire: gli invii riservati sono tornati disponibili.",
  },
  ARCHIVED: { label: "Archiviata", tone: "neutral" },
};

/**
 * Lo stato **come si può raccontare adesso**, non come sta in colonna.
 *
 * Una campagna programmata veniva consegnata al fornitore e restava
 * «Programmata» per sempre: il giorno dopo la data prevista la pagina diceva
 * ancora «Partirà all'ora indicata», che a quel punto è falso. Il fornitore
 * non ci richiama per dirci che ha spedito, e nessuno metteva mano a quello
 * stato.
 *
 * La correzione non inventa uno stato: **si guarda l'orologio**. Passata
 * l'ora, quella campagna è stata consegnata — questo lo sappiamo, perché
 * l'ordine di invio l'abbiamo dato noi — e l'esito dell'invio no. È esattamente
 * quello che c'è scritto, invece di far finta di uno o dell'altro.
 *
 * Il giorno in cui il fornitore ci dirà «spedita a 142 indirizzi», questo
 * diventerà uno stato vero. Fino ad allora è una deduzione, e si legge come
 * tale.
 */
export function statoCampagna(
  status: CampaignStatus,
  scheduledAt: Date | string | null,
  now: Date = new Date(),
): { label: string; tone: Tone; hint?: string } {
  const base = CAMPAIGN_STATUS[status];
  if (status !== "SCHEDULED" || !scheduledAt) return base;

  const quando = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(quando.getTime()) || quando > now) return base;

  return {
    label: "Consegnata al fornitore",
    tone: "success",
    hint:
      "L'ora è passata: l'invio è stato affidato al fornitore per quel momento. " +
      "Se ha spedito davvero e a quanti, lo dice il pannello del fornitore — a noi non torna indietro.",
  };
}
