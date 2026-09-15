import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { metodoLeggibile, stripeOpzionale } from "@/lib/stripe";
import { logErrore } from "@/lib/observability";
import { registraIncasso, registraRimborso, liberaPagamento } from "@/server/pagamenti-tavolo";
import { avvisaPagamentoAlTavolo } from "@/server/avvisi-pagamento";
import { sincronizzaAbbonamentoStripe, venueDelClienteStripe } from "@/server/dem/stripe-dem";
import { avvisa, avvisoPagamentoFallito } from "@/server/dem/avvisi";

/**
 * L'unica fonte di verità su un pagamento.
 *
 * Il cliente che torna sulla pagina «pagamento riuscito» ha soltanto chiuso
 * una scheda del browser: quell'indirizzo lo può aprire chiunque, a mano,
 * senza aver pagato niente. Un incasso esiste quando lo dice **Stripe**, con
 * un evento firmato, a questo indirizzo.
 *
 * ## Tre cose che questo file fa e che non vanno tolte
 *
 * - **Verifica la firma sul corpo grezzo.** Non su un oggetto già letto da
 *   `req.json()`: la firma copre i byte esatti, e riserializzare un JSON
 *   cambia gli spazi e la rende invalida. Da qui `req.text()`.
 * - **Scrive l'evento prima di lavorarlo.** `WebhookEvent` ha un vincolo unico
 *   su `(provider, providerEventId)`: se l'inserimento fallisce, quell'evento
 *   era già stato visto e si esce. È l'idempotenza garantita dal database, non
 *   da un controllo che due richieste in parallelo si scambierebbero senza
 *   vedersi.
 * - **Risponde 200 anche quando non riconosce l'evento.** Un 500 fa ritentare
 *   Stripe per giorni; e un evento che non ci riguarda non è un guasto.
 *   L'unico 500 legittimo è «ho ricevuto un incasso e non sono riuscito a
 *   scriverlo», perché lì il ritentativo serve davvero.
 *
 * ## Due mestieri sullo stesso indirizzo
 *
 * Qui arrivano due cose diverse: i **pagamenti al tavolo**, che nascono
 * sull'account del ristorante (Connect), e gli **abbonamenti DEM**, che
 * incassa la piattaforma. Si distinguono da `mode` e dai metadati, non
 * dall'ordine in cui capitano — e la prima cosa che fa `smista` su una
 * sessione completata è chiedersi di quale dei due si tratta, perché
 * scambiarli significherebbe cercare un conto al tavolo dentro un abbonamento.
 *
 * ## Gli eventi Connect
 *
 * Gli addebiti nascono sull'account del ristorante, quindi gli eventi
 * arrivano con `account` valorizzato. È lo stesso indirizzo: Stripe manda qui
 * sia gli eventi della piattaforma sia quelli degli account collegati, e
 * `account.updated` è come si scopre che un locale ha finito l'onboarding.
 */

