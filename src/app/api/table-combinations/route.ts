import { NextResponse } from "next/server";
import { z } from "zod";
import { auditActor, recordAudit } from "@/server/audit";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { creaUnione, elencaUnioni, UnioneError } from "@/server/unioni-tavoli";

const Body = z.object({
  roomId: z.string().min(1),
  tableIds: z.array(z.string().min(1)).min(2).max(8),
  label: z.string().max(60).nullable().optional(),
});

/** Le unioni previste del locale; con `?roomId=` solo quelle di una sala. */
export async function GET(req: Request) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const roomId = new URL(req.url).searchParams.get("roomId") ?? undefined;
  return NextResponse.json(await elencaUnioni(ctx.venueId, roomId));
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const unione = await creaUnione(ctx.venueId, Body.parse(await req.json()));
    await recordAudit(auditActor(ctx, req), "table_combination.create", "table_combination", unione.id, {
      tavoli: unione.nomi,
      posti: unione.posti,
    });
    return NextResponse.json(unione, { status: 201 });
  } catch (err) {
    if (err instanceof UnioneError) return apiError(err.status, err.code, err.message);
    return apiErrorResponse(err);
  }
}
