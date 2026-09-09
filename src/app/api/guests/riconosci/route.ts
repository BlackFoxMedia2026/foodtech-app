import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { riconosciOspite } from "@/server/guest-match";

/**
 * «Questa persona la conosciamo già?» — mentre si sta scrivendo.
 *
 * Dietro `manage_bookings`: restituisce nome, visite, allergie e assenze di un
 * cliente del locale, ed è esattamente il genere di cosa che non si espone a
 * chi non ha già accesso all'elenco ospiti.
 *
 * Nessun risultato non è un errore: `null` con esito 200. Chi sta digitando un
 * numero nuovo non deve vedere un 404 nella console del browser a ogni cifra.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");
  const email = url.searchParams.get("email");

  try {
    return NextResponse.json(
      { ospite: await riconosciOspite(ctx.venueId, { phone, email }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
