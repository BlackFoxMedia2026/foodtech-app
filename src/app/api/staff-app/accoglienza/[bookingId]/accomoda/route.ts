import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-auth";
import { attoreStaff, requireStaffApi } from "@/lib/staff-auth";
import { staffErrorResponse } from "@/lib/staff-errori";
import { accomoda } from "@/server/staff-app/accoglienza";
import { tavoloAccomodabile } from "@/server/staff-app/accesso-tavolo";

/**
 * **Accomoda.** Il gesto in cui i due percorsi del §4 si incontrano: che si
 * sia partiti dall'ospite o dal tavolo, si arriva qui.
 *
 * Il controllo sul tavolo è `tavoloAccomodabile` e non `tavoloConsentito`: un
 * tavolo libero non ha sopra i dati di nessuno, e un cameriere con quattro
 * persone in piedi davanti non deve cercare il maître per usare il sei che è
 * vuoto. Un tavolo **occupato** che non è suo continua a rifiutare, ed è la
 * riga che impedisce di usare questa strada per spostare gli ospiti di un
 * collega.
 */
const Input = z.object({
  /** In ordine: il primo diventa il tavolo principale della seduta. */
  tableIds: z.array(z.string().min(1)).min(1).max(4),
  /** Obbligatorio quando i posti non bastano: lo chiede il motore, non noi. */
  motivo: z.string().max(300).optional().nullable(),
});

export async function POST(req: Request, { params }: { params: { bookingId: string } }) {
  const ctx = await requireStaffApi("manage_tables");
  if (!ctx.ok) return ctx.response;

  try {
    const { tableIds, motivo } = Input.parse(await req.json().catch(() => ({})));

    const contesto = {
      venueId: ctx.venueId,
      timezone: ctx.timezone,
      waiterId: ctx.persona.waiterId,
      permessi: ctx.permessi,
    };
    for (const tableId of tableIds) {
      if (!(await tavoloAccomodabile(contesto, tableId))) {
        return apiError(
          403,
          "non_assegnato",
          "Questo tavolo non è libero e non è fra i tuoi: chiedi al responsabile di sala.",
        );
      }
    }

    const esito = await accomoda(contesto, {
      bookingId: params.bookingId,
      tableIds,
      forceReason: motivo ?? null,
      actor: attoreStaff(ctx, req),
    });
    return NextResponse.json(esito);
  } catch (err) {
    return staffErrorResponse(err);
  }
}
