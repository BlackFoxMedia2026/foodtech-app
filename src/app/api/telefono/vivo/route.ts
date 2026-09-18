import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { statoCentralino } from "@/server/licenza-centralino";
import { statoVivoTelefono, VUOTO } from "@/server/telefono-vivo";

/**
 * Cosa chiede di fare il telefono adesso: la risposta per il guscio.
 *
 * Piccola di proposito. La interroga **ogni pagina** del gestionale, e
 * riusare la fotografia del servizio vorrebbe dire pagare prenotazioni,
 * tavoli, coda e conti per sapere se squilla il telefono.
 *
 * Su un locale senza telefono risponde **vuoto e con 200**, non con un errore:
 * per chi guarda non c'è niente da fare in entrambi i casi, e un 403 qui
 * costringerebbe il guscio a distinguere due silenzi identici.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  try {
    const centralino = await statoCentralino(ctx.venueId);
    if (!centralino.attivo) {
      return NextResponse.json(VUOTO, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(await statoVivoTelefono(ctx.venueId), {
      // Una domanda sul presente: una risposta di cinque secondi fa non è la
      // risposta.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
