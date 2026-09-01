import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { assignTableToWaiter, removeTableAssignment } from "@/server/waiter-assignments";

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const updated = await assignTableToWaiter(ctx.venueId, {
      tableId: body.tableId,
      waiterId: body.waiterId,
      date: new Date(body.date),
      service: body.service,
    });
    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "waiter_not_found" || message === "table_not_found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "waiter_resting") {
      return NextResponse.json(
        { error: message, message: "Questo cameriere è a riposo e non può essere assegnato." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    await removeTableAssignment(ctx.venueId, {
      tableId: body.tableId,
      date: new Date(body.date),
      service: body.service,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
