import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  chiaveIdempotenza,
  perConto,
  stripeConfigurato,
  stripeOpzionale,
} from "@/lib/stripe";
import { recordAudit, type AuditActor } from "@/server/audit";
import {
  canaleTelefonoPerLocale,
  enqueueMessage,
} from "@/server/messaging/send";

/**
 * La caparra sulla prenotazione.
 *
 * ## Perché è la prima cosa che chiedono
 *
 * Perché il no-show è il costo più sentito da un ristorante, e la caparra è
 * l'unica difesa che funziona davvero: i concorrenti la vendono dichiarando
 * «fino all'80% di no-show in meno». In Tavolo `Booking.depositCents` e
 * `depositStatus` stavano nello schema dal primo giorno e `depositCents` era
 * **un numero che si scriveva a mano**: nessuno incassava niente.
 *
 * ## Perché non c'è un secondo modo di incassare
 *
 * I binari sono quelli del conto al tavolo: Checkout di Stripe con **addebito
 * diretto sull'account del ristorante**, chiave di idempotenza, e il webhook
 * che c'è già. Il denaro non passa da Tavolo, e non esiste un secondo posto
 * dove può sbagliare — che è il motivo per cui questo file è corto.
 *
 * ## Le tre cose che tiene ferme
 *
 * 1. **Chiesta non è pagata.** `REQUESTED` è uno stato vero: il tavolo è
 *    tenuto e il denaro non è arrivato, e chi guarda l'agenda deve poter
 *    vedere quale prenotazione sta rischiando.
 * 2. **Niente si annulla da solo.** Una prenotazione senza caparra pagata non
 *    si cancella per conto suo: quella è una decisione del locale, e un
 *    orologio che disdice le cene di qualcuno è la funzione peggiore che
 *    questo prodotto potrebbe avere.
 * 3. **Il rimborso è un gesto, non un automatismo.** Le ore di annullo
 *    gratuito sono la **regola dichiarata** che chi disdice legge; restituire
 *    il denaro lo decide chi gestisce la sala.
 */

export class CaparraError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "CaparraError";
  }
}

export const PoliticaInput = z
  .object({
    attiva: z.boolean(),
    daPersone: z.coerce.number().int().min(1).max(200),
    perPersonaCents: z.coerce.number().int().min(0).max(100_000).nullish(),
    fissaCents: z.coerce.number().int().min(0).max(1_000_000).nullish(),
    oreAnnulloGratis: z.coerce.number().int().min(0).max(720),
  })
  .refine((p) => !p.attiva || !!p.perPersonaCents || !!p.fissaCents, {
    message: "serve un importo",
    path: ["perPersonaCents"],
  })
  .refine((p) => !(p.perPersonaCents && p.fissaCents), {
    message: "uno dei due, non entrambi",
    path: ["fissaCents"],
  });

export type Politica = {
  attiva: boolean;
  daPersone: number;
  perPersonaCents: number | null;
  fissaCents: number | null;
  oreAnnulloGratis: number;
};

/**
 * Quanto si chiede per questa prenotazione, o `null` se non si chiede niente.
 *
 * Funzione pura: è la parte che decide un importo in denaro, e va provata da
 * sola senza database e senza Stripe. Un importo sbagliato non dà nessun
 * errore — dà un cliente che paga il doppio, e lo scopre lui.
 */
export function caparraDovutaCents(
  politica: Politica,
  persone: number,
): number | null {
  if (!politica.attiva) return null;
  if (persone < politica.daPersone) return null;

  /* L'importo fisso vince quando c'è, ma i due sono esclusivi già in
     validazione: qui l'ordine serve solo a non restituire una somma dei due
     se un giorno il vincolo salta. */
  if (politica.fissaCents && politica.fissaCents > 0)
    return politica.fissaCents;
  if (politica.perPersonaCents && politica.perPersonaCents > 0) {
    return politica.perPersonaCents * persone;
  }
  return null;
}

/** La politica di un locale, come la legge il resto del codice. */
export function politicaDi(venue: {
  caparraAttiva: boolean;
  caparraDaPersone: number;
  caparraPerPersonaCents: number | null;
  caparraFissaCents: number | null;
  caparraOreAnnulloGratis: number;
}): Politica {
  return {
    attiva: venue.caparraAttiva,
    daPersone: venue.caparraDaPersone,
    perPersonaCents: venue.caparraPerPersonaCents,
    fissaCents: venue.caparraFissaCents,
    oreAnnulloGratis: venue.caparraOreAnnulloGratis,
  };
}

