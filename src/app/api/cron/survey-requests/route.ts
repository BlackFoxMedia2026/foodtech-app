import { eseguiCron } from "@/lib/cron";
import { sendDueSurveyRequests } from "@/server/surveys";

/**
 * Chiede «com'è andata?» a chi è venuto ieri.
 *
 * Una volta al giorno basta: la domanda ha senso qualche ora dopo la visita,
 * non al minuto. Come gli altri cron, si rifiuta di partire senza CRON_SECRET.
 */
export async function GET(req: Request) {
  return eseguiCron("survey-requests", req, async () => {
    const risultati = await sendDueSurveyRequests();
    const per = (esito: string) => risultati.filter((r) => r.outcome === esito).length;

    return {
      totale: risultati.length,
      inCoda: per("queued"),
      senzaContatto: per("no_address"),
      canaleAssente: per("no_channel"),
      giaChiesti: per("already_asked"),
    };
  });
}
