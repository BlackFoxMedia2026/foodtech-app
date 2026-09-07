import { NextResponse } from "next/server";
import { auditActor, fieldDiff, recordAudit } from "@/server/audit";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { z } from "zod";
import { db } from "@/lib/db";

const Patch = z.object({
  label: z.string().optional(),
  seats: z.coerce.number().int().min(1).max(40).optional(),
  shape: z.enum(["ROUND", "SQUARE", "RECT", "BOOTH", "LOUNGE"]).optional(),
  posX: z.coerce.number().int().optional(),
  posY: z.coerce.number().int().optional(),
  rotation: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  const existing = await db.table.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const data = Patch.parse(await req.json());
    const updated = await db.table.update({ where: { id: params.id }, data });
    const diff = fieldDiff(existing, updated);
    if (diff) await recordAudit(auditActor(ctx, req), "table.update", "table", params.id, diff);
    return NextResponse.json(updated);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  const existing = await db.table.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.table.delete({ where: { id: params.id } });
  await recordAudit(auditActor(ctx, req), "table.delete", "table", params.id, {
    tavolo: existing.label,
    posti: existing.seats,
  });
  return NextResponse.json({ ok: true });
}
