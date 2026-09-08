import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { durataConsigliata } from "@/server/durata-consigliata";

/**
 * «Quanto dura una cena così?»
 *
 * Serve al modulo della prenotazione, che la propone già scritta invece di
 * partire dai 105 minuti fissi. Risponde **sempre**: quando non c'è ancora
 * niente da misurare torna la durata predefinita, dicendolo nella
 * spiegazione — così il modulo non deve inventarsi un ripiego suo.
 */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const url = new URL(req.url);
  const partySize = Number(url.searchParams.get("partySize"));
  const quando = url.searchParams.get("startsAt");
  const startsAt = quando ? new Date(quando) : null;

  if (!Number.isFinite(partySize) || partySize < 1 || !startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json(
      { error: "richiesta_non_valida", message: "Servono i coperti e l'orario." },
      { status: 400 },
    );
  }

  return NextResponse.json(await durataConsigliata(ctx.venueId, { partySize, startsAt }));
}
