import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse } from "@/lib/api-auth";
import { superAdminCorrente } from "@/lib/super-admin";
import { db } from "@/lib/db";
import { logEvento } from "@/lib/observability";

const Corpo = z.object({
  name: z.string().min(1).max(80),
  monthlyEmails: z.number().int().min(0),
  priceCents: z.number().int().min(0),
  stripePriceId: z.string().max(120).nullable(),
  active: z.boolean(),
  badge: z.string().max(40).nullable(),
  description: z.string().max(300).nullable(),
});

/**
 * Cambia un piano.
 *
 * Quello che **non** fa, e non per dimenticanza: non tocca gli abbonamenti già
 * attivi presso chi incassa. Su Stripe un prezzo non si modifica — se ne crea
 * uno nuovo — e far migrare le sottoscrizioni esistenti è un'operazione che
 * cambia quanto paga della gente: va fatta apposta, non come effetto
 * collaterale di un salvataggio.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await superAdminCorrente();
  if (!admin.ok) return apiError(404, "not_found", "Questo indirizzo non esiste.");

  try {
    const corpo = Corpo.parse(await req.json());
    const prima = await db.demPlan.findUnique({ where: { id: params.id } });
    if (!prima) return apiError(404, "not_found", "Piano non trovato.");

    const dopo = await db.demPlan.update({ where: { id: params.id }, data: corpo });

    logEvento("dem.piattaforma.piano_modificato", {
      piano: dopo.slug,
      da: admin.email,
      prezzoPrima: prima.priceCents,
      prezzoDopo: dopo.priceCents,
      quotaPrima: prima.monthlyEmails,
      quotaDopo: dopo.monthlyEmails,
    });

    return NextResponse.json(dopo);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