export async function salvaPolitica(
  venueId: string,
  raw: unknown,
  opz: { actor?: AuditActor } = {},
): Promise<Politica> {
  const dati = PoliticaInput.parse(raw);
  const venue = await db.venue.update({
    where: { id: venueId },
    data: {
      caparraAttiva: dati.attiva,
      caparraDaPersone: dati.daPersone,
      caparraPerPersonaCents: dati.perPersonaCents ?? null,
      caparraFissaCents: dati.fissaCents ?? null,
      caparraOreAnnulloGratis: dati.oreAnnulloGratis,
    },
    select: {
      caparraAttiva: true,
      caparraDaPersone: true,
      caparraPerPersonaCents: true,
      caparraFissaCents: true,
      caparraOreAnnulloGratis: true,
    },
  });

  await recordAudit(opz.actor, "venue.caparra_update", "venue", venueId, {
    attiva: dati.attiva,
    daPersone: dati.daPersone,
    perPersonaCents: dati.perPersonaCents ?? null,
    fissaCents: dati.fissaCents ?? null,
    oreAnnulloGratis: dati.oreAnnulloGratis,
  });

  return politicaDi(venue);
}

export type EsitoCaparra = {
  /** Dove mandare il cliente a pagare. */
  url: string;
  paymentId: string;
  importoCents: number;
  /**
   * Se il link e **partito** verso il cliente, e su che canale.
   *
   * `null` quando non c'e modo di mandarlo — nessun numero, canale spento — e
   * allora lo si copia a mano. La differenza non e un dettaglio: «mandato» e
   * «da mandare» sono due cose che la sala deve fare in modo diverso, e dire
   * la prima quando vale la seconda lascia un cliente ad aspettare un
   * messaggio che nessuno ha spedito.
   */
  mandato: "SMS" | "WHATSAPP" | null;
};

/**
 * Chiede la caparra: prepara il pagamento e restituisce il link.
 *
 * ## Perché il link e non un addebito
 *
 * Perché la carta non ce l'abbiamo: chi prenota al telefono non detta il
 * numero a una voce, e chi prenota dal sito paga in una pagina di Stripe. Il
 * link si manda — per SMS, per WhatsApp, o si legge al telefono — e paga chi
 * deve pagare, sulla pagina di chi incassa.
 *
 * ## Perché lo stesso link vale due volte
 *
 * Perché un cliente lo apre, ci pensa, e lo riapre mezz'ora dopo. Finché la
 * caparra non è pagata la richiesta è **la stessa**: si riusa la sessione di
 * Stripe già aperta invece di aprirne una seconda, o due pagamenti per la
 * stessa cena finirebbero entrambi sull'account del ristorante.
 */
