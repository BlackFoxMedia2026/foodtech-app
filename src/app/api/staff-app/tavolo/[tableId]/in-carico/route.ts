import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { MESSAGGIO_PRESA, PresaInCaricoError, prendiInCarico } from "@/server/staff-app/presa-in-carico";

/**
 * «Prendo io»: il tavolo diventa mio per questo servizio.
 *
 * Il permesso è `manage_tables` — lo stesso di accomodare e liberare, cioè di
 * decidere cosa succede a un tavolo. Un runner, che porta i piatti e non
 * risponde di un rango, non ce l'ha ed è giusto così: prendere in carico un
 * tavolo non è servirlo, è dichiarare che quel tavolo ha un responsabile.
 *
 * Il controllo su *quale* tavolo si può prendere sta tutto in
 * `prendiInCarico`: scoperto sì, già coperto da un collega no — a meno di
 * `view_all_tables`, che è il maître e ridistribuisce i ranghi per mestiere.
 */
export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  try {
    const esito = await prendiInCarico(
      { venueId: ctx.venueId, timezone: ctx.timezone, waiterId: ctx.persona.waiterId },
      params.tableId,
      {
        actor: attoreStaff(ctx, req),
        puoSubentrare: ctx.permessi.includes("view_all_tables"),
      },
    );
    return NextResponse.json(esito);
  } catch (err) {
    if (err instanceof PresaInCaricoError) {
      return apiError(
        err.code === "not_found" ? 404 : 409,
        err.code,
        MESSAGGIO_PRESA[err.code],
      );
    }
    return staffErrorResponse(err);
  }
}
