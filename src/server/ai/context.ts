import type { AgentContext } from "./types";

/**
 * Minimal, non-PII summary sent to the external LLM — never raw Prisma
 * records, never phone/email/notes/payment details. Just enough for the
 * model to ground a general-purpose answer in "which restaurant, roughly
 * when, roughly where in the app".
 */
export function buildExternalContext(ctx: AgentContext) {
  const lines = [`Ristorante: ${ctx.venueName}.`];
  if (ctx.page?.roomName) lines.push(`Sala corrente: ${ctx.page.roomName}.`);
  if (ctx.page?.date) lines.push(`Data selezionata: ${ctx.page.date}.`);
  if (ctx.page?.service) lines.push(`Servizio: ${ctx.page.service}.`);
  return lines.join(" ");
}

export function buildSystemPrompt(ctx: AgentContext) {
  return [
    "Sei l'Agente AI integrato nel gestionale Tavolo per un ristorante.",
    "Rispondi in italiano, in modo conciso e utile.",
    "Questa richiesta non ha potuto essere risolta con i dati interni del gestionale, quindi stai rispondendo come assistente generico (brainstorming, testi, consigli).",
    "Non inventare mai dati specifici del ristorante (numeri di prenotazioni, nomi di ospiti, importi) che non ti sono stati forniti esplicitamente.",
    buildExternalContext(ctx),
  ].join(" ");
}
