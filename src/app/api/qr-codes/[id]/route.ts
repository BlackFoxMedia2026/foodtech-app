import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { deleteQrCode, updateQrCode } from "@/server/qr-codes";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const updated = await updateQrCode(ctx.venueId, params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ error: message }, { status: message === "not_found" ? 404 : 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "edit_marketing")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    await deleteQrCode(ctx.venueId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    return NextResponse.json({ error: message }, { status: message === "not_found" ? 404 : 400 });
  }
}
