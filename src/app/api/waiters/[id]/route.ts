import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { deleteWaiter, updateWaiter } from "@/server/waiters";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const updated = await updateWaiter(ctx.venueId, params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  try {
    await deleteWaiter(ctx.venueId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
