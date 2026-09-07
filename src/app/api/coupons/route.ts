import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { createCoupon } from "@/server/coupons";

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const creato = await createCoupon(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) });
    return NextResponse.json(creato, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
