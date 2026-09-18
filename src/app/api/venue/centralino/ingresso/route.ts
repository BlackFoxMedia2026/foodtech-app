import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { salvaIngresso, vistaIngresso } from "@/server/voice/ingresso";

/**
 * Da dove entrano le chiamate: la scatoletta, o la deviazione dall'operatore.
 *
 * **Non chiede la licenza**, ed e voluto. Questa e la prima domanda della
 * procedura di collegamento — prima del codice del locale, prima della chiave
 * — e chiederla accesa vorrebbe dire non poter rispondere alla domanda che
 * viene prima di tutte: *come ci arrivano le telefonate?* Lo stesso motivo per
 * cui la pagina della procedura e protetta da `manage_phone` e non dalla
 * licenza.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await vistaIngresso(ctx.venueId));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(req: Request) {
  const ctx = await requireVenueApi("manage_phone");
  if (!ctx.ok) return ctx.response;
  try {
    const vista = await salvaIngresso(ctx.venueId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(vista);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
