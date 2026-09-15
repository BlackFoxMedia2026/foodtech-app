import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { stripeConfigurato } from "@/lib/stripe";
import { linkCruscotto, linkOnboarding, riallineaStripe, scollegaStripe } from "@/server/stripe-connect";

/**
 * Collegare il conto Stripe del ristorante, e le regole del pagamento al tavolo.
 *
 * `manage_venue`: sono i soldi del locale e le sue coordinate bancarie.
 */

export const dynamic = "force-dynamic";

/** Lo stato, riallineato con Stripe. */
export async function GET() {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;
  const stato = await riallineaStripe(ctx.venueId);
  return NextResponse.json({ configurato: stripeConfigurato(), ...stato });
}

const Azione = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("collega"), ritornoUrl: z.string().url(), riprovaUrl: z.string().url() }),
  z.object({ azione: z.literal("cruscotto") }),
  z.object({ azione: z.literal("scollega") }),
  z.object({
    azione: z.literal("regole"),
    qrPaymentsEnabled: z.boolean().optional(),
    tipsEnabled: z.boolean().optional(),
    tipPresets: z.array(z.coerce.number().int().min(1).max(100)).max(4).optional(),
    minPaymentCents: z.coerce.number().int().min(50).max(50_00).optional(),
  }),
]);

export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_venue");
  if (!ctx.ok) return ctx.response;

  try {
    const corpo = Azione.parse(await req.json());

    switch (corpo.azione) {
      case "collega": {
        if (!stripeConfigurato()) {
          return NextResponse.json({ error: "stripe_non_configurato" }, { status: 503 });
        }
        const url = await linkOnboarding(ctx.venueId, {
          ritornoUrl: corpo.ritornoUrl,
          riprovaUrl: corpo.riprovaUrl,
        });
        return NextResponse.json({ url });
      }

      case "cruscotto": {
        const url = await linkCruscotto(ctx.venueId);
        if (!url) return NextResponse.json({ error: "non_disponibile" }, { status: 409 });
        return NextResponse.json({ url });
      }

      case "scollega": {
        await scollegaStripe(ctx.venueId);
        return NextResponse.json({ ok: true });
      }

      case "regole": {
        // Accendere il pagamento al tavolo senza poter incassare manderebbe i
        // clienti contro un errore: si rifiuta qui, dove si può ancora
        // spiegare perché.
        if (corpo.qrPaymentsEnabled) {
          const v = await db.venue.findUniqueOrThrow({
            where: { id: ctx.venueId },
            select: { stripeChargesEnabled: true },
          });
          if (!v.stripeChargesEnabled) {
            return NextResponse.json({ error: "stripe_non_collegato" }, { status: 409 });
          }
        }
        const aggiornato = await db.venue.update({
          where: { id: ctx.venueId },
          data: {
            qrPaymentsEnabled: corpo.qrPaymentsEnabled,
            tipsEnabled: corpo.tipsEnabled,
            tipPresets: corpo.tipPresets,
            minPaymentCents: corpo.minPaymentCents,
          },
          select: {
            qrPaymentsEnabled: true,
            tipsEnabled: true,
            tipPresets: true,
            minPaymentCents: true,
          },
        });
        return NextResponse.json(aggiornato);
      }
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
