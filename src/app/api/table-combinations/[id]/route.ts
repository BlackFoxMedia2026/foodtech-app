import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import { db } from "@/lib/db";

/** Separare un'unione: i tavoli restano dove sono, sparisce solo l'unione. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  const existing = await db.tableCombination.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.tableCombination.delete({ where: { id: params.id } });
  await recordAudit(auditActor(ctx, req), "table_combination.delete", "table_combination", params.id, {
    tavoli: existing.tableIds.length,
  });
  return NextResponse.json({ ok: true });
}
