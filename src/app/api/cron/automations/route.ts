import { eseguiCron } from "@/lib/cron";
import { enqueueDueAutomations } from "@/server/automations/engine";

/**
 * Mette in coda le automazioni accese, una volta al giorno.
 *
 * Alle 10:00: le automazioni scrivono a clienti, e un'email che arriva alle
 * quattro del mattino sembra spedita da una macchina — perché lo è, ma non
 * deve sembrarlo.
 *
 * Il cron non manda niente: accoda. Il lavoro lo fa `/api/cron/jobs`, con i
 * tentativi e gli errori visibili che ne derivano. Come gli altri, si rifiuta
 * di partire senza CRON_SECRET.
 */
export async function GET(req: Request) {
  return eseguiCron("automations", req, async () => {
    const { accodate } = await enqueueDueAutomations();
    return { accodate };
  });
}
