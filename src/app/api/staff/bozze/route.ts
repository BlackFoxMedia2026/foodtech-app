import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { creaBozza, listBozze } from "@/server/staff-bozze";

/** Le registrazioni di «Nuova persona» salvate a metà. */
export async function GET() {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  return NextResponse.json({ bozze: await listBozze(ctx.venueId) });
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    const bozza = await creaBozza(ctx.venueId, await req.json(), ctx.userId ?? null);
    return NextResponse.json(bozza, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
