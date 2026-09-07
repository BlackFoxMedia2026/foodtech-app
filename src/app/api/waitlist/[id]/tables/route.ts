import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { findTablesForEntry } from "@/server/waitlist";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  // `at` permette di chiedere "chi posso far sedere alle 20:00" invece del
  // solo "adesso": la stessa domanda che si fa un maitre a fine pomeriggio.
  const at = new URL(req.url).searchParams.get("at");
  const now = at ? new Date(at) : undefined;
  if (at && Number.isNaN(now!.getTime())) {
    return NextResponse.json({ error: "invalid_date", message: "Orario non valido." }, { status: 422 });
  }

  try {
    return NextResponse.json(await findTablesForEntry(ctx.venueId, params.id, { now }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
