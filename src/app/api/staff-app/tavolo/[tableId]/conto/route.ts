import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { tavoloConsentito } from "@/server/staff-app/accesso-tavolo";
import { contoDelTavolo, richiediConto } from "@/server/staff-app/tavolo";

/**
 * Il conto del tavolo: aprirlo, o dichiarare che è stato chiesto.
 *
 * Due azioni in una rotta perché sono lo stesso oggetto e la stessa risposta.
 * `apri` è idempotente — passa da `openOrderForBooking`, che restituisce
 * quello già aperto invece di farne un secondo.
 */
const Input = z.object({ azione: z.enum(["apri", "richiedi", "annulla_richiesta"]) });

export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const ctx = await requireStaffApi("view_payments");
  if (!ctx.ok) return ctx.response;

  if (!(await tavoloConsentito({ ...ctx, waiterId: ctx.persona.waiterId }, params.tableId))) {
    return apiError(403, "non_assegnato", "Questo tavolo non è fra i tuoi.");
  }

  try {
    const { azione } = Input.parse(await req.json().catch(() => ({})));
    const attore = attoreStaff(ctx, req);

    if (azione === "apri") {
      const conto = await contoDelTavolo(ctx.venueId, params.tableId, { actor: attore });
      return NextResponse.json(conto);
    }

    return NextResponse.json(
      await richiediConto(ctx.venueId, params.tableId, {
        actor: attore,
        annulla: azione === "annulla_richiesta",
      }),
    );
  } catch (err) {
    return staffErrorResponse(err);
  }
}
