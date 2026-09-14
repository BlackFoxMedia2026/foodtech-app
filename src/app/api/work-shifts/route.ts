import { NextResponse } from "next/server";
import { auditActor } from "@/server/audit";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { rispostaErroreTurno } from "@/lib/work-shift-errors";
import { lunediDi } from "@/lib/turni";
import { createWorkShift, listShiftsForWeek, WorkShiftError } from "@/server/work-shifts";

/** I turni di una settimana. `?dal=YYYY-MM-DD`, riportato al suo lunedì. */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const dal = new URL(req.url).searchParams.get("dal");
  if (!dal || !/^\d{4}-\d{2}-\d{2}$/.test(dal)) {
    return apiError(400, "invalid_date", "Serve un giorno nel formato AAAA-MM-GG.");
  }
  return NextResponse.json(await listShiftsForWeek(ctx.venueId, lunediDi(dal)));
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_shifts");
  if (!ctx.ok) return ctx.response;
  try {
    const creato = await createWorkShift(ctx.venueId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(creato, { status: 201 });
  } catch (err) {
    if (err instanceof WorkShiftError) return rispostaErroreTurno(err);
    return apiErrorResponse(err);
  }
}
