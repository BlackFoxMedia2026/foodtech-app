import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { TeamError, cambiaRuolo, togliDalTeam } from "@/server/team";

const Body = z.object({
  role: z.enum(["MANAGER", "RECEPTION", "WAITER", "MARKETING", "READ_ONLY"]),
});

/**
 * I due messaggi che contano quando il server dice no.
 *
 * Non sono errori tecnici: sono le due situazioni in cui un locale
 * rischierebbe di restare senza nessuno che possa gestirlo. Il testo lo dice
 * come lo direbbe una persona, perché chi lo legge sta cercando di fare una
 * cosa ragionevole.
 */
function messaggio(code: TeamError["code"]): string {
  if (code === "non_su_di_te") {
    return "Su di te non puoi agire: chiedilo a un altro manager del locale.";
  }
  if (code === "ultimo_manager") {
    return "È l'ultimo manager del locale: senza manager nessuno potrebbe più invitare o cambiare i ruoli. Nominane un altro, poi riprova.";
  }
  return "Questa persona non fa parte di questo locale.";
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    const { role } = Body.parse(await req.json());
    const aggiornato = await cambiaRuolo(ctx.venueId, params.id, role, ctx.userId, auditActor(ctx, req));
    return NextResponse.json({ role: aggiornato.role });
  } catch (err) {
    if (err instanceof TeamError) return apiError(409, err.code, messaggio(err.code));
    return apiErrorResponse(err);
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  try {
    await togliDalTeam(ctx.venueId, params.id, ctx.userId, auditActor(ctx, req));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TeamError) return apiError(409, err.code, messaggio(err.code));
    return apiErrorResponse(err);
  }
}
