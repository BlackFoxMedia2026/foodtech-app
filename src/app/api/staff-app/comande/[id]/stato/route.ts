import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { puo } from "@/lib/permessi-staff";
import { comandaConsentita } from "@/server/staff-app/accesso-tavolo";
import { cambiaStatoComanda } from "@/server/comande/comande";

/**
 * Muove una comanda fra gli stati.
 *
 * Due permessi diversi sulla stessa rotta, e la ragione è chi fa il gesto:
 * annullare una comanda è un'azione **della sala** (`cancel_orders`), mentre
 * «presa in carico», «in preparazione» e «pronta» sono azioni **della cucina**
 * (`manage_kitchen_queue`). Finché la postazione di cucina non esiste, quel
 * permesso ce l'ha solo chi gestisce il locale — ed è corretto che in sala
 * nessuno possa dichiarare pronto un piatto che non ha visto.
 */
const Input = z.object({
  stato: z.enum(["RICEVUTA", "IN_PREPARAZIONE", "PRONTA", "SERVITA", "ANNULLATA"]),
  nota: z.string().trim().max(300).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  /* Si entra col permesso più debole e si verifica quello vero sotto, quando
     si sa quale stato viene chiesto. */
  const ctx = await requireStaffApi("view_kitchen_status");
  if (!ctx.ok) return ctx.response;

  if (!(await comandaConsentita({ ...ctx, waiterId: ctx.persona.waiterId }, params.id))) {
    return apiError(403, "non_assegnato", "Questa comanda non è su un tuo tavolo.");
  }

  try {
    const { stato, nota } = Input.parse(await req.json().catch(() => ({})));

    const richiesto =
      stato === "ANNULLATA" ? "cancel_orders" : stato === "SERVITA" ? "edit_orders" : "manage_kitchen_queue";

    if (!puo(ctx.permessi, richiesto)) {
      return apiError(403, "forbidden", "Il tuo ruolo non consente questa operazione.", {
        permesso: richiesto,
      });
    }

    return NextResponse.json(
      await cambiaStatoComanda(ctx.venueId, params.id, stato, {
        waiterId: ctx.persona.waiterId,
        userId: ctx.userId,
        nota,
        actor: attoreStaff(ctx, req),
      }),
    );
  } catch (err) {
    return staffErrorResponse(err);
  }
}
