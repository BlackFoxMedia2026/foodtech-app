import { deliverQueuedMessage } from "@/server/messaging/send";
import { runCampaignSendJob } from "@/server/campaigns";
import type { JobHandlers } from "./queue";

/**
 * Chi sa fare cosa.
 *
 * Il registro sta qui e non nella coda: la coda non deve sapere niente del
 * dominio, e i test possono farla girare con gestori finti.
 *
 * Il numero massimo di tentativi lo decide chi mette in coda. Qui conta solo
 * una cosa: un gestore che solleva un errore chiede alla coda di riprovare, un
 * gestore che restituisce `{ again: true }` chiede solo un altro giro.
 */
export const JOB_HANDLERS: JobHandlers = {
  /** Un messaggio a un ospite: promemoria, richiesta di parere, conferma. */
  "message.send": async (payload, job) => {
    // Il gestore sa se è l'ultimo tentativo, e solo allora la riga di registro
    // diventa «non riuscito»: prima resta in coda, che è la verità.
    await deliverQueuedMessage(payload, { finalAttempt: job.attempts >= job.maxAttempts });
  },

  /** L'invio di una campagna: sincronizza i contatti a lotti, poi consegna. */
  "campaign.send": (payload, job) => runCampaignSendJob(payload, job),
};