export async function chiediCaparra(
  venueId: string,
  bookingId: string,
  opz: {
    origine?: string;
    actor?: AuditActor;
    /**
     * Dove rimandare il cliente dopo Stripe.
     *
     * Chi paga da un link mandato per SMS torna sulle due pagine di
     * `/caparra` — non ha una pagina di partenza. Chi prenota dal sito invece
     * sta **dentro** un percorso: rimandarlo alla pagina di conferma della
     * sua prenotazione chiude il giro, e vede subito che la caparra risulta
     * pagata. Passarlo da qui evita un secondo posto dove si decide dove si
     * torna.
     */
    ritorno?: { successo: string; annullato: string };
    /** Non manda il messaggio: lo sta pagando adesso, davanti allo schermo. */
    senzaMessaggio?: boolean;
  } = {},
): Promise<EsitoCaparra> {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, venueId, deletedAt: null },
    select: {
      id: true,
      partySize: true,
      startsAt: true,
      status: true,
      depositCents: true,
      depositStatus: true,
      guest: { select: { firstName: true, email: true, phone: true } },
      venue: {
        select: {
          name: true,
          currency: true,
          smsAttivi: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
          caparraAttiva: true,
          caparraDaPersone: true,
          caparraPerPersonaCents: true,
          caparraFissaCents: true,
          caparraOreAnnulloGratis: true,
        },
      },
    },
  });
  if (!booking) throw new CaparraError("non_trovata");
  if (booking.depositStatus === "CAPTURED")
    throw new CaparraError("gia_pagata");
  if (["CANCELLED", "NO_SHOW", "COMPLETED"].includes(booking.status)) {
    throw new CaparraError("prenotazione_chiusa");
  }

  const politica = politicaDi(booking.venue);
  /* L'importo si calcola dalla politica **e non si accetta da fuori**: un
     importo che arriva da una richiesta è un importo che qualcuno può
     cambiare, e qui si parla del denaro di un cliente. */
  const importoCents = caparraDovutaCents(politica, booking.partySize);
  if (!importoCents) throw new CaparraError("nessuna_caparra");

  if (
    !stripeConfigurato() ||
    !booking.venue.stripeAccountId ||
    !booking.venue.stripeChargesEnabled
  ) {
    /* Si dice **cosa** manca, invece di un generico «non riuscito»: senza
       questo, «chiedi la caparra» che non funziona manda a cercare un guasto
       dove c'è solo una configurazione da fare. */
    throw new CaparraError("stripe_non_pronto");
  }

  const stripe = stripeOpzionale();
  if (!stripe) throw new CaparraError("stripe_non_pronto");

  /* Una richiesta già aperta si riusa: lo stesso cliente che riapre il link
     non deve poter pagare due volte la stessa cena. */
  const aperta = await db.payment.findFirst({
    where: {
      venueId,
      bookingId,
      kind: "DEPOSIT",
      status: { in: ["PENDING", "PROCESSING"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, amountCents: true, stripeCheckoutSessionId: true },
  });

  if (aperta?.stripeCheckoutSessionId) {
    const sessione = await stripe.checkout.sessions
      .retrieve(
        aperta.stripeCheckoutSessionId,
        perConto(booking.venue.stripeAccountId),
      )
      .catch(() => null);
    if (sessione?.url && sessione.status === "open") {
      /* `mandato: null`: il messaggio, se doveva partire, e partito la prima
         volta — e `kind` + `bookingId` impediscono il doppione. Dire «mandato»
         adesso sarebbe raccontare un invio che non e successo ora. */
      return {
        url: sessione.url,
        paymentId: aperta.id,
        importoCents: aperta.amountCents,
        mandato: null,
      };
    }
  }

  const payment = await db.payment.create({
    data: {
      venueId,
      bookingId,
      kind: "DEPOSIT",
      status: "PROCESSING",
      amountCents: importoCents,
      currency: booking.venue.currency,
      customerEmail: booking.guest?.email ?? null,
    },
    select: { id: true },
  });

  const base = (opz.origine ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(
    /\/$/,
    "",
  );
  const sessione = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: payment.id,
      ...(booking.guest?.email ? { customer_email: booking.guest.email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.venue.currency.toLowerCase(),
            unit_amount: importoCents,
            product_data: {
              name: `Caparra · ${booking.venue.name}`,
              /* Nella descrizione ci vanno **i coperti e il giorno**: è quello
                 che il cliente deve riconoscere per essere sicuro di pagare la
                 cena giusta. */
              description: `${booking.partySize} persone · ${booking.startsAt.toLocaleDateString("it-IT", { dateStyle: "full" })}`,
            },
          },
        },
      ],
      metadata: {
        tavolo_payment_id: payment.id,
        tavolo_booking_id: bookingId,
        tavolo_venue_id: venueId,
      },
      payment_intent_data: {
        description: `Caparra · ${booking.venue.name}`,
        metadata: {
          tavolo_payment_id: payment.id,
          tavolo_booking_id: bookingId,
        },
      },
      success_url: opz.ritorno?.successo ?? `${base}/caparra/fatto`,
      cancel_url: opz.ritorno?.annullato ?? `${base}/caparra/annullata`,
    },
    {
      ...perConto(booking.venue.stripeAccountId),
      ...chiaveIdempotenza(payment.id),
    },
  );

  if (!sessione.url) throw new CaparraError("stripe_senza_indirizzo");

  await db.payment.update({
    where: { id: payment.id },
    data: { stripeCheckoutSessionId: sessione.id },
  });

  /* La prenotazione dice **quanto** e **che è chiesta**: sono i due dati che
     servono in sala per sapere quale tavolo sta rischiando. */
  await db.booking.update({
    where: { id: bookingId },
    data: { depositCents: importoCents, depositStatus: "REQUESTED" },
  });

  /*
    Il link parte da solo, quando c'e un modo di mandarlo.

    Prima questa funzione restituiva un indirizzo e qualcuno doveva copiarlo e
    incollarlo in un messaggio: tre gesti in mezzo a un servizio, e il terzo
    salta. Il canale c'e dal 21 settembre (`messaging/sms.ts`), il numero e in
    scheda, e il testo dice la cifra e la cena — senza quelle due cose un link
    di pagamento arrivato per SMS si legge come una truffa.
  */
  const mandato = opz.senzaMessaggio
    ? null
    : await mandaIlLink({
        venueId,
        bookingId,
        nome: booking.guest?.firstName ?? null,
        telefono: booking.guest?.phone ?? null,
        locale: booking.venue.name,
        smsAttivi: booking.venue.smsAttivi,
        importoCents,
        valuta: booking.venue.currency,
        url: sessione.url,
      });

  await recordAudit(
    opz.actor,
    "booking.caparra_chiesta",
    "booking",
    bookingId,
    {
      importoCents,
      persone: booking.partySize,
      mandato,
    },
  );

  return { url: sessione.url, paymentId: payment.id, importoCents, mandato };
}

