import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { deleteContract, updateContract } from "@/server/staff-contracts";

export async function PATCH(req: Request, { params }: { params: { id: string; contractId: string } }) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const updated = await updateContract(ctx.venueId, params.id, params.contractId, body);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; contractId: string } }) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  try {
    await deleteContract(ctx.venueId, params.id, params.contractId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
