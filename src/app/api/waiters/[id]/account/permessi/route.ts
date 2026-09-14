import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { aggiornaPermessi } from "@/server/staff-account";
import { erroreAccount } from "../_comune";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const m = await aggiornaPermessi(ctx.venueId, params.id, await req.json(), ctx.userId, auditActor(ctx, req));
    return NextResponse.json({ role: m.role, permissions: m.permissions, customPermissions: m.customPermissions });
  } catch (err) {
    return erroreAccount(err);
  }
}
