import { eseguiCron } from "@/lib/cron";
import { sendDueReminders } from "@/server/reminders";

/**
 * Manda i promemoria dovuti. Chiamata da Vercel Cron ogni quarto d'ora (vedi
 * vercel.json): la finestra di invio è più larga dell'intervallo, così una
 * prenotazione non può cadere fra due passaggi.
 *
 * Come il cron dei contratti: **si rifiuta di partire** se CRON_SECRET non è
 * configurato, invece di restare un endpoint pubblico che chiunque trovi
 * l'URL può innescare.
 */
export async function GET(req: Request) {
  return eseguiCron("booking-reminders", req, async () => {
    const risultati = await sendDueReminders();
    const per = (esito: string) => risultati.filter((r) => r.outcome === esito).length;

    return {
      totale: risultati.length,
      inCoda: per("queued"),
      senzaContatto: per("no_address"),
      canaleAssente: per("no_channel"),
      giaMandati: per("duplicate"),
    };
  });
}
