import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { logErrore } from "@/lib/observability";
import { createNotification } from "./notifications";
import { sendTablePaymentEmails } from "./emails";
import type { EsitoIncasso } from "./pagamenti-tavolo";

/**
 * Cosa succede **dopo** che il denaro è arrivato.
 *
 * Sta fuori dalla transazione che incassa, e non è un dettaglio: una notifica
 * che non parte non deve poter annullare un incasso già avvenuto. Il denaro è
 * sul conto del ristorante; se il server di posta è giù, il rimedio è
 * rimandare l'email, non restituire i soldi.
 *
 * Per lo stesso motivo qui dentro non si propaga mai un errore: si registra e
 * si prosegue. Chi chiama è il webhook di Stripe, e un'eccezione lì farebbe
 * rispondere 500, farebbe ritentare Stripe, e il ritentativo non
 * riincasserebbe nulla — troverebbe il pagamento già riuscito — ma
 * continuerebbe a fallire sulla stessa email, per giorni.
 *
 * ## Perché due notifiche e non una
 *
 * «Qualcuno ha pagato 33 €» e «il tavolo 12 ha finito di pagare» sono due
 * fatti diversi per due persone diverse: il primo interessa chi tiene i conti,
 * il secondo interessa chi è in sala e deve sapere che quel tavolo si può
 * sparecchiare senza passare dalla cassa. La seconda si scrive solo quando il
 * conto si chiude davvero.
 */
export async function avvisaPagamentoAlTavolo(esito: EsitoIncasso): Promise<void> {
  try {
    const dati = await raccogli(esito);
    if (!dati) return;

    await createNotification(esito.venueId, {
      kind: "TABLE_PAYMENT",
      title: `Tavolo ${dati.tavolo}: incassati ${formatCurrency(esito.billCents, dati.currency)}`,
      body: descrizione(esito, dati),
      link: "/payments",
      meta: {
        paymentId: esito.paymentId,
        orderId: esito.orderId,
        billCents: esito.billCents,
        tipCents: esito.tipCents,
        residuoCents: esito.residuoCents,
      },
    });

    if (esito.saldato) {
      await createNotification(esito.venueId, {
        kind: "TABLE_SETTLED",
        title: `Tavolo ${dati.tavolo}: conto saldato`,
        body: `${formatCurrency(dati.totaleIncassato, dati.currency)} in ${dati.pagamenti} ${
          dati.pagamenti === 1 ? "pagamento" : "pagamenti"
        }. Non deve passare in cassa.`,
        link: "/service",
        meta: { orderId: esito.orderId, tavolo: dati.tavolo },
      });
    }

    await sendTablePaymentEmails({
      locale: dati.locale,
      localeEmail: dati.localeEmail,
      clienteEmail: dati.clienteEmail,
      tavolo: dati.tavolo,
      currency: dati.currency,
      billCents: esito.billCents,
      tipCents: esito.tipCents,
      residuoCents: esito.residuoCents,
      saldato: esito.saldato,
      metodo: dati.metodo,
      quando: dati.quando,
    });
  } catch (err) {
    // Il denaro è già arrivato: qui si può solo prenderne nota.
    logErrore("pagamento-tavolo.avvisi", err, { paymentId: esito.paymentId });
  }
}

async function raccogli(esito: EsitoIncasso) {
  const payment = await db.payment.findUnique({
    where: { id: esito.paymentId },
    select: {
      currency: true,
      customerEmail: true,
      paymentMethod: true,
      paidAt: true,
      createdAt: true,
      table: { select: { label: true } },
      venue: { select: { name: true, email: true } },
    },
  });
  if (!payment) return null;

  // Quanto ha incassato in tutto questo conto, e in quanti pagamenti: serve
  // solo alla notifica di chiusura, e si chiede solo quando serve.
  let totaleIncassato = esito.billCents;
  let pagamenti = 1;
  if (esito.saldato && esito.orderId) {
    const somma = await db.payment.aggregate({
      where: { orderId: esito.orderId, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, deletedAt: null },
      _sum: { amountCents: true, tipCents: true },
      _count: true,
    });
    totaleIncassato = (somma._sum.amountCents ?? 0) - (somma._sum.tipCents ?? 0);
    pagamenti = somma._count;
  }

  return {
    tavolo: payment.table?.label ?? "—",
    currency: payment.currency,
    locale: payment.venue.name,
    localeEmail: payment.venue.email,
    clienteEmail: payment.customerEmail,
    metodo: payment.paymentMethod,
    quando: payment.paidAt ?? payment.createdAt,
    totaleIncassato,
    pagamenti,
  };
}

function descrizione(esito: EsitoIncasso, dati: { currency: string }): string {
  const pezzi: string[] = [];
  if (esito.tipCents > 0) pezzi.push(`più ${formatCurrency(esito.tipCents, dati.currency)} di mancia`);
  pezzi.push(
    esito.saldato
      ? "il conto è saldato"
      : `restano ${formatCurrency(esito.residuoCents, dati.currency)} da incassare`,
  );
  return pezzi.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
}
