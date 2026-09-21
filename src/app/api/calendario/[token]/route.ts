import { feedCalendario } from "@/server/calendario";

/**
 * `GET /api/calendario/<segreto>` — le prenotazioni come calendario.
 *
 * Nessuna sessione: un calendario lo chiede il telefono, non una persona, e
 * nessuna applicazione di calendario sa fare l'accesso. **L'indirizzo è la
 * credenziale**, ed è per questo che il segreto è lungo e si può rigenerare
 * dalle Impostazioni.
 *
 * Risponde **404** a un segreto sconosciuto e non 401: un 401 confermerebbe
 * che a quell'indirizzo c'è qualcosa da indovinare.
 *
 * `text/calendar` e non un allegato: chi apre l'indirizzo sul telefono deve
 * vedere la proposta «aggiungi questo calendario», non scaricare un file che
 * poi deve cercare fra i download.
 */

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const ical = await feedCalendario(params.token);
  if (!ical) return new Response("not found", { status: 404 });

  return new Response(ical, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      /* Niente cache intermedia: il contenuto dipende dal segreto
         nell'indirizzo, e una copia condivisa servirebbe le prenotazioni di un
         locale a un altro. */
      "cache-control": "private, no-store",
    },
  });
}
