import { NextResponse } from "next/server";
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
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET non configurato — non eseguo booking-reminders");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const risultati = await sendDueReminders();
  const per = (esito: string) => risultati.filter((r) => r.outcome === esito).length;

  return NextResponse.json({
    totale: risultati.length,
    inCoda: per("queued"),
    senzaContatto: per("no_address"),
    canaleAssente: per("no_channel"),
    giaMandati: per("duplicate"),
  });
}
