import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { createExperience } from "@/server/experiences";

export async function POST(req: Request) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const creata = await createExperience(ctx.venueId, await req.json(), { actor: auditActor(ctx, req) });
    return NextResponse.json(creata, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
