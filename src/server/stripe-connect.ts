import { db } from "@/lib/db";
import { stripeRichiesto, stripeOpzionale } from "@/lib/stripe";

/**
 * Collegare il conto Stripe di un ristorante.
 *
 * ## Cosa Tavolo conserva, e cosa no
 *
 * Solo `Venue.stripeAccountId` — la sigla `acct_...`, che non è un segreto e
 * non permette da sola di muovere un euro. Le chiavi del ristorante non
 * passano mai da qui: l'onboarding avviene **su Stripe**, il locale inserisce
 * i propri dati sul sito di Stripe, e noi riceviamo indietro un
 * identificativo.
 *
 * È il motivo per cui il brief chiede di non salvare la secret key del
 * ristorante in chiaro, e la risposta migliore a quella richiesta non è
 * cifrarla: è **non averla**.
 *
 * ## Express, e non Standard
 *
 * Con Express il ristoratore non ha bisogno di un account Stripe già suo, e
 * l'onboarding è un modulo guidato in cui entra partita IVA e coordinate
 * bancarie. Un ristorante che deve prima crearsi un account Stripe da zero,
 * capire cos'è una chiave API e incollarla in un gestionale, semplicemente non
 * attiva la funzione.
 */

export type StatoStripe = {
  collegato: boolean;
  /** Vero solo quando Stripe accetta davvero incassi: vedi `account.updated`. */
  puoIncassare: boolean;
  puoRicevereBonifici: boolean;
  accountId: string | null;
  collegatoIl: Date | null;
  /** Vero quando l'onboarding è cominciato ma non finito. */
  daCompletare: boolean;
};

export function statoStripeDi(venue: {
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeOnboardedAt: Date | null;
}): StatoStripe {
  const collegato = !!venue.stripeAccountId;
  return {
    collegato,
    puoIncassare: collegato && venue.stripeChargesEnabled,
    puoRicevereBonifici: collegato && venue.stripePayoutsEnabled,
    accountId: venue.stripeAccountId,
    collegatoIl: venue.stripeOnboardedAt,
    daCompletare: collegato && !venue.stripeChargesEnabled,
  };
}

/**
 * Prepara l'account del locale, se non c'è, e restituisce dove mandarlo.
 *
 * L'account si crea una volta sola: chiamare di nuovo su un locale già
 * collegato non ne fabbrica un secondo — produce un nuovo **link** per
 * riprendere un onboarding lasciato a metà, che è esattamente quello che
 * serve quando qualcuno chiude la finestra a metà modulo.
 */
export async function linkOnboarding(
  venueId: string,
  opts: { ritornoUrl: string; riprovaUrl: string },
): Promise<string> {
  const stripe = stripeRichiesto();
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { id: true, name: true, email: true, country: true, stripeAccountId: true },
  });

  let accountId = venue.stripeAccountId;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      // Il paese si può indicare solo alla creazione e non si cambia più: se
      // il locale non l'ha dichiarato si lascia decidere a Stripe in base a
      // chi fa l'onboarding, invece di indovinare un paese sbagliato e
      // bloccare l'account per sempre.
      ...(venue.country ? { country: venue.country } : {}),
      ...(venue.email ? { email: venue.email } : {}),
      business_type: "company",
      business_profile: {
        name: venue.name,
        // 5812: «Eating places, restaurants». Dichiararlo evita che Stripe
        // chieda al ristoratore di indovinare la propria categoria.
        mcc: "5812",
      },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { tavolo_venue_id: venue.id },
    });
    accountId = account.id;
    await db.venue.update({ where: { id: venueId }, data: { stripeAccountId: accountId } });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: opts.riprovaUrl,
    return_url: opts.ritornoUrl,
    type: "account_onboarding",
  });

  return link.url;
}

/**
 * Richiede a Stripe lo stato attuale dell'account e lo riallinea.
 *
 * Normalmente lo fa il webhook `account.updated`, che è la via giusta. Questa
 * esiste per il ritorno dall'onboarding: il locale torna sulla pagina delle
 * impostazioni nello stesso secondo in cui Stripe manda l'evento, e mostrargli
 * «non collegato» subito dopo aver finito è il modo più rapido di fargli
 * credere che non abbia funzionato.
 */
export async function riallineaStripe(venueId: string): Promise<StatoStripe | null> {
  const stripe = stripeOpzionale();
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: {
      stripeAccountId: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeOnboardedAt: true,
    },
  });
  if (!stripe || !venue.stripeAccountId) return statoStripeDi(venue);

  try {
    const account = await stripe.accounts.retrieve(venue.stripeAccountId);
    const aggiornato = await db.venue.update({
      where: { id: venueId },
      data: {
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
        stripeOnboardedAt:
          venue.stripeOnboardedAt ??
          (account.charges_enabled && account.details_submitted ? new Date() : null),
      },
      select: {
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeOnboardedAt: true,
      },
    });
    return statoStripeDi(aggiornato);
  } catch {
    // Stripe non risponde: si mostra quello che sappiamo, invece di rompere
    // la pagina delle impostazioni.
    return statoStripeDi(venue);
  }
}

/**
 * Un collegamento al cruscotto Stripe del ristorante.
 *
 * Con Express il locale non ha un accesso diretto a Stripe: entra da qui, e ci
 * trova i propri incassi, i bonifici e i rimborsi. Senza questo link, un
 * ristoratore che volesse rimborsare un cliente non avrebbe nessun posto dove
 * andare.
 */
export async function linkCruscotto(venueId: string): Promise<string | null> {
  const stripe = stripeOpzionale();
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { stripeAccountId: true, stripeChargesEnabled: true },
  });
  if (!stripe || !venue.stripeAccountId || !venue.stripeChargesEnabled) return null;
  try {
    const link = await stripe.accounts.createLoginLink(venue.stripeAccountId);
    return link.url;
  } catch {
    return null;
  }
}

/**
 * Scollega il locale da Stripe.
 *
 * Non cancella l'account su Stripe — non è nostro, e ci sono dentro gli
 * incassi e la storia fiscale del ristorante. Toglie il legame e **spegne il
 * pagamento al tavolo**, perché un QR attivo su un locale che non può
 * incassare manda le persone contro un errore.
 */
export async function scollegaStripe(venueId: string): Promise<void> {
  await db.venue.update({
    where: { id: venueId },
    data: {
      stripeAccountId: null,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeOnboardedAt: null,
      qrPaymentsEnabled: false,
    },
  });
}
