import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor, recordAudit } from "@/server/audit";
import { LicenzaError, richiediFunzioneCentralino } from "@/server/licenza-centralino";
import {
  TelefonoBrowserError,
  credenzialiTelefonoBrowser,
  salvaTelefonoBrowser,
  statoTelefonoBrowser,
} from "@/server/telefono-browser";

/**
 * Il telefono nel browser: i dati per registrarsi, e come si cambiano.
 *
 * Due permessi diversi di proposito:
 *
 *  - **`GET` chiede `manage_bookings`**, cioè chi in quel locale risponde al
 *    telefono. È la rotta che fa uscire la password SIP dal server: non può
 *    chiedere meno, e chiedere `manage_venue` vorrebbe dire che al telefono
 *    risponde solo il titolare.
 *  - **`PATCH` chiede `manage_venue`**: cambiare a quale centralino si collega
 *    il locale è una decisione del titolare, non di chi prende le prenotazioni.
 *
 * E in cima a entrambe la licenza: senza, questi campi non esistono per quel
 * locale, e la rotta non deve nemmeno raccontare che potrebbero esistere.
 */

export const dynamic = "force-dynamic";

const Corpo = z.object({
  server: z.string().max(300).nullish(),
  utente: z.string().max(120).nullish(),
  /** Assente = non cambiarla. `null` = cancellala. */
  password: z.string().max(300).nullish(),
});

export async function GET() {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const cred = await credenzialiTelefonoBrowser(ctx.venueId);
    if (!cred) {
      return apiError(
        404,
        "telefono_non_configurato",
        "Il telefono nel browser non è ancora configurato su questo locale.",
      );
    }
    /* Nessuna cache, a nessun livello: è una credenziale. Un `Cache-Control`
       dimenticato qui la lascerebbe in un proxy. */
    return NextResponse.json(
      {
        server: cred.server,
        utente: cred.utente,
        password: cred.password,
        uri: `sip:${cred.utente}@${new URL(cred.server).hostname}`,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, private" } },
    );
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    await richiediFunzioneCentralino(ctx.venueId, "riconoscimento");
    const corpo = Corpo.parse(await req.json());
    const stato = await salvaTelefonoBrowser(ctx.venueId, corpo);

    /* Nel registro finisce **cosa** è cambiato, non il valore: davanti a «da
       ieri il telefono non squilla» la prima domanda è quando qualcuno ha
       toccato questa configurazione. */
    await recordAudit(auditActor(ctx, req), "venue.centralino_sip_modificato", "venue", ctx.venueId, {
      server: stato.server,
      utente: stato.utente,
      passwordCambiata: corpo.password !== undefined,
      sottoChiave: stato.sottoChiave,
    });

    return NextResponse.json(stato);
  } catch (err) {
    if (err instanceof LicenzaError) {
      return apiError(403, "centralino_non_attivo", "Il telefono non è attivo su questo locale.");
    }
    if (err instanceof TelefonoBrowserError) {
      return apiError(400, "dati_non_validi", err.message);
    }
    return apiErrorResponse(err);
  }
}
