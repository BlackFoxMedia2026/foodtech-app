import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { reorder } from "@/server/menu";

const Body = z.object({
  cosa: z.enum(["categorie", "piatti"]),
  /** L'elenco completo, nell'ordine voluto. */
  ids: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const { cosa, ids } = Body.parse(await req.json());
    return NextResponse.json(await reorder(ctx.venueId, cosa, ids, { actor: auditActor(ctx, req) }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