/**
 * Il messaggio con il link, e perche dice la cifra.
 *
 * Un link di pagamento arrivato per SMS senza contesto si legge come una
 * truffa — e nel 2026 la gente ha imparato a non toccarli. Il nome del locale,
 * la cifra e il giorno lo rendono riconoscibile: e la stessa ragione per cui
 * nella riga di Stripe c'e scritto quanti coperti e quando.
 *
 * Senza accenti, come tutti i nostri SMS: uno solo porta il messaggio da
 * centosessanta caratteri a settanta e lo fa costare il doppio (vedi
 * `messaging/sms.ts`).
 */
export function testoCaparra(dati: {
  nome: string | null;
  locale: string;
  importo: string;
  url: string;
}): string {
  const saluto = dati.nome ? `${dati.nome}, ` : "";
  return (
    `${saluto}per confermare il tavolo da ${dati.locale} serve una caparra di ` +
    `${dati.importo}. Si paga qui: ${dati.url}`
  );
}

/** Manda il link, se c'e un canale e un numero. */
async function mandaIlLink(dati: {
  venueId: string;
  bookingId: string;
  nome: string | null;
  telefono: string | null;
  locale: string;
  smsAttivi: boolean;
  importoCents: number;
  valuta: string;
  url: string;
}): Promise<"SMS" | "WHATSAPP" | null> {
  const numero = dati.telefono?.trim();
  if (!numero) return null;
  const canale = canaleTelefonoPerLocale(dati.smsAttivi);
  /* Solo i due canali che arrivano su un telefono: l'email qui non vale — di
     chi prenota al telefono non abbiamo l'indirizzo. */
  if (canale !== "SMS" && canale !== "WHATSAPP") return null;

  const importo = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: dati.valuta,
    maximumFractionDigits: 0,
  })
    .format(dati.importoCents / 100)
    /* Via lo spazio insecabile che l'italiano mette prima del simbolo: in un
       SMS non si vede e conta come carattere. */
    .replace(/\u00a0/g, " ");

  const esito = await enqueueMessage({
    venueId: dati.venueId,
    venueName: dati.locale,
    channel: canale,
    to: numero,
    bookingId: dati.bookingId,
    /* Con `bookingId` questa chiave impedisce il doppio invio: chi rifa il
       link non manda un secondo messaggio alla stessa persona. */
    kind: "booking.caparra",
    body: testoCaparra({
      nome: dati.nome,
      locale: dati.locale,
      importo,
      url: dati.url,
    }),
  });

  return esito.queued ? canale : null;
}

/**
 * La caparra è arrivata.
 *
 * La chiama `registraIncasso` dentro la sua transazione: il pagamento diventa
 * riuscito e la prenotazione lo dice nello stesso istante. Due scritture
 * separate lascerebbero una finestra in cui il denaro è incassato e l'agenda
 * dice ancora «da pagare» — e in quella finestra qualcuno telefona per
 * chiedere perché.
 */
export async function segnaCaparraPagata(
  tx: Prisma.TransactionClient,
  bookingId: string,
  importoCents: number,
): Promise<void> {
  await tx.booking.update({
    where: { id: bookingId },
    data: { depositStatus: "CAPTURED", depositCents: importoCents },
  });
}

/**
 * Restituisce la caparra.
 *
 * ## Perché non è automatico
 *
 * Perché «entro quarantotto ore si annulla senza perdere la caparra» è una
 * **regola dichiarata**, non un orologio che muove il denaro di qualcuno. Il
 * locale può avere ragioni per restituirla comunque — un lutto, un errore
 * loro — e per non restituirla mai. Un rimborso deciso da un timer è la cosa
 * che nessun ristoratore vuole scoprire a fine mese.
 *
 * Resta scritto **chi** l'ha deciso: è denaro che torna indietro.
 */
