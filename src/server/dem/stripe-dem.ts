import type Stripe from "stripe";
import type { DemPlan } from "@prisma/client";
import { db } from "@/lib/db";
import { stripeRichiesto } from "@/lib/stripe";
import { logAttenzione, logEvento } from "@/lib/observability";
import { abbonamentoDi } from "./abbonamento";
import { pianoIncluso } from "./piani";
import { periodoCorrente } from "./consumo";

/**
 * L'abbonamento DEM su Stripe.
 *
 * ## Perché non passa da Connect
 *
 * Il resto del prodotto usa Stripe **Connect**: gli incassi di una cena
 * appartengono al ristorante, e l'addebito nasce sul suo account (vedi
 * `lib/stripe.ts`). Qui è il contrario — è Foodtech che vende un servizio al
 * ristorante — quindi l'addebito nasce sull'account della piattaforma e
 * **non** si passa `perConto()`. È la stessa integrazione, la stessa chiave,
 * lo stesso webhook: cambia chi incassa, ed è per questo che vale la pena
 * dirlo qui invece di lasciarlo dedurre dall'assenza di un parametro.
 *
 * ## Chi ha ragione fra noi e Stripe
 *
 * Stripe sa se una carta ha pagato. Il piano valido, la quota e il ciclo
 * stanno nel nostro database: un webhook che tarda non deve poter spegnere il
 * marketing di chi ha pagato, e una quota concordata a voce con un cliente
 * grande su Stripe non esiste proprio. Gli eventi Stripe **riconciliano** il
 * nostro stato, non lo sostituiscono.
 */

/** Il cliente Stripe del locale, creato la prima volta che serve. */
async function clienteStripe(venueId: string): Promise<string> {
  const stripe = stripeRichiesto();
  const sub = await abbonamentoDi(venueId);
  if (sub.stripeCustomerId) return sub.stripeCustomerId;

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { name: true, email: true },
  });

  const cliente = await stripe.customers.create(
    {
      name: venue.name,
      ...(venue.email && { email: venue.email }),
      // Il legame nei due sensi: dalla riga si arriva a Stripe, e da un
      // pagamento nel cruscotto di Stripe si arriva al locale — che è la cosa
      // che serve quando qualcuno chiama per un addebito che non riconosce.
      metadata: { venueId },
    },
    // Due clic sul pulsante non creano due clienti.
    { idempotencyKey: `dem_customer_${venueId}` },
  );

  await db.demSubscription.update({ where: { venueId }, data: { stripeCustomerId: cliente.id } });
  return cliente.id;
}

export type EsitoCambioPiano =
  /** Si esce verso Stripe: il piano cambierà quando il pagamento sarà confermato. */
  | { url: string }
  /** Cambiato subito, senza uscire: upgrade su un abbonamento già attivo. */
  | { cambiato: true; immediato: true }
  /** Registrato per il prossimo rinnovo: è un downgrade. */
  | { cambiato: true; immediato: false; dal: Date };

/**
 * Cambia piano, con la strada giusta per ogni caso.
 *
 * Tre situazioni diverse, e mescolarle è il modo di far pagare a qualcuno un
 * mese che non ha usato:
 *
 * - **non c'è ancora un abbonamento**: si esce verso la pagina di pagamento di
 *   Stripe, e il piano cambia solo quando l'evento firmato dice che è stato
 *   pagato. Il ritorno del browser non prova niente;
 * - **si sale**: la quota nuova serve **adesso** — è il motivo per cui si sta
 *   salendo, di solito a metà di una campagna che non ci sta. Stripe emette
 *   subito la differenza e il piano vale da questo istante, senza azzerare
 *   quello che è già stato inviato;
 * - **si scende**: il mese in corso è già stato pagato al prezzo vecchio, e
 *   con quel prezzo il cliente ha diritto a quella quota fino alla fine. Il
 *   prezzo nuovo parte dalla prossima fattura, la quota nuova dal prossimo
 *   ciclo, e le due cose combaciano.
 */
