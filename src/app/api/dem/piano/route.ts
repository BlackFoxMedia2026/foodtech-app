import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { cambiaPiano } from "@/server/dem/stripe-dem";
import { auditActor, recordAudit } from "@/server/audit";
import { db } from "@/lib/db";

const Corpo = z.object({ planId: z.string().min(1) });

/**
 * Cambia il piano DEM del locale.
 *
 * Il permesso è `manage_venue` e non `edit_marketing`: chi scrive le
 * newsletter non è necessariamente chi decide quanto spende il ristorante, e
 * queste due cose le fanno spesso due persone diverse.
 *
 * La risposta dice **cosa succede adesso**: un indirizzo verso cui uscire per
 * pagare, oppure che il cambio è già avvenuto (si sale) o è in calendario (si
 * scende). Il browser non conferma niente: il piano cambia quando lo dice un
 * evento firmato, o quando lo abbiamo deciso noi qui dal server.
 */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const { planId } = Corpo.parse(await req.json());

    const hdrs = headers();
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
    const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    const base = `${proto}://${host}`;

    const prima = await db.demSubscription.findUnique({
      where: { venueId: ctx.venueId },
      select: { plan: { select: { slug: true } } },
    });

    const esito = await cambiaPiano(ctx.venueId, planId, {
      // Si torna sul piano, non sulla pagina dei piani: dopo aver comprato,
      // la domanda successiva è «quanti invii ho adesso».
      successUrl: `${base}/settings/marketing/piano?pagamento=ok`,
      cancelUrl: `${base}/settings/marketing/piano/confronto`,
    });

    const nuovo = await db.demPlan.findUnique({ where: { id: planId }, select: { slug: true } });
    await recordAudit(
      auditActor(ctx, req),
      "cambiato" in esito && esito.immediato ? "dem.plan_change" : "dem.plan_scheduled",
      "dem_subscription",
      ctx.venueId,
      { da: prima?.plan.slug ?? null, a: nuovo?.slug ?? planId },
    );

    return NextResponse.json(esito);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
