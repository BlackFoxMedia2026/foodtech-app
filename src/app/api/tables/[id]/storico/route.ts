import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getStoricoTavolo, ProfiloTavoloError } from "@/server/profilo-tavolo";

/**
 * Tutti i servizi passati di un tavolo, a pagine.
 *
 * Il profilo ne porta già i primi tre — è quello che serve per capire se il
 * tavolo gira — e questa rotta serve a chi vuole scorrere indietro. Non è una
 * copia dello storico: è la stessa aggregazione di `Booking` + `Order` +
 * `Payment` + `StaffAssignment`, con un limite più alto.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const url = new URL(req.url);
  try {
    const storico = await getStoricoTavolo(ctx.venueId, params.id, {
      limit: Number(url.searchParams.get("limit") ?? 20),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
    return NextResponse.json(storico, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ProfiloTavoloError) {
      return NextResponse.json({ error: err.code }, { status: 404 });
    }
    return apiErrorResponse(err);
  }
}
