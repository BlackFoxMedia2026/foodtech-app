import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { findTablesForWalkIn } from "@/server/walk-in";

/** I tavoli liberi adesso (o a un orario dato) per un gruppo di N persone. */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const url = new URL(req.url);
  const partySize = Number(url.searchParams.get("partySize"));
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) {
    return apiError(422, "invalid_party_size", "Indica quante persone sono, da 1 a 50.");
  }

  const at = url.searchParams.get("at");
  const now = at ? new Date(at) : undefined;
  if (at && Number.isNaN(now!.getTime())) {
    return apiError(422, "invalid_date", "Orario non valido.");
  }

  try {
    return NextResponse.json(await findTablesForWalkIn(ctx.venueId, partySize, { now }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
