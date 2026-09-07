import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { createContract, listContracts } from "@/server/staff-contracts";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  const data = await listContracts(ctx.venueId, params.id);
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_contracts");
  if (!ctx.ok) return ctx.response;
  try {
    const body = await req.json();
    const created = await createContract(ctx.venueId, params.id, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "not_found") return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
