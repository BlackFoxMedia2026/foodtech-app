import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { origineDa } from "@/lib/origine";

import { createQrCode, listQrCodes } from "@/server/qr-codes";

export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const data = await listQrCodes(ctx.venueId, origineDa(req.headers));
  return NextResponse.json(data);
}

/**
 * Crea uno o più codici.
 *
 * Più di uno solo nel caso del pagamento al tavolo, dove ogni tavolo ha il suo
 * segreto e quindi il suo codice: chi ne sceglie dieci fa **un** gesto e ne
 * ottiene dieci, tutti con lo stesso disegno.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const creati = await createQrCode(ctx.venueId, body, origineDa(req.headers));
    return NextResponse.json(creati, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
