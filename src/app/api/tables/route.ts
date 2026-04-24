import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";

const Body = z.object({
  label: z.string().min(1),
  seats: z.coerce.number().int().min(1).max(40),
  shape: z.enum(["ROUND", "SQUARE", "RECT", "BOOTH", "LOUNGE"]).default("ROUND"),
  roomId: z.string().optional().nullable(),
  posX: z.coerce.number().int().default(40),
  posY: z.coerce.number().int().default(40),
});

export async function GET() {
  const ctx = await getActiveVenue();
  const tables = await db.table.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { label: "asc" },
  });
  return NextResponse.json(tables);
}

export async function POST(req: Request) {
  const ctx = await getActiveVenue();
  try {
    const data = Body.parse(await req.json());
    const created = await db.table.create({ data: { ...data, venueId: ctx.venueId } });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
