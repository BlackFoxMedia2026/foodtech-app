import { NextResponse } from "next/server";
import { requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { cambiaEmailAccesso, creaAccesso } from "@/server/staff-account";
import { baseUrl, erroreAccount } from "./_comune";

/**
 * L'account di una persona dell'organico. Richiede `manage_venue`, come ogni
 * azione sul team: dare o cambiare un accesso è la decisione più grande che
 * si prende da questa applicazione.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const esito = await creaAccesso(ctx.venueId, params.id, await req.json(), baseUrl(), auditActor(ctx, req));
    return NextResponse.json(esito, { status: 201 });
  } catch (err) {
    return erroreAccount(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const utente = await cambiaEmailAccesso(ctx.venueId, params.id, await req.json(), auditActor(ctx, req));
    return NextResponse.json({ email: utente.email });
  } catch (err) {
    return erroreAccount(err);
  }
}
