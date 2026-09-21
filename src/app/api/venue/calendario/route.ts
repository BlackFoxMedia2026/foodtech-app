import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { linkCalendario, rigeneraLinkCalendario, vistaCalendario } from "@/server/calendario";

/**
 * Il link del calendario: leggerlo, crearlo, rigenerarlo.
 *
 * `GET` non crea niente — dice solo se esiste — perché aprire le Impostazioni
 * non è chiedere un indirizzo condivisibile. Il segreto nasce con il `POST`,
 * cioè quando qualcuno lo chiede davvero.
 *
 * Serve `manage_venue`: chi crea questo indirizzo crea un **accesso permanente**
 * alle prenotazioni del locale, che vale finché non lo si rigenera. Non è un
 * gesto da cameriere, ed è per questo che non basta `manage_bookings`.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await vistaCalendario(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const corpo = await req.json().catch(() => ({}));
    const attore = auditActor(ctx, req);
    /* Rigenerare è un'azione distinta e dichiarata: un `POST` che a volte crea
       e a volte cambia il segreto farebbe revocare un calendario per sbaglio a
       chi voleva solo rileggere l'indirizzo. */
    const esito =
      (corpo as { rigenera?: boolean })?.rigenera === true
        ? await rigeneraLinkCalendario(ctx.venueId, attore)
        : await linkCalendario(ctx.venueId, attore);
    return NextResponse.json({ attivo: true, ...esito });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
