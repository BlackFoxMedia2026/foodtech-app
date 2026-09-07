import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getServiceSnapshot } from "@/server/service";

/** La fotografia del servizio, per l'aggiornamento periodico della schermata. */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const finestra = Number(new URL(req.url).searchParams.get("window") ?? "60");
  const nextWindowMin = [30, 60, 90].includes(finestra) ? finestra : 60;

  try {
    return NextResponse.json(await getServiceSnapshot(ctx.venueId, { nextWindowMin }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