export async function cambiaPiano(
  venueId: string,
  planId: string,
  opts: { successUrl: string; cancelUrl: string },
): Promise<EsitoCambioPiano> {
  const sub = await abbonamentoDi(venueId);
  const nuovo = await db.demPlan.findUnique({ where: { id: planId } });
  if (!nuovo || !nuovo.active) throw new Error("not_found");
  if (nuovo.id === sub.planId) throw new Error("conflict");

  const incluso = await pianoIncluso();
  const siScende = nuovo.monthlyEmails < sub.plan.monthlyEmails;

  // Tornare al piano compreso è una disdetta: si smette di pagare, e la quota
  // torna a 500 quando il periodo pagato finisce.
  if (nuovo.id === incluso.id) {
    await disdiciAFineCiclo(venueId);
    return { cambiato: true, immediato: false, dal: sub.currentPeriodEnd };
  }

  if (!nuovo.stripePriceId) {
    // Un piano a pagamento senza prezzo su Stripe non è vendibile: meglio
    // dirlo con un errore che aprire un pagamento che non esiste.
    logAttenzione("dem.piano.senza_prezzo_stripe", { planId: nuovo.id, slug: nuovo.slug });
    throw new Error("dem_plan_not_purchasable");
  }

  if (!sub.stripeSubscriptionId || sub.status === "CANCELLED") {
    return { url: await apriPagamento(venueId, nuovo, opts) };
  }

  return siScende
    ? await programmaDowngrade(venueId, nuovo)
    : await applicaUpgrade(venueId, nuovo);
}

/** La pagina di pagamento ospitata da Stripe. */
async function apriPagamento(
  venueId: string,
  piano: DemPlan,
  opts: { successUrl: string; cancelUrl: string },
): Promise<string> {
  const stripe = stripeRichiesto();
  const customer = await clienteStripe(venueId);

  const sessione = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: piano.stripePriceId!, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // I metadati viaggiano fino al webhook: è così che un evento firmato sa a
    // quale locale e a quale piano si riferisce, senza fidarsi di niente che
    // arrivi dal browser.
    metadata: { venueId, planId: piano.id, prodotto: "dem" },
    subscription_data: { metadata: { venueId, planId: piano.id, prodotto: "dem" } },
  });

  if (!sessione.url) throw new Error("stripe_checkout_senza_url");
  return sessione.url;
}

/** Si sale: differenza addebitata subito, quota nuova subito. */
async function applicaUpgrade(venueId: string, piano: DemPlan): Promise<EsitoCambioPiano> {
  const stripe = stripeRichiesto();
  const sub = await abbonamentoDi(venueId);

  const attuale = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId!);
  const voce = attuale.items.data[0];
  if (!voce) throw new Error("stripe_subscription_senza_voci");

  await stripe.subscriptions.update(
    attuale.id,
    {
      items: [{ id: voce.id, price: piano.stripePriceId! }],
      // La differenza fra i due piani viene fatturata subito: è quello che
      // uno si aspetta quando compra più spazio nel mezzo di un mese.
      proration_behavior: "always_invoice",
      metadata: { venueId, planId: piano.id, prodotto: "dem" },
    },
    { idempotencyKey: `dem_upgrade_${venueId}_${piano.id}_${attuale.current_period_start}` },
  );

  await db.demSubscription.update({
    where: { venueId },
    data: {
      planId: piano.id,
      stripePriceId: piano.stripePriceId,
      scheduledPlanId: null,
      scheduledChangeAt: null,
      status: "ACTIVE",
    },
  });

  // Il tetto del ciclo in corso sale **senza** azzerare il consumo: 17.000 su
  // 20.000 diventa 17.000 su 100.000, non 0 su 100.000.
  await periodoCorrente(venueId);
  logEvento("dem.piano.salito", { venueId, piano: piano.slug });

  return { cambiato: true, immediato: true };
}

/** Si scende: prezzo nuovo dalla prossima fattura, quota nuova dal prossimo ciclo. */
async function programmaDowngrade(venueId: string, piano: DemPlan): Promise<EsitoCambioPiano> {
  const stripe = stripeRichiesto();
  const sub = await abbonamentoDi(venueId);

  const attuale = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId!);
  const voce = attuale.items.data[0];
  if (!voce) throw new Error("stripe_subscription_senza_voci");

  await stripe.subscriptions.update(
    attuale.id,
    {
      items: [{ id: voce.id, price: piano.stripePriceId! }],
      // Nessun conguaglio: il mese in corso è già stato pagato al prezzo
      // vecchio e non si tocca. Il prezzo nuovo compare sulla fattura
      // successiva, che è lo stesso momento in cui da noi cambia la quota.
      proration_behavior: "none",
      metadata: { venueId, planId: piano.id, prodotto: "dem" },
    },
    { idempotencyKey: `dem_downgrade_${venueId}_${piano.id}_${attuale.current_period_start}` },
  );

  await db.demSubscription.update({
    where: { venueId },
    data: { scheduledPlanId: piano.id, scheduledChangeAt: sub.currentPeriodEnd },
  });

  logEvento("dem.piano.sceso", { venueId, piano: piano.slug, dal: sub.currentPeriodEnd.toISOString() });
  return { cambiato: true, immediato: false, dal: sub.currentPeriodEnd };
}

