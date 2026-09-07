import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { auditActor } from "@/server/audit";
import { GiftCardError, MOTIVO_GIFT_CARD, redeemGiftCard } from "@/server/gift-cards";
import { formatCurrency } from "@/lib/utils";

const Body = z.object({
  code: z.string().trim().min(1, "Scrivi il codice della gift card").max(40),
  amountCents: z.coerce.number().int().min(1, "Scrivi quanto scalare").max(500_000),
  orderId: z.string().optional().nullable(),
  bookingId: z.string().optional().nullable(),
  reason: z.string().trim().max(200).optional().nullable(),
});

/** Scala un importo da una gift card: lo fa chi sta servendo. */
export async function POST(req: Request) {
  const ctx = await requireVenueApi("manage_bookings");
  if (!ctx.ok) return ctx.response;
  try {
    const body = Body.parse(await req.json());
    return NextResponse.json(await redeemGiftCard(ctx.venueId, body, { actor: auditActor(ctx, req) }));
  } catch (err) {
    if (err instanceof GiftCardError) {
      if (err.code === "not_found") {
        return apiError(404, "not_found", "Nessuna gift card con questo codice.");
      }
      if (err.code === "insufficient_balance") {
        // Dire quanto c'è, non solo che non basta: chi è alla cassa deve
        // sapere qual è la cifra giusta da scalare e quanto resta da pagare.
        const residuo = (err.detail as { residuoCents?: number } | undefined)?.residuoCents ?? 0;
        return apiError(
          409,
          err.code,
          `Su questa gift card restano ${formatCurrency(residuo, "EUR")}: scala questa cifra e fai pagare il resto.`,
        );
      }
      if (err.code === "invalid_amount") {
        return apiError(400, err.code, "L'importo da scalare deve essere maggiore di zero.");
      }
      return apiError(409, err.code, MOTIVO_GIFT_CARD[err.code]);
    }
    return apiErrorResponse(err);
  }
}
