import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { tavoloDaToken } from "@/server/conto-tavolo";
import { SchermoMessaggio } from "@/components/pay/schermo-messaggio";
import { AttesaConferma } from "@/components/pay/attesa-conferma";

/**
 * «Pagamento completato.»
 *
 * ## Questa pagina non decide niente
 *
 * Il cliente arriva qui perché Stripe ce l'ha rimandato, e quel rimando **non
 * è una prova**: l'indirizzo è nella cronologia del telefono, e chiunque può
 * riaprirlo. Quindi qui non si segna niente come pagato — si va a **leggere**
 * lo stato che il webhook ha già scritto, e si racconta quello.
 *
 * ## Quando la conferma non è ancora arrivata
 *
 * Il redirect del browser e l'evento di Stripe corrono in parallelo, e a volte
 * il browser arriva primo: per un secondo il pagamento è ancora `PROCESSING`.
 * Mostrare «non risulta pagato» a chi ha appena visto l'addebito sarebbe il
 * modo più rapido di far chiamare il ristorante. Quindi in quel caso si dice
 * *«stiamo confermando»* e si aspetta, ricontrollando da soli — vedi
 * `AttesaConferma`.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Pagamento completato",
};

export default async function PagamentoFattoPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { p?: string };
}) {
  const tavolo = await tavoloDaToken(params.token).catch(() => null);

  if (!tavolo || !searchParams.p) {
    return (
      <SchermoMessaggio
        locale={tavolo?.venue.name ?? null}
        logoUrl={tavolo?.venue.brandLogoUrl ?? null}
        tavolo={tavolo?.label ?? null}
        titolo="Pagamento non trovato"
        testo="Non riusciamo a risalire a questo pagamento. Se ti è stato addebitato qualcosa, mostra questa schermata al personale."
      />
    );
  }

  // Scopato sul tavolo del token: senza, conoscere l'identificativo di un
  // pagamento basterebbe a leggerne l'importo da qualunque altro QR.
  const pagamento = await db.payment.findFirst({
    where: { id: searchParams.p, tableId: tavolo.id, venueId: tavolo.venueId },
    select: {
      status: true,
      amountCents: true,
      tipCents: true,
      currency: true,
      customerEmail: true,
      orderId: true,
    },
  });

  if (!pagamento) {
    return (
      <SchermoMessaggio
        locale={tavolo.venue.name}
        logoUrl={tavolo.venue.brandLogoUrl}
        tavolo={tavolo.label}
        titolo="Pagamento non trovato"
        testo="Non riusciamo a risalire a questo pagamento. Se ti è stato addebitato qualcosa, mostra questa schermata al personale."
      />
    );
  }

  const euro = (c: number) => formatCurrency(c, pagamento.currency);
  const billCents = pagamento.amountCents - pagamento.tipCents;

  /* --- Non ancora confermato: si aspetta, invece di negare. --- */
  if (pagamento.status === "PROCESSING" || pagamento.status === "PENDING") {
    return (
      <AttesaConferma
        token={params.token}
        paymentId={searchParams.p}
        locale={tavolo.venue.name}
        logoUrl={tavolo.venue.brandLogoUrl}
        tavolo={tavolo.label}
      />
    );
  }

  /* --- Fallito o annullato. --- */
  if (pagamento.status !== "SUCCEEDED" && pagamento.status !== "PARTIALLY_REFUNDED") {
    return (
      <SchermoMessaggio
        locale={tavolo.venue.name}
        logoUrl={tavolo.venue.brandLogoUrl}
        tavolo={tavolo.label}
        titolo="Il pagamento non è andato a buon fine"
        testo="Non ti è stato addebitato nulla. Puoi riprovare dal conto del tavolo, oppure pagare al personale."
      />
    );
  }

  /* --- Riuscito. --- */
  const residuo = pagamento.orderId ? await residuoDi(pagamento.orderId) : 0;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-5">
        <div className="surface riquadro space-y-4 p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage/25">
            <Check className="h-7 w-7 text-sage-strong" aria-hidden="true" />
          </span>

          <div>
            <h1 className="text-display text-2xl">Pagamento completato</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tavolo.venue.name} · Tavolo {tavolo.label}
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Hai pagato</p>
            <p className="text-display mt-1 text-4xl leading-none">{euro(pagamento.amountCents)}</p>
          </div>

          <dl className="space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Conto</dt>
              <dd className="tabular-nums">{euro(billCents)}</dd>
            </div>
            {pagamento.tipCents > 0 && (
              <div className="flex items-baseline justify-between">
                <dt className="text-muted-foreground">Mancia</dt>
                <dd className="tabular-nums">{euro(pagamento.tipCents)}</dd>
              </div>
            )}
          </dl>

          {pagamento.customerEmail && (
            <p className="text-xs text-muted-foreground">
              Abbiamo mandato la conferma a {pagamento.customerEmail}.
            </p>
          )}
        </div>

        {residuo > 0 ? (
          <div className="riquadro space-y-3 p-5 text-center">
            <p className="text-sm">
              Sul conto del tavolo restano{" "}
              <strong className="font-semibold">{euro(residuo)}</strong> a carico degli altri.
            </p>
            <Link
              href={`/pay/${params.token}`}
              className="bg-cream text-clay-ink shadow-[0_10px_24px_rgba(0,0,0,0.35)] transition hover:brightness-105 inline-block rounded-full px-5 py-3 text-sm font-semibold"
            >
              Torna al conto
            </Link>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Il conto del tavolo è saldato. Buona serata.
          </p>
        )}
      </div>
    </main>
  );
}

/**
 * Quanto resta al tavolo, per l'ultima riga della schermata.
 *
 * Non passa da `leggiContoTavolo` di proposito: quella pretende un conto
 * ancora aperto, e qui il conto può essere appena stato chiuso in cassa. Chi
 * ha appena pagato deve vedere la propria ricevuta comunque.
 */
async function residuoDi(orderId: string): Promise<number> {
  const [righe, giftCard, punti, pagamenti] = await Promise.all([
    db.orderItem.findMany({ where: { orderId }, select: { priceCents: true, quantity: true } }),
    db.giftCardRedemption.aggregate({ where: { orderId }, _sum: { amountCents: true } }),
    db.loyaltyTransaction.aggregate({ where: { orderId, kind: "REDEEMED" }, _sum: { amountCents: true } }),
    db.payment.findMany({
      where: { orderId, deletedAt: null, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } },
      select: { amountCents: true, tipCents: true, refundedCents: true },
    }),
  ]);

  const totale = righe.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  const sconti = (giftCard._sum.amountCents ?? 0) + (punti._sum.amountCents ?? 0);
  const pagato = pagamenti.reduce(
    (s, p) => s + Math.max(0, p.amountCents - p.tipCents - p.refundedCents),
    0,
  );
  return Math.max(0, totale - sconti - pagato);
}
