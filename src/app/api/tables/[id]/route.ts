import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";

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
  const ctx = await getActiveVenue();
  const existing = await db.table.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const data = Patch.parse(await req.json());
    const updated = await db.table.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const existing = await db.table.findFirst({ where: { id: params.id, venueId: ctx.venueId } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await db.table.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
