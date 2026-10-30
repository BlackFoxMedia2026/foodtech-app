import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { origineFidata } from "@/lib/origine";
import { auditActor } from "@/server/audit";
import { TeamError, invitaAlTeam, listInviti } from "@/server/team";

/** L'indirizzo pubblico di questa installazione. Il link porta un segreto:
 * vedi `origineFidata`. */
function baseUrl(): string {
  return origineFidata(headers());
}

export async function GET() {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  return NextResponse.json(await listInviti(ctx.venueId, baseUrl()));
}

/**
 * Invitare qualcuno richiede `manage_venue`, cioè oggi il ruolo MANAGER.
 *
 * Dare accesso ai dati di un ristorante è la decisione più grande che si può
 * prendere da questa applicazione: non è un gesto da reception.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const invito = await invitaAlTeam(ctx.venueId, await req.json(), baseUrl(), auditActor(ctx, req));
    return NextResponse.json(invito, { status: 201 });
  } catch (err) {
    if (err instanceof TeamError && err.code === "gia_nel_team") {
      return apiError(409, err.code, "Questa persona ha già accesso a questo locale.");
    }
    if (err instanceof TeamError && err.code === "indirizzo_riservato") {
      return apiError(422, err.code, "Questo indirizzo non può ricevere un invito a un locale.");
    }
    return apiErrorResponse(err);
  }
}
