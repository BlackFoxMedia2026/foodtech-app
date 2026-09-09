import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { versioneServizio } from "@/server/versione-servizio";

/**
 * «È cambiato qualcosa?» — la domanda piccola che permette di chiedere spesso.
 *
 * Sala, Servizio e Attesa la interrogano ogni cinque secondi e scaricano la
 * fotografia intera **solo quando la risposta cambia**. Prima riscaricavano
 * tutto ogni trenta secondi: più lavoro, e mezzo minuto di ritardo nel momento
 * in cui il ritardo costa — due persone che guardano la stessa sala e vedono
 * due cose diverse.
 *
 * Sta dietro lo stesso guardiano delle altre rotte del servizio: chi non ha
 * accesso a questo locale non sa nemmeno se qualcosa si è mosso.
 */
export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      { v: await versioneServizio(ctx.venueId) },
      // Nessuna cache: è una domanda sul presente, e una risposta di cinque
      // secondi fa non è la risposta.
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
