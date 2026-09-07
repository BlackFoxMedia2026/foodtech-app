import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { setCouponStatus } from "@/server/coupons";

const Body = z.object({ status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const { status } = Body.parse(await req.json());
    const aggiornato = await setCouponStatus(ctx.venueId, params.id, status, { actor: auditActor(ctx, req) });
    return NextResponse.json({ id: aggiornato.id, status: aggiornato.status });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
