import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVenueApi } from "@/lib/api-auth";
import { urlPagamento } from "@/lib/pay-token";

/**
 * Lo stato del QR di un tavolo, per la scheda di configurazione.
 *
 * Basta leggere la sala — non `manage_venue` — perché qui non si cambia
 * niente: un responsabile che vuole sapere se il tavolo 12 ha incassato deve
 * poterlo vedere anche senza poter rigenerare il codice.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  const tavolo = await db.table.findFirst({
    where: { id: params.id, venueId: ctx.venueId },
    select: {
      id: true,
      label: true,
      payQrToken: true,
      payQrEnabled: true,
      payQrRotatedAt: true,
      payQrLastSeenAt: true,
    },
  });
  if (!tavolo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const incassi = await db.payment.aggregate({
    where: {
      venueId: ctx.venueId,
      tableId: tavolo.id,
      kind: "TABLE_QR",
      status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] },
      deletedAt: null,
    },
    _sum: { amountCents: true, tipCents: true },
    _count: true,
  });

  return NextResponse.json({
    tableId: tavolo.id,
    tavolo: tavolo.label,
    attivo: tavolo.payQrEnabled && !!tavolo.payQrToken,
    url: tavolo.payQrToken ? urlPagamento(tavolo.payQrToken) : null,
    rigeneratoIl: tavolo.payQrRotatedAt,
    ultimoUtilizzo: tavolo.payQrLastSeenAt,
    pagamenti: incassi._count,
    incassatoCents: (incassi._sum.amountCents ?? 0) - (incassi._sum.tipCents ?? 0),
    manceCents: incassi._sum.tipCents ?? 0,
  });
}
