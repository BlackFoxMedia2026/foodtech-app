import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { generaLinkReset } from "@/server/staff-account";
import { baseUrl, erroreAccount } from "../_comune";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const esito = await generaLinkReset(ctx.venueId, params.id, baseUrl(), auditActor(ctx, req));
    return NextResponse.json(esito, { status: 201 });
  } catch (err) {
    return erroreAccount(err);
  }
}
