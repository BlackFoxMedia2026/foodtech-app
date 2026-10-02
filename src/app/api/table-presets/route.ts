import { NextResponse } from "next/server";
import { auditActor, recordAudit } from "@/server/audit";
import { requireVenueApi } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";

const Body = z.object({
  label: z.string().min(1).max(60),
  shape: z.enum(["ROUND", "SQUARE", "RECT", "BOOTH", "LOUNGE", "OVAL", "CUSTOM"]),
  seats: z.coerce.number().int().min(1).max(40),
  width: z.coerce.number().int().min(20).max(1200),
  height: z.coerce.number().int().min(20).max(1200),
});

export async function GET() {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;
  const presets = await db.tablePreset.findMany({
    where: { venueId: ctx.venueId },
    orderBy: { label: "asc" },
  });
  return NextResponse.json(presets);
}

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const data = Body.parse(await req.json());
    const created = await db.tablePreset.create({ data: { ...data, venueId: ctx.venueId } });
    await recordAudit(auditActor(ctx, req), "table_preset.create", "table_preset", created.id, {
      nome: created.label,
      forma: created.shape,
      posti: created.seats,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "Esiste già un predefinito con questo nome.", code: "DUPLICATE_LABEL" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
