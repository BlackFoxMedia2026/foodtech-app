import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, setActiveVenueCookie } from "@/lib/tenant";

const Body = z.object({ venueId: z.string().min(1) });

export async function POST(req: Request) {
  const { userId } = await requireUser();
  const { venueId } = Body.parse(await req.json());

  const allowed = await db.venueMembership.findFirst({ where: { userId, venueId } });
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  setActiveVenueCookie(venueId);
  return NextResponse.json({ ok: true });
}
