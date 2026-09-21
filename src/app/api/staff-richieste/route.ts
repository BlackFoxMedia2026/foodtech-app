import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { RichiestaError, creaRichiesta, daDecidere } from "@/server/staff-richieste";

/**
 * Le richieste del personale: ferie, permessi, cambi turno.
 *
 * `manage_shifts` per leggerle e crearle: è la stessa capacità che serve a
 * spostare un turno, perché **approvare una ferie è spostare i turni** di
 * quella settimana. Chi non può toccare i turni non deve nemmeno vedere chi ha
 * chiesto cosa — sono dati del personale.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("manage_shifts");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json({ richieste: await daDecidere(ctx.venueId) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_shifts");
  if (!ctx.ok) return ctx.response;
  try {
    const creata = await creaRichiesta(ctx.venueId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(creata, { status: 201 });
  } catch (err) {
    if (err instanceof RichiestaError) return messaggio(err);
    return apiErrorResponse(err);
  }
}

export function messaggio(err: RichiestaError) {
  const testi: Record<RichiestaError["code"], [number, string]> = {
    non_trovata: [404, "Questa richiesta non esiste."],
    gia_decisa: [409, "Questa richiesta è già stata decisa da qualcun altro. Ricarica la pagina."],
    persona_di_altro_locale: [404, "Questa persona non è di questo locale."],
    sovrapposta: [
      409,
      "C'è già una richiesta dello stesso tipo, ancora da decidere, che copre quei giorni.",
    ],
  };
  const [stato, testo] = testi[err.code];
  return apiError(stato, err.code, testo);
}
