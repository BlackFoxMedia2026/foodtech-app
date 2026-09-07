import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { closeWaitlistEntry } from "@/server/waitlist";

const AMMESSI = ["LEFT", "CANCELLED", "DECLINED", "EXPIRED", "NO_SHOW"] as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!AMMESSI.includes(status)) {
    return apiError(422, "invalid_status", "Motivo di uscita non valido.", { ammessi: AMMESSI });
  }
  try {
    return NextResponse.json(await closeWaitlistEntry(ctx.venueId, params.id, status, auditActor(ctx, req)));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
