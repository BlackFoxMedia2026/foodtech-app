import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { origineDa } from "@/lib/origine";
import { duplicaQrCode } from "@/server/qr-codes";

/**
 * Lo stesso codice, con un nome che dice che è una copia.
 *
 * Serve a chi ha passato dieci minuti sui colori e poi deve fare la stessa
 * cosa per un'altra sala: duplicare e cambiare due campi è il gesto, non
 * rifare tutto.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const copia = await duplicaQrCode(ctx.venueId, params.id, origineDa(req.headers));
    return NextResponse.json(copia, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
