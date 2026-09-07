import { NextResponse } from "next/server";
import { sendDueSurveyRequests } from "@/server/surveys";

/**
 * Chiede «com'è andata?» a chi è venuto ieri.
 *
 * Una volta al giorno basta: la domanda ha senso qualche ora dopo la visita,
 * non al minuto. Come gli altri cron, si rifiuta di partire senza CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET non configurato — non eseguo survey-requests");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const risultati = await sendDueSurveyRequests();
  const per = (esito: string) => risultati.filter((r) => r.outcome === esito).length;

  return NextResponse.json({
    totale: risultati.length,
    inviati: per("sent"),
    senzaContatto: per("no_address"),
    canaleAssente: per("no_channel"),
    errori: per("error"),
  });
}