/** Il corpo va letto grezzo: vedi sopra. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = stripeOpzionale();
  const segreto = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  // Non configurato: si risponde 503 e non 200. Un 200 direbbe a Stripe «tutto
  // a posto» e gli farebbe buttare via un incasso vero.
  if (!stripe || !segreto) {
    return NextResponse.json({ error: "stripe_non_configurato" }, { status: 503 });
  }

  const firma = req.headers.get("stripe-signature");
  if (!firma) return NextResponse.json({ error: "firma_mancante" }, { status: 400 });

  const corpo = await req.text();

  let evento: Stripe.Event;
  try {
    evento = stripe.webhooks.constructEvent(corpo, firma, segreto);
  } catch (err) {
    // Firma non valida: qualcuno sta provando a inventarsi un incasso.
    logErrore("stripe.webhook.firma", err);
    return NextResponse.json({ error: "firma_non_valida" }, { status: 400 });
  }

  // --- Idempotenza: il database decide se questo evento è nuovo. ---
  try {
    await db.webhookEvent.create({
      data: {
        provider: "stripe",
        providerEventId: evento.id,
        eventType: evento.type,
        payload: evento as unknown as object,
      },
    });
  } catch {
    // Vincolo unico violato: già visto, già lavorato. Non è un errore.
    return NextResponse.json({ ok: true, ripetuto: true });
  }

  try {
    await smista(evento);
    await db.webhookEvent.updateMany({
      where: { provider: "stripe", providerEventId: evento.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logErrore("stripe.webhook.lavorazione", err, { evento: evento.type, id: evento.id });
    // L'evento resta senza `processedAt` e **la riga resta**: Stripe ritenta,
    // e al prossimo tentativo l'idempotenza lo scarterebbe. Quindi si toglie,
    // così il ritentativo può davvero rifare il lavoro.
    await db.webhookEvent
      .deleteMany({ where: { provider: "stripe", providerEventId: evento.id, processedAt: null } })
      .catch(() => undefined);
    return NextResponse.json({ error: "lavorazione_fallita" }, { status: 500 });
  }
}

async function smista(evento: Stripe.Event): Promise<void> {
  switch (evento.type) {
    /* --- Il caso normale: il cliente ha pagato. --- */
    case "checkout.session.completed": {
      const s = evento.data.object as Stripe.Checkout.Session;

      /*
        Un abbonamento DEM comprato adesso.

        Non si applica niente da qui: si va a leggere l'abbonamento su Stripe
        e si riallinea il nostro stato a quello. La sessione dice «ha pagato»,
        l'abbonamento dice **cosa** ha comprato e fino a quando — e quello è
        il dato che governa la quota.
      */
      if (s.mode === "subscription" && s.metadata?.prodotto === "dem") {
        const subId = idDi(s.subscription);
        if (!subId) return;
        const stripe = stripeOpzionale();
        if (!stripe) return;
        const abbonamento = await stripe.subscriptions.retrieve(subId);
        await sincronizzaAbbonamentoStripe(abbonamento);
        return;
      }

      // `unpaid` capita coi metodi differiti: la sessione è completa ma il
      // denaro non è arrivato. Si aspetta `payment_intent.succeeded`.
      if (s.payment_status === "unpaid") return;
      const esito = await registraIncasso({
        paymentId: s.client_reference_id ?? s.metadata?.tavolo_payment_id ?? null,
        checkoutSessionId: s.id,
        paymentIntentId: idDi(s.payment_intent),
        email: s.customer_details?.email ?? null,
        metodo: null,
      });
      if (esito?.applicato) await avvisaPagamentoAlTavolo(esito);
      return;
    }

    /* --- La conferma che arriva per i metodi differiti, o da sola. --- */
    case "payment_intent.succeeded": {
      const pi = evento.data.object as Stripe.PaymentIntent;
      const esito = await registraIncasso({
        paymentId: pi.metadata?.tavolo_payment_id ?? null,
        paymentIntentId: pi.id,
        metodo: metodoLeggibile(pi.payment_method as Stripe.PaymentMethod | null),
      });
      if (esito?.applicato) await avvisaPagamentoAlTavolo(esito);
      return;
    }

    /* --- Il cliente non ce l'ha fatta: si libera quello che aveva impegnato. --- */
    case "payment_intent.payment_failed": {
      const pi = evento.data.object as Stripe.PaymentIntent;
      const paymentId = pi.metadata?.tavolo_payment_id;
      if (paymentId) await liberaPagamento(paymentId, "FAILED");
      return;
    }

    /* --- Nessuno ha concluso in tempo: il conto torna disponibile. --- */
    case "checkout.session.expired": {
      const s = evento.data.object as Stripe.Checkout.Session;
      const paymentId = s.client_reference_id ?? s.metadata?.tavolo_payment_id;
      if (paymentId) await liberaPagamento(paymentId, "EXPIRED");
      return;
    }

    /* --- Un rimborso deciso dal locale dal cruscotto di Stripe. --- */
    case "charge.refunded": {
      const c = evento.data.object as Stripe.Charge;
      await registraRimborso({
        paymentIntentId: idDi(c.payment_intent),
        rimborsatoCents: c.amount_refunded,
      });
      return;
    }

    /**
     * L'onboarding di un ristorante è andato avanti.
     *
     * È l'unico modo onesto di sapere se un locale può incassare: un
     * `stripeAccountId` salvato al momento del «collega» dice solo che
     * qualcuno ha cominciato, e un onboarding lasciato a metà produce un
     * account che esiste e rifiuta ogni pagamento.
     */
    case "account.updated": {
      const a = evento.data.object as Stripe.Account;
      const gia = await db.venue.findFirst({
        where: { stripeAccountId: a.id },
        select: { id: true, stripeOnboardedAt: true },
      });
      if (!gia) return;
      await db.venue.update({
        where: { id: gia.id },
        data: {
          stripeChargesEnabled: a.charges_enabled ?? false,
          stripePayoutsEnabled: a.payouts_enabled ?? false,
          stripeOnboardedAt:
            gia.stripeOnboardedAt ?? (a.charges_enabled && a.details_submitted ? new Date() : null),
        },
      });
      return;
    }

    /* --- L'abbonamento DEM è cambiato: da noi, dal cruscotto, o da solo. --- */
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await sincronizzaAbbonamentoStripe(evento.data.object as Stripe.Subscription);
      return;
    }

    /**
     * Il rinnovo è stato pagato.
     *
     * Serve per due cose: riportare in `ACTIVE` chi era in ritardo, e spostare
     * il ciclo. Il periodo lo si legge dall'abbonamento e non si calcola: se
     * Stripe ha fatturato il 3 invece del 1°, il nostro mese deve cominciare
     * il 3 — altrimenti il cliente paga un mese e ne riceve ventotto giorni.
     */
    case "invoice.paid": {
      const inv = evento.data.object as Stripe.Invoice;
      const subId = idDi(inv.subscription);
      if (!subId) return;
      const stripe = stripeOpzionale();
      if (!stripe) return;
      await sincronizzaAbbonamentoStripe(await stripe.subscriptions.retrieve(subId));
      return;
    }

    /**
     * La carta ha detto di no.
     *
     * Non si spegne niente: il periodo già pagato resta, e le campagne pure.
     * Si avvisa, perché è la cosa che, scoperta tre settimane dopo, ha già
     * fatto perdere un mese di campagne a qualcuno che credeva di aver pagato.
     */
    case "invoice.payment_failed": {
      const inv = evento.data.object as Stripe.Invoice;
      const customerId = idDi(inv.customer);
      if (!customerId) return;
      const venueId = await venueDelClienteStripe(customerId);
      if (!venueId) return;
      await db.demSubscription.updateMany({ where: { venueId }, data: { status: "PAST_DUE" } });
      await avvisa(venueId, avvisoPagamentoFallito());
      return;
    }

    default:
      // Tutto il resto è roba di Stripe che non ci riguarda: 200 e avanti.
      return;
  }
}

function idDi(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}
