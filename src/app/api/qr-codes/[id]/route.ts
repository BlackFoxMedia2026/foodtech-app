import { NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { origineDa } from "@/lib/origine";
import { deleteQrCode, updateQrCode } from "@/server/qr-codes";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const aggiornato = await updateQrCode(ctx.venueId, params.id, body, origineDa(req.headers));
    return NextResponse.json(aggiornato);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("edit_marketing");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteQrCode(ctx.venueId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
