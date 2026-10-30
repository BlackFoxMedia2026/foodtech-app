import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { metodoLeggibile, stripeOpzionale } from "@/lib/stripe";
import { logErrore, logEvento } from "@/lib/observability";
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
 *   su `(provider, providerEventId)`: se l'inserimento viola quel vincolo,
 *   l'evento era già stato visto e si esce — a meno che il tentativo di
 *   prima sia morto a metà, e allora lo si riprende. È l'idempotenza
 *   garantita dal database, non da un controllo che due richieste in
 *   parallelo si scambierebbero senza vedersi.
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
 * arrivano con `account` valorizzato, e `account.updated` è come si scopre
 * che un locale ha finito l'onboarding.
 *
 * Sullo stesso indirizzo, ma **non** dallo stesso endpoint Stripe: un endpoint
 * ascolta o l'account della piattaforma o gli account collegati, e ognuno ha
 * il suo segreto di firma. Per questo i segreti sono due — vedi
 * `segretiDiFirma` — e un evento è autentico se lo firma uno qualsiasi.
 */

/** Il corpo va letto grezzo: vedi sopra. */
export const dynamic = "force-dynamic";

/**
 * I segreti con cui un evento può essere firmato, nell'ordine in cui provarli.
 *
 * - `STRIPE_WEBHOOK_SECRET`: l'endpoint della piattaforma (abbonamenti DEM,
 *   `customer.subscription.*`, `invoice.*`). Fino al 30 ottobre 2026 era
 *   l'unico, e per questo si prova per primo: un'installazione che ha un
 *   endpoint solo continua a funzionare come prima.
 * - `STRIPE_CONNECT_WEBHOOK_SECRET`: l'endpoint degli **account collegati**,
 *   da cui arrivano caparre e pagamenti al tavolo (addebiti diretti, vedi
 *   `perConto`). Senza, quegli eventi fallivano la firma con un 400: Stripe
 *   ritentava per tre giorni, il denaro era sul conto del ristorante e da noi
 *   il pagamento restava «in corso» per sempre.
 */
function segretiDiFirma(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .map((s) => s?.trim() ?? "")
    .filter((s, i, tutti) => s && tutti.indexOf(s) === i);
}

/**
 * Per quanto un tentativo in corso tiene un evento per sé.
 *
 * Un evento registrato e mai segnato lavorato è di due tipi: o un altro
 * processo ci sta lavorando adesso, o quel processo è morto a metà (tempo
 * scaduto, istanza spenta) e non lo finirà mai. Si distinguono solo
 * dall'età: oltre questa soglia la presa in carico è considerata
 * abbandonata e il ritentativo di Stripe la riprende. Due minuti stanno ben
 * oltre la durata di un'esecuzione su Vercel.
 */
const PRESA_IN_CARICO_MS = 2 * 60_000;

export async function POST(req: Request) {
  const stripe = stripeOpzionale();
  const segreti = segretiDiFirma();

  // Non configurato: si risponde 503 e non 200. Un 200 direbbe a Stripe «tutto
  // a posto» e gli farebbe buttare via un incasso vero.
  if (!stripe || segreti.length === 0) {
    return NextResponse.json({ error: "stripe_non_configurato" }, { status: 503 });
  }

  const firma = req.headers.get("stripe-signature");
  if (!firma) return NextResponse.json({ error: "firma_mancante" }, { status: 400 });

  const corpo = await req.text();

  let evento: Stripe.Event | null = null;
  let errFirma: unknown = null;
  for (const segreto of segreti) {
    try {
      evento = stripe.webhooks.constructEvent(corpo, firma, segreto);
      break;
    } catch (err) {
      errFirma = err;
    }
  }
  if (!evento) {
    // Firma non valida con tutti i segreti: qualcuno sta provando a
    // inventarsi un incasso, o manca il segreto di un endpoint.
    logErrore("stripe.webhook.firma", errFirma);
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
  } catch (err) {
    /*
      Solo il vincolo unico violato vuol dire «già visto». Qualunque altro
      errore — il database che non risponde, una connessione caduta — è un
      guasto nostro: rispondere 200 direbbe a Stripe di buttare via l'evento,
      e un incasso vero non verrebbe mai registrato. Con un 500 ritenta.
    */
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      logErrore("stripe.webhook.registrazione", err, { evento: evento.type, id: evento.id });
      return NextResponse.json({ error: "registrazione_fallita" }, { status: 500 });
    }

    /*
      Già visto. Se è anche già lavorato, è un doppione: 200 e basta.

      Se invece `processedAt` è vuoto, il tentativo di prima non è arrivato in
      fondo. Lo si riprende **solo** se nessuno lo sta lavorando adesso: la
      presa in carico è un `UPDATE` condizionato sull'età di `receivedAt`, che
      fa da orologio della presa — fra due ritentativi simultanei uno solo
      trova la riga ancora «vecchia» e la rinnova. Chi resta fuori risponde
      409: Stripe riproverà, e a quel punto troverà l'evento lavorato oppure
      di nuovo abbandonato.

      Rilavorarlo è sicuro perché ogni ramo di `smista` è idempotente: incasso
      e rimborso rileggono lo stato del pagamento sotto serratura, la
      liberazione non tocca un pagamento riuscito, gli abbonamenti si
      riallineano a quello che dice Stripe.
    */
    const ripresa = await db.webhookEvent.updateMany({
      where: {
        provider: "stripe",
        providerEventId: evento.id,
        processedAt: null,
        receivedAt: { lt: new Date(Date.now() - PRESA_IN_CARICO_MS) },
      },
      data: { receivedAt: new Date(), attempts: { increment: 1 } },
    });
    if (ripresa.count === 0) {
      const gia = await db.webhookEvent.findUnique({
        where: { provider_providerEventId: { provider: "stripe", providerEventId: evento.id } },
        select: { processedAt: true },
      });
      if (gia?.processedAt) return NextResponse.json({ ok: true, ripetuto: true });
      // Senza riga: il tentativo di prima è fallito e l'ha tolta un istante
      // fa (vedi sotto). Anche qui si chiede a Stripe di riprovare.
      return NextResponse.json({ error: "in_lavorazione" }, { status: 409 });
    }
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

    /*
      --- Un tentativo di addebito non è andato: **non** si libera niente. ---

      Sulla pagina di Checkout una carta rifiutata non chiude la sessione: il
      cliente può riprovare con un'altra carta, sullo stesso pagamento e
      fino alla stessa scadenza. Liberare qui le sue portate le rendeva
      pagabili da altri mentre lui stava ancora pagando — e quando poi la
      seconda carta passava, l'incasso arrivava su allocazioni già rilasciate.

      Il pagamento resta `PROCESSING` con la sua scadenza, che è la stessa
      della sessione: se il cliente rinuncia, lo chiude
      `checkout.session.expired` qui sotto (o il lavoro periodico,
      `scadiPagamentiVecchi`). Si lascia solo una traccia nel registro.
    */
    case "payment_intent.payment_failed": {
      const pi = evento.data.object as Stripe.PaymentIntent;
      const paymentId = pi.metadata?.tavolo_payment_id;
      if (paymentId) {
        logEvento("stripe.pagamento.tentativo_rifiutato", {
          paymentId,
          motivo: pi.last_payment_error?.code ?? null,
        });
      }
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