/**
 * Disdetta: si smette di pagare alla fine del periodo già pagato.
 *
 * Non si cancella subito. Chi ha pagato settembre ha settembre, anche se
 * disdice il 2: interrompere il servizio a metà di un mese pagato è un modo di
 * farsi ricordare male.
 */
export async function disdiciAFineCiclo(venueId: string): Promise<void> {
  const sub = await abbonamentoDi(venueId);
  const incluso = await pianoIncluso();

  if (sub.stripeSubscriptionId) {
    const stripe = stripeRichiesto();
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
  }

  await db.demSubscription.update({
    where: { venueId },
    data: {
      cancelAtPeriodEnd: true,
      scheduledPlanId: incluso.id,
      scheduledChangeAt: sub.currentPeriodEnd,
    },
  });
  logEvento("dem.abbonamento.disdetto", { venueId, dal: sub.currentPeriodEnd.toISOString() });
}

/**
 * Riallinea il nostro stato a quello che dice Stripe.
 *
 * La chiamano gli eventi firmati, ed è scritta per essere **rieseguibile**:
 * Stripe consegna lo stesso evento più volte e li consegna fuori ordine, e
 * questa funzione descrive uno stato finale invece di applicare una
 * differenza. Rieseguirla non cambia niente; eseguirla due volte nemmeno.
 */
export async function sincronizzaAbbonamentoStripe(s: Stripe.Subscription): Promise<void> {
  const venueId = s.metadata?.venueId;
  if (!venueId) {
    // Un abbonamento Stripe che non dice di chi è: non è nostro, o è stato
    // creato a mano dal cruscotto. Non si indovina a chi assegnarlo.
    logAttenzione("dem.stripe.abbonamento_senza_locale", { subscription: s.id });
    return;
  }

  const esistente = await db.demSubscription.findUnique({ where: { venueId } });
  if (!esistente) return;

  const priceId = s.items.data[0]?.price?.id ?? null;
  const piano = priceId ? await db.demPlan.findFirst({ where: { stripePriceId: priceId } }) : null;

  const stato = mappaStato(s.status);
  const inizio = new Date(s.current_period_start * 1000);
  const fine = new Date(s.current_period_end * 1000);

  /*
    Il piano si applica solo quando l'abbonamento è vivo.

    Un `incomplete` è un pagamento cominciato e non concluso: dargli la quota
    significherebbe regalare un mese a chiunque apra un checkout e lo chiuda.
    E su `canceled` non si tocca il piano qui — ci pensa il rinnovo, che porta
    al piano compreso quando il periodo pagato finisce.
  */
  const attivo = stato === "ACTIVE" || stato === "PAST_DUE";

  await db.demSubscription.update({
    where: { venueId },
    data: {
      status: stato,
      stripeSubscriptionId: s.id,
      stripeCustomerId: typeof s.customer === "string" ? s.customer : s.customer.id,
      stripePriceId: priceId,
      currentPeriodStart: inizio,
      currentPeriodEnd: fine,
      cancelAtPeriodEnd: s.cancel_at_period_end,
      ...(attivo && piano && { planId: piano.id, scheduledPlanId: null, scheduledChangeAt: null }),
    },
  });

  // Il ciclo di consumo insegue il piano: se il tetto è cambiato, la riga del
  // mese in corso lo recepisce senza perdere quello che è già stato speso.
  await periodoCorrente(venueId);

  logEvento("dem.stripe.sincronizzato", { venueId, stato, piano: piano?.slug ?? null });
}

function mappaStato(s: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE" {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELLED";
    default:
      return "INCOMPLETE";
  }
}

/** Il locale a cui appartiene un cliente Stripe, quando lo conosciamo. */
export async function venueDelClienteStripe(customerId: string): Promise<string | null> {
  const sub = await db.demSubscription.findFirst({
    where: { stripeCustomerId: customerId },
    select: { venueId: true },
  });
  return sub?.venueId ?? null;
}
