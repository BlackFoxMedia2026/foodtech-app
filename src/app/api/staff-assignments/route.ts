import { NextResponse } from "next/server";
import { can, getActiveVenue } from "@/lib/tenant";
import {
  StaffAssignmentError,
  listStaffAssignmentsForTable,
  removeTableStaffAssignment,
  upsertTableStaffAssignment,
} from "@/server/staff-assignments";

const ERROR_MESSAGES: Record<StaffAssignmentError["code"], string> = {
  waiter_not_found: "Cameriere non trovato.",
  table_not_found: "Tavolo non trovato.",
  waiter_resting: "Questo cameriere è a riposo e non può essere assegnato.",
  capability_missing: "Questo cameriere non ha la competenza richiesta per questo ruolo.",
};

export async function GET(req: Request) {
  const ctx = await getActiveVenue();
  const url = new URL(req.url);
  const tableId = url.searchParams.get("tableId");
  const date = url.searchParams.get("date");
  const service = url.searchParams.get("service");
  if (!tableId || !date || !service) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }
  const data = await listStaffAssignmentsForTable(ctx.venueId, tableId, new Date(date), service);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const updated = await upsertTableStaffAssignment(ctx.venueId, body);
    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    if (err instanceof StaffAssignmentError) {
      const status = err.code === "waiter_not_found" || err.code === "table_not_found" ? 404 : 409;
      return NextResponse.json({ error: err.code, message: ERROR_MESSAGES[err.code] }, { status });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await getActiveVenue();
  if (!can(ctx.role, "manage_staff")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    await removeTableStaffAssignment(ctx.venueId, {
      tableId: body.tableId,
      assignmentType: body.assignmentType,
      date: new Date(body.date),
      service: body.service,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
