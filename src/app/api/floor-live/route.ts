import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { getFloorLive } from "@/server/floor-live";

/** Lo stato vivo dei tavoli, per l'aggiornamento periodico della sala. */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const roomId = new URL(req.url).searchParams.get("room");
  try {
    return NextResponse.json(await getFloorLive(ctx.venueId, { roomId }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