export async function rimborsaCaparra(
  venueId: string,
  bookingId: string,
  opz: { actor?: AuditActor } = {},
): Promise<{ rimborsatoCents: number }> {
  const payment = await db.payment.findFirst({
    where: { venueId, bookingId, kind: "DEPOSIT", status: "SUCCEEDED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      amountCents: true,
      stripePaymentId: true,
      venue: { select: { stripeAccountId: true } },
    },
  });
  if (!payment) throw new CaparraError("nessuna_caparra_pagata");
  if (!payment.stripePaymentId || !payment.venue.stripeAccountId) {
    throw new CaparraError("stripe_non_pronto");
  }

  const stripe = stripeOpzionale();
  if (!stripe) throw new CaparraError("stripe_non_pronto");

  await stripe.refunds.create(
    { payment_intent: payment.stripePaymentId },
    {
      ...perConto(payment.venue.stripeAccountId),
      /* Idempotente sul pagamento: due clic su «restituisci» non fanno due
         rimborsi. Lo stato lo scrive il webhook `charge.refunded`, che è la
         strada da cui passano anche i rimborsi fatti dal cruscotto di Stripe:
         una sola verità su quanto è tornato indietro. */
      ...chiaveIdempotenza(`rimborso-${payment.id}`),
    },
  );

  await db.booking.update({
    where: { id: bookingId },
    data: { depositStatus: "REFUNDED" },
  });

  await recordAudit(
    opz.actor,
    "booking.caparra_rimborsata",
    "booking",
    bookingId,
    {
      importoCents: payment.amountCents,
    },
  );

  return { rimborsatoCents: payment.amountCents };
}

/**
 * Cosa dire a chi disdice, secondo la regola del locale.
 *
 * Non muove niente: risponde a «la perdo?». Serve al telefono e nella pagina
 * dell'ospite — e dirlo **prima** che disdica è la differenza fra una
 * cancellazione con tre giorni di anticipo (che si rivende) e un no-show.
 */
export function caparraSiPerde(
  politica: Politica,
  inizio: Date,
  adesso: Date = new Date(),
): boolean {
  const oreDiAnticipo = (inizio.getTime() - adesso.getTime()) / 3_600_000;
  return oreDiAnticipo < politica.oreAnnulloGratis;
}

/* -------------------------------------------------------------------------- */
/*  La caparra di una prenotazione disdetta                                   */
/* -------------------------------------------------------------------------- */

/**
 * Avvisa che una prenotazione disdetta ha una caparra **già incassata**.
 *
 * ## Perché serve un avviso e non basta il pulsante
 *
 * Perché il pulsante «Restituisci» sta nella pagina di quella prenotazione, e
 * una prenotazione disdetta è esattamente la pagina che nessuno riapre. Il
 * denaro di un cliente resterebbe lì perché nessuno se l'è ricordato — e un
 * ristoratore che si accorge a fine mese di avere in cassa la caparra di
 * qualcuno che aveva disdetto in tempo ha un problema con quel cliente, non
 * con noi.
 *
 * ## Perché dice **quale dei due casi** è, e non decide
 *
 * Perché la regola del locale (`caparraOreAnnulloGratis`) dice se quella
 * disdetta era in tempo, e sono due frasi diverse: «va restituita» e «puoi
 * tenerla». Ma restituire resta un gesto — un rimborso deciso da un orologio
 * è la cosa che nessun ristoratore vuole scoprire a fine mese, e la simmetria
 * vale: nemmeno trattenere si decide da soli.
 */
export async function avvisaCaparraDaRestituire(
  venueId: string,
  booking: { id: string; startsAt: Date; depositCents: number; depositStatus: string },
  adesso: Date = new Date(),
): Promise<boolean> {
  if (booking.depositStatus !== "CAPTURED" || booking.depositCents <= 0) return false;

  const venue = await db.venue.findUnique({
    where: { id: venueId },
    select: {
      currency: true,
      caparraAttiva: true,
      caparraDaPersone: true,
      caparraPerPersonaCents: true,
      caparraFissaCents: true,
      caparraOreAnnulloGratis: true,
    },
  });
  if (!venue) return false;

  const inRitardo = caparraSiPerde(politicaDi(venue), booking.startsAt, adesso);
  const importo = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: venue.currency,
  }).format(booking.depositCents / 100);

  const { createNotification } = await import("@/server/notifications");
  await createNotification(venueId, {
    kind: "PAYMENT_REFUND",
    title: inRitardo
      ? `Caparra di ${importo} su una prenotazione disdetta`
      : `Caparra di ${importo} da restituire`,
    body: inRitardo
      ? "Ha disdetto oltre il tempo dichiarato: secondo le tue condizioni puoi tenerla. Se decidi di restituirla, il pulsante è sulla prenotazione."
      : "Ha disdetto entro il tempo dichiarato nelle tue condizioni: la caparra va restituita. Il pulsante è sulla prenotazione.",
    link: `/bookings/${booking.id}`,
    meta: { bookingId: booking.id, importoCents: booking.depositCents, inRitardo },
  });

  return true;
}
