import { eseguiCron } from "@/lib/cron";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/handlers";

/**
 * Smaltisce la coda. Chiamata da Vercel Cron ogni minuto (vedi vercel.json).
 *
 * Il budget di tempo è più basso del limite della funzione: si smette di
 * prendere lavori nuovi prima di essere interrotti, e quelli rimasti li
 * prende il minuto dopo. Meglio una coda un po' più lenta di un lavoro
 * troncato a metà.
 *
 * Come gli altri cron, **si rifiuta di partire** senza CRON_SECRET invece di
 * restare un endpoint pubblico che chiunque trovi l'URL può innescare.
 */
export async function GET(req: Request) {
  return eseguiCron("jobs", req, async () => {
    const esito = await runDueJobs({ handlers: JOB_HANDLERS });

    return {
      presiInCarico: esito.claimed,
      conclusi: esito.done,
      rimandati: esito.requeued,
      daRiprovare: esito.retried,
      nonRiusciti: esito.failed,
      ripresiDopoInterruzione: esito.recovered,
      tempoEsaurito: esito.budgetExhausted,
    };
  });
}
