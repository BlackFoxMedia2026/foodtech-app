import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { listReviewLinks, saveReviewLinks } from "@/server/reviews";

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await listReviewLinks(ctx.venueId));
}

/**
 * `manage_venue`: dove mandare i clienti contenti è una decisione del locale,
 * non di chi è in sala stasera.
 */
export async function PUT(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const links = await saveReviewLinks(ctx.venueId, await req.json(), auditActor(ctx, req));
    return NextResponse.json(links);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
