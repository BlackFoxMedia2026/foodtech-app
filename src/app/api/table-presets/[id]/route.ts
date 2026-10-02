import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  const existing = await db.tablePreset.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.tablePreset.delete({ where: { id: params.id } });
  await recordAudit(auditActor(ctx, req), "table_preset.delete", "table_preset", params.id, {
    nome: existing.label,
  });
  return NextResponse.json({ ok: true });
}
