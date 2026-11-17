import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { aggiornaBozza, eliminaBozza } from "@/server/staff-bozze";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await aggiornaBozza(ctx.venueId, params.id, await req.json()));
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_staff");
  if (!ctx.ok) return ctx.response;
  await eliminaBozza(ctx.venueId, params.id);
  return new NextResponse(null, { status: 204 });
}
