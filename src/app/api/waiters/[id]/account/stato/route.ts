import { NextResponse } from "next/server";
import { z } from "zod";
import { requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { disattivaAccount, riattivaAccount } from "@/server/staff-account";
import { erroreAccount } from "../_comune";

const Body = z.object({ attivo: z.boolean() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const { attivo } = Body.parse(await req.json());
    if (attivo) await riattivaAccount(ctx.venueId, params.id, auditActor(ctx, req));
    else await disattivaAccount(ctx.venueId, params.id, ctx.userId, auditActor(ctx, req));
    return NextResponse.json({ attivo });
  } catch (err) {
    return erroreAccount(err);
  }
}
