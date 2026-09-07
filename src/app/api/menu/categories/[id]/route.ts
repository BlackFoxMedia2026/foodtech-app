import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { deleteCategory, updateCategory } from "@/server/menu";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      await updateCategory(ctx.venueId, params.id, await req.json(), { actor: auditActor(ctx, req) }),
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await deleteCategory(ctx.venueId, params.id, { actor: auditActor(ctx, req) }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
