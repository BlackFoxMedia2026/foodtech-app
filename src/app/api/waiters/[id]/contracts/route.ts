import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import { createContract, listContracts } from "@/server/staff-contracts";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_contracts")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const data = await listContracts(ctx.venueId, params.id);
  return NextResponse.json(data);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_contracts")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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
