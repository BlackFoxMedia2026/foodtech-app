import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { apriRichiestaEvento } from "@/server/eventi";

/**
 * Una richiesta di evento aperta a mano.
 *
 * Chi risponde al telefono in sala la scrive qui: nome, quante persone, quando
 * (o «un sabato di dicembre», che è come si dice davvero), e cosa ha chiesto.
 *
 * `manage_bookings` e non `manage_venue`: è il gesto di chi risponde al
 * telefono, non di chi configura il locale. Quella telefonata arriva mentre il
 * servizio è aperto, e dover chiamare il manager per scriverla vorrebbe dire
 * perderla.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const esito = await apriRichiestaEvento(ctx.venueId, await req.json(), {
      actor: auditActor(ctx, req),
      da: "sala",
    });
    return NextResponse.json(esito, { status: esito.giaAperta ? 200 : 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
