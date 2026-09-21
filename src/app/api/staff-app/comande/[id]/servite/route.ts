import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { comandaConsentita } from "@/server/staff-app/accesso-tavolo";
import { segnaRigheServite } from "@/server/comande/comande";

/**
 * «Segna come serviti» — il gesto del §20.
 *
 * `righe` vuoto significa **tutte**: è il pulsante grande della notifica, dove
 * chi lo preme ha appena portato il vassoio intero. L'elenco serve quando la
 * cucina ne ha mandati fuori due su quattro e il resto arriva dopo.
 */
const Input = z.object({ righe: z.array(z.string().min(1)).max(100).default([]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireStaffApi("edit_orders");
  if (!ctx.ok) return ctx.response;

  if (!(await comandaConsentita({ ...ctx, waiterId: ctx.persona.waiterId }, params.id))) {
    return apiError(403, "non_assegnato", "Questa comanda non è su un tuo tavolo.");
  }

  try {
    const { righe } = Input.parse(await req.json().catch(() => ({})));
    return NextResponse.json(
      await segnaRigheServite(ctx.venueId, params.id, righe, {
        waiterId: ctx.persona.waiterId,
        userId: ctx.userId,
        actor: attoreStaff(ctx, req),
      }),
    );
  } catch (err) {
    return staffErrorResponse(err);
  }
}
