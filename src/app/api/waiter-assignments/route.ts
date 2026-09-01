import { NextResponse } from "next/server";
import { getActiveVenue } from "@/lib/tenant";
import { AssignmentConflictError, listAssignmentsForDate, upsertWaiterAssignment } from "@/server/waiter-assignments";

function joinItalianList(items: string[]) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function formatConflictMessage(conflicts: { waiterName: string; tableLabels: string[] }[]) {
  return conflicts
    .map((c) => {
      const plural = c.tableLabels.length > 1;
      const list = joinItalianList(c.tableLabels);
      return plural
        ? `I tavoli ${list} sono già assegnati a ${c.waiterName} per questo servizio.`
        : `Il tavolo ${list} è già assegnato a ${c.waiterName} per questo servizio.`;
    })
    .join(" ");
}

export async function GET(req: Request) {
  const ctx = await getActiveVenue();
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const date = dateParam ? new Date(dateParam) : new Date();
  const data = await listAssignmentsForDate(ctx.venueId, date);
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const body = await req.json();
    const created = await upsertWaiterAssignment(ctx.venueId, body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof AssignmentConflictError) {
      return NextResponse.json(
        { error: "table_conflict", message: formatConflictMessage(err.conflicts) },
        { status: 409 },
      );
    }
    const message = err instanceof Error ? err.message : "invalid";
    if (message === "waiter_not_found") return NextResponse.json({ error: message }, { status: 404 });
    if (message === "waiter_resting") {
      return NextResponse.json(
        { error: message, message: "Questo cameriere è a riposo e non può essere assegnato a un servizio." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
