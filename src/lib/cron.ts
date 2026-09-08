import { NextResponse } from "next/server";
import { conMisura, logAttenzione, logErrore } from "./observability";

/**
 * Un posto solo per i lavori pianificati.
 *
 * I cinque cron ripetevano le stesse otto righe di autorizzazione, e **nessuno
 * aveva un `try`**: se uno esplodeva, Vercel registrava un 500 e nessuno
 * sapeva quale dei cinque fosse, né da quanto tempo succedeva. Un lavoro che
 * gira ogni minuto e fallisce da tre giorni è il tipo di guasto che si scopre
 * quando un cliente non ha ricevuto il promemoria.
 *
 * Qui dentro:
 *
 * - **il segreto**, come prima: senza `CRON_SECRET` non si parte. È la
 *   differenza fra un lavoro pianificato e un endpoint pubblico che manda
 *   email;
 * - **la misura**: ogni esecuzione lascia una riga con la durata e l'esito, e
 *   «è lento» smette di essere un'impressione;
 * - **l'errore in chiaro nei log e generico nella risposta**: chi chiama non
 *   deve leggere una traccia di stack, e chi cerca nei log deve trovare
 *   `cron.<nome>.fallito`.
 */
export async function eseguiCron<T extends object>(
  nome: string,
  req: Request,
  lavoro: () => Promise<T>,
): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Non è un errore del lavoro: è una configurazione mancante, e va detto
    // in modo diverso perché si risolve in un altro posto.
    logAttenzione("cron.non_configurato", { cron: nome });
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    // Vale la pena vederlo: qualcuno che chiama i cron senza il segreto è
    // rumore oppure è qualcuno che prova.
    logAttenzione("cron.non_autorizzato", { cron: nome });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const esito = await conMisura(`cron.${nome}`, { cron: nome }, lavoro);
    return NextResponse.json(esito);
  } catch (err) {
    logErrore(`cron.${nome}.non_riuscito`, err, { cron: nome });
    return NextResponse.json({ error: "cron_failed", cron: nome }, { status: 500 });
  }
}
