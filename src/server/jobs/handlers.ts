import { z } from "zod";
import { deliverQueuedMessage } from "@/server/messaging/send";
import { runCampaignSendJob } from "@/server/campaigns";
import { eseguiInvioDem } from "@/server/dem/invio";
import { runAutomation } from "@/server/automations/engine";
import { AUTOMATION_KEYS } from "@/server/automations/catalogue";
import { lavoroSincronizzazione } from "@/server/integrations/sync";
import { lavoroWebhook } from "@/server/integrations/webhooks";
import { lavoroOrdine } from "@/server/integrations/ordini";
import type { JobHandlers } from "./queue";

const AutomationRunPayload = z.object({
  venueId: z.string(),
  key: z.enum(AUTOMATION_KEYS),
});

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

  /**
   * L'invio di una campagna **fatto da noi**: un messaggio per destinatario, a
   * lotti, con la quota che scende mentre si invia. È la strada normale.
   */
  "dem.campaign.send": (payload, job) => eseguiInvioDem(payload, job),

  /**
   * La vecchia strada: si consegna l'intera campagna a un fornitore esterno,
   * che la manda a una lista sua.
   *
   * Resta per le installazioni in cui l'invio con dominio proprio non è ancora
   * acceso, e per le campagne già in coda quando lo si accende — una riga in
   * coda non deve smettere di avere un gestore perché nel frattempo abbiamo
   * cambiato modo di spedire.
   */
  "campaign.send": (payload, job) => runCampaignSendJob(payload, job),

  /**
   * Un'automazione per un locale: capisce chi tocca oggi e mette in coda i
   * messaggi. Non consegna niente da sé — i messaggi che crea tornano in
   * questa stessa coda come `message.send`.
   */
  "automation.run": async (payload) => {
    const { venueId, key } = AutomationRunPayload.parse(payload);
    await runAutomation(venueId, key);
  },

  /**
   * Una sincronizzazione di un'integrazione (cassa, portale, …): manuale,
   * programmata, dopo l'attivazione, o riprovata. Vedi
   * `server/integrations/sync.ts`.
   */
  "integration.sync": (payload, job) => lavoroSincronizzazione(payload, job),

  /** Un evento di un fornitore che non si è riusciti a lavorare al primo colpo. */
  "integration.webhook": (payload) => lavoroWebhook(payload),

  /**
   * Un ordine rimasto in attesa perché la cassa non rispondeva
   * (`PENDING_SYNC`): si riprova finché non arriva, senza mai crearne due.
   * Vedi `server/integrations/ordini.ts`.
   */
  "integration.order": (payload, job) => lavoroOrdine(payload, job),
};
