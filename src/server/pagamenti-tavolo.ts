import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { chiaveIdempotenza, perConto, stripeConfigurato, stripeRichiesto } from "@/lib/stripe";
import { manciaPercentuale, quotaDivisa } from "@/lib/conto-diviso";
import {
  ContoTavoloError,
  leggiContoPerOrder,
  tavoloDaToken,
  trovaOrderIdDelTavolo,
  type ContoTavolo,
} from "./conto-tavolo";

/**
 * Incassare il conto di un tavolo, senza incassarlo due volte.
 *
 * ## Il problema vero
 *
 * Sei persone a tavola hanno in mano sei telefoni, e sulla stessa pagina.
 * Mario e Giulia premono «paga tutto» nello stesso secondo: se il server si
 * fida di quello che gli arriva, Stripe addebita 124 € a testa e il locale
 * incassa il doppio della cena che ha servito. È lo scenario che il brief
 * chiede di testare esplicitamente, ed è quello attorno a cui è costruito
 * tutto questo file.
 *
 * Tre difese, in quest'ordine:
 *
 * 1. **L'importo non arriva mai dal telefono.** Il client dice *cosa* vuole
 *    pagare («tutto», «un quarto», «queste tre portate»); l'importo lo
 *    ricalcola il server sul residuo di quell'istante. Un client modificato
 *    può chiedere di pagare meno del dovuto — cosa che nessuno fa — ma non può
 *    far risultare pagato ciò che non lo è.
 * 2. **Una serratura sul conto.** `SELECT ... FOR UPDATE` sulla riga
 *    dell'ordine: due tentativi sullo stesso tavolo si mettono in fila invece
 *    di leggere entrambi lo stesso residuo e crederlo disponibile. È la sola
 *    difesa che regge fra processi diversi — e su Vercel ogni richiesta può
 *    essere un processo diverso, quindi qualunque controllo in memoria qui
 *    sarebbe teatro.
 * 3. **L'impegno prima dell'addebito.** Il `Payment` nasce `PROCESSING` e
 *    sottrae il proprio importo dal residuo *prima* che il cliente veda la
 *    pagina di Stripe. Chi arriva dopo trova un residuo già ridotto.
 *
 * ## Perché la serratura non abbraccia la chiamata a Stripe
 *
 * La sessione di pagamento si crea **fuori** dalla transazione. Tenere una
 * riga di Postgres bloccata per tutto il tempo di una chiamata di rete
 * significa che un rallentamento di Stripe diventa un tavolo intero che non
 * può pagare; e una transazione aperta su una chiamata esterna è il modo
 * classico di esaurire il pool di connessioni. Dentro la serratura ci sta solo
 * l'aritmetica, che dura millisecondi.
 *
 * Il prezzo di questa scelta è che fra il `COMMIT` e la sessione di Stripe c'è
 * una finestra in cui esiste un impegno senza pagamento. Si paga volentieri:
 * quell'impegno **scade** (vedi `SCADENZA_MIN`), e nel frattempo protegge
 * esattamente ciò che deve proteggere.
 */

/* -------------------------------------------------------------------------- */
/*  Quanto dura un tentativo                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Per quanti minuti un tentativo tiene impegnata la sua parte di conto.
 *
 * Quindici: abbastanza perché una persona trovi la carta, sbagli il codice e
 * riprovi; poco abbastanza perché un telefono rimasto senza batteria non
 * blocchi il dolce degli altri fino a fine servizio. È anche la scadenza che
 * si passa a Stripe, così le due non possono divergere — un impegno che dura
 * meno della sessione di pagamento farebbe arrivare un incasso su un conto che
 * lo considera già libero.
 */
const SCADENZA_MIN = 15;

/* -------------------------------------------------------------------------- */
/*  Cosa il cliente può chiedere                                              */
/* -------------------------------------------------------------------------- */

/**
 * Le quattro modalità del brief. Quello che arriva dal telefono è **l'intenzione**,
 * non la cifra: `tutto` non porta un importo, `quota` porta in quante persone,
 * `righe` porta quali unità. L'unico numero che il client può proporre è
 * l'importo libero, e quello viene comunque limitato al residuo vero.
 */
export const ModoPagamento = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("tutto") }),
  z.object({ modo: z.literal("quota"), parti: z.coerce.number().int().min(2).max(50) }),
  z.object({
    modo: z.literal("righe"),
    selezione: z
      .array(z.object({ orderItemId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(99) }))
      .min(1)
      .max(100),
  }),
  z.object({ modo: z.literal("importo"), importoCents: z.coerce.number().int().min(1).max(100_000_00) }),
]);

export const AvvioPagamento = z.intersection(
  ModoPagamento,
  z.object({
    /** La mancia: una percentuale del conto, oppure una cifra scelta a mano. */
    manciaPercento: z.coerce.number().min(0).max(100).optional(),
    manciaCents: z.coerce.number().int().min(0).max(100_000_00).optional(),
    /** Facoltativa: serve solo a mandare la ricevuta a chi la vuole. */
    email: z.string().email().max(200).optional().nullable(),
    /**
     * Quanto il cliente **credeva** di dover pagare quando ha premuto.
     *
     * Se nel frattempo qualcun altro ha pagato, la cifra ricalcolata è
     * diversa, e mandare la persona su Stripe con un importo che non ha mai
     * visto è il modo di farsi accusare di aver addebitato a caso. Con questo
     * il server se ne accorge e risponde «il conto è appena cambiato», con la
     * cifra nuova.
     */
    attesoCents: z.coerce.number().int().min(0).optional(),
  }),
);

export type AvvioPagamentoInput = z.infer<typeof AvvioPagamento>;

export class PagamentoError extends Error {
  constructor(
    public code:
      | "conto_cambiato"
      | "residuo_esaurito"
      | "importo_troppo_basso"
      | "importo_oltre_residuo"
      | "righe_non_disponibili"
      | "stripe_non_collegato"
      | "stripe_rifiutato",
    public dettaglio?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "PagamentoError";
  }
}

/* -------------------------------------------------------------------------- */
/*  La serratura                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Mette in fila chi tocca lo stesso conto.
 *
 * `FOR UPDATE` blocca la riga dell'ordine fino al `COMMIT`: il secondo
 * tentativo sullo stesso tavolo si ferma qui e riparte quando il primo ha
 * finito, leggendo un residuo che tiene già conto di quello che il primo ha
 * impegnato.
 *
 * Non serve leggere niente da questa riga — il conto si rilegge dopo, con le
 * sue righe — serve solo prendere la serratura, ed è per questo che la query
 * seleziona una costante.
 */
async function serrature(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
}

/* -------------------------------------------------------------------------- */
/*  Quanto si paga davvero                                                    */
/* -------------------------------------------------------------------------- */

type Calcolo = {
  billCents: number;
  allocazioni: { orderItemId: string; quantity: number; amountCents: number }[];
  descrizione: string;
};

/**
 * Traduce l'intenzione del cliente in una cifra, sul conto di **adesso**.
 *
 * Gira dentro la serratura, e tutto quello che legge è la fotografia appena
 * ripresa: è questa funzione il motivo per cui due «paga tutto» simultanei non
 * fanno arrivare il doppio.
 */
function calcola(conto: ContoTavolo, input: AvvioPagamentoInput): Calcolo {
  if (conto.residuoCents <= 0) throw new PagamentoError("residuo_esaurito");

  switch (input.modo) {
    case "tutto":
      return { billCents: conto.residuoCents, allocazioni: [], descrizione: "Saldo del conto" };

    case "quota": {
      const quota = quotaDivisa(conto.residuoCents, input.parti);
      return {
        billCents: quota,
        allocazioni: [],
        descrizione: `Quota 1 di ${input.parti}`,
      };
    }

    case "importo": {
      if (input.importoCents > conto.residuoCents) {
        throw new PagamentoError("importo_oltre_residuo", { residuoCents: conto.residuoCents });
      }
      // Il minimo non si applica quando il residuo stesso è più piccolo: un
      // conto che resta aperto per ottanta centesimi non si chiuderebbe mai.
      const minimo = Math.min(conto.locale.minPaymentCents, conto.residuoCents);
      if (input.importoCents < minimo) {
        throw new PagamentoError("importo_troppo_basso", { minimoCents: minimo });
      }
      return { billCents: input.importoCents, allocazioni: [], descrizione: "Importo scelto" };
    }

    case "righe": {
      const perRiga = new Map(conto.righe.map((r) => [r.id, r]));
      const allocazioni: Calcolo["allocazioni"] = [];
      let billCents = 0;
      let unita = 0;

      for (const scelta of input.selezione) {
        const riga = perRiga.get(scelta.orderItemId);
        // Una riga sconosciuta o già presa non è un errore da nascondere: è
        // esattamente il caso «qualcuno ha appena pagato il tuo Barolo», e la
        // pagina deve poterlo raccontare invece di addebitare altro.
        if (!riga || scelta.quantity > riga.disponibili) {
          throw new PagamentoError("righe_non_disponibili", {
            orderItemId: scelta.orderItemId,
            disponibili: riga?.disponibili ?? 0,
          });
        }
        const importo = riga.prezzoUnitarioCents * scelta.quantity;
        allocazioni.push({ orderItemId: riga.id, quantity: scelta.quantity, amountCents: importo });
        billCents += importo;
        unita += scelta.quantity;
      }

      if (billCents <= 0) throw new PagamentoError("righe_non_disponibili");
      // Le righe selezionate possono superare il residuo quando parte del
      // conto è già stata coperta da una gift card o da uno sconto in punti:
      // in quel caso si paga quello che resta, non di più.
      if (billCents > conto.residuoCents) billCents = conto.residuoCents;

      return {
        billCents,
        allocazioni,
        descrizione: unita === 1 ? "1 portata" : `${unita} portate`,
      };
    }
  }
}

/** La mancia scelta, sul conto appena calcolato. */
function mancia(billCents: number, input: AvvioPagamentoInput, conto: ContoTavolo): number {
  if (!conto.locale.tipsEnabled) return 0;
  if (input.manciaCents != null) return input.manciaCents;
  if (input.manciaPercento != null) return manciaPercentuale(billCents, input.manciaPercento);
  return 0;
}

/* -------------------------------------------------------------------------- */
/*  Avvio                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * La parte che deve essere serializzata: legge il conto, decide la cifra,
 * scrive l'impegno. **Tutto dentro una sola transazione con la serratura.**
 *
 * Sta in una funzione sua e non dentro `avviaPagamento` per un motivo pratico
 * quanto importante: così si può metterla sotto test. Il caso che il brief
 * chiede di provare — due persone che pagano lo stesso residuo nello stesso
 * istante — si gioca tutto qui dentro, e un test che dovesse passare da Stripe
 * per arrivarci non lo scriverebbe nessuno. Vedi `tests/pagamento-tavolo.test.ts`.
 */
export async function impegnaPagamento(
  tavolo: Awaited<ReturnType<typeof tavoloDaToken>>,
  input: AvvioPagamentoInput,
  adesso = new Date(),
) {
  const scadenza = new Date(adesso.getTime() + SCADENZA_MIN * 60_000);

  return db.$transaction(async (tx) => {
    const orderId = await trovaOrderIdDelTavolo(tx, tavolo.venueId, tavolo.id);
    if (!orderId) throw new ContoTavoloError("nessun_conto");

    await serrature(tx, orderId);

    // Riletto **dopo** la serratura: è la fotografia su cui si decide, e
    // qualunque cosa sia successa nel frattempo è già dentro.
    const conto = await leggiContoPerOrder(tx, orderId, tavolo, adesso);
    const calcolo = calcola(conto, input);

    if (input.attesoCents != null && input.attesoCents !== calcolo.billCents) {
      throw new PagamentoError("conto_cambiato", {
        attesoCents: input.attesoCents,
        realeCents: calcolo.billCents,
        residuoCents: conto.residuoCents,
      });
    }

    const tipCents = mancia(calcolo.billCents, input, conto);

    const payment = await tx.payment.create({
      data: {
        venueId: tavolo.venueId,
        orderId,
        tableId: tavolo.id,
        bookingId: null,
        kind: "TABLE_QR",
        status: "PROCESSING",
        // Il totale è conto + mancia: è quello che il cliente vede addebitato.
        amountCents: calcolo.billCents + tipCents,
        tipCents,
        currency: conto.locale.currency,
        customerEmail: input.email ?? null,
        expiresAt: scadenza,
      },
    });

    if (calcolo.allocazioni.length > 0) {
      await tx.paymentAllocation.createMany({
        data: calcolo.allocazioni.map((a) => ({
          paymentId: payment.id,
          orderId,
          orderItemId: a.orderItemId,
          quantity: a.quantity,
          amountCents: a.amountCents,
          status: "RESERVED" as const,
        })),
      });
    }

    return { payment, conto, calcolo, tipCents };
  });
}

export type PagamentoAvviato = {
  paymentId: string;
  /** Dove mandare il cliente: la pagina di pagamento ospitata da Stripe. */
  url: string;
  billCents: number;
  tipCents: number;
  totalCents: number;
};

/**
 * Prepara un pagamento e restituisce dove mandare il cliente.
 *
 * Tre tempi, e l'ordine conta:
 *
 * 1. **dentro la serratura**, si rilegge il conto, si calcola la cifra e si
 *    scrive l'impegno — un `Payment` in corso con le sue allocazioni;
 * 2. **fuori**, si chiede a Stripe la pagina di pagamento;
 * 3. se Stripe rifiuta, l'impegno si libera subito invece di aspettare la
 *    scadenza: il tavolo non deve accorgersi del nostro guasto.
 */
export async function avviaPagamento(
  token: string,
  raw: unknown,
  opts: { origine?: string } = {},
): Promise<PagamentoAvviato> {
  const input = AvvioPagamento.parse(raw);
  const tavolo = await tavoloDaToken(token);

  /*
    Tre condizioni, e tutte e tre dicono la stessa cosa al cliente.

    `stripeConfigurato()` sembra ridondante — se mancassero le chiavi non si
    sarebbe potuto collegare niente — e non lo è: le chiavi della piattaforma
    possono sparire **dopo**, quando un locale ha già acceso il QR. Senza
    questo controllo si arriverebbe fino alla chiamata a Stripe, che fallisce,
    e chi è a tavola leggerebbe «riprova fra un istante» — un invito a
    riprovare una cosa che non può funzionare. Meglio dire subito la verità:
    qui non si paga col telefono, chiedi il conto.
  */
  if (!stripeConfigurato() || !tavolo.venue.stripeAccountId || !tavolo.venue.stripeChargesEnabled) {
    throw new PagamentoError("stripe_non_collegato");
  }

  // --- 1. Dentro la serratura: si decide la cifra e si impegna il conto. ---
  const preparato = await impegnaPagamento(tavolo, input);

  // --- 2. Fuori dalla serratura: la pagina di pagamento. ---
  const { payment, conto, calcolo, tipCents } = preparato;
  const base = (opts.origine ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  try {
    const stripe = stripeRichiesto();
    const sessione = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // I metodi disponibili li decide Stripe in base al dispositivo e al
        // paese: elencarli a mano qui significherebbe escludere Apple Pay il
        // giorno in cui il locale lo attiva. Vedi DESIGN del brief, punto 10.
        automatic_tax: { enabled: false },
        locale: "it",
        client_reference_id: payment.id,
        // La ricevuta arriva a chi ha lasciato l'indirizzo; a chi non l'ha
        // lasciato, Stripe non lo chiede.
        ...(payment.customerEmail ? { customer_email: payment.customerEmail } : {}),
        expires_at: Math.floor(payment.expiresAt!.getTime() / 1000),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: conto.locale.currency.toLowerCase(),
              unit_amount: calcolo.billCents,
              product_data: {
                name: `${conto.locale.nome} · Tavolo ${conto.tavolo}`,
                description: calcolo.descrizione,
              },
            },
          },
          ...(tipCents > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: conto.locale.currency.toLowerCase(),
                    unit_amount: tipCents,
                    product_data: { name: "Mancia" },
                  },
                },
              ]
            : []),
        ],
        // Il metadato è la corda di sicurezza: se un evento arrivasse senza
        // che si riesca a risalire alla sessione, l'identificativo del
        // pagamento è comunque lì dentro.
        metadata: {
          tavolo_payment_id: payment.id,
          tavolo_order_id: conto.orderId,
          tavolo_venue_id: conto.venueId,
          tavolo_table_id: conto.tableId,
          tavolo_bill_cents: String(calcolo.billCents),
          tavolo_tip_cents: String(tipCents),
        },
        payment_intent_data: {
          description: `${conto.locale.nome} · Tavolo ${conto.tavolo}`,
          metadata: { tavolo_payment_id: payment.id },
        },
        success_url: `${base}/pay/${token}/fatto?p=${payment.id}`,
        cancel_url: `${base}/pay/${token}?annullato=${payment.id}`,
      },
      // Addebito diretto sull'account del ristorante: il denaro non passa da
      // Tavolo. E la chiave d'idempotenza copre il doppio tocco sul pulsante.
      { ...perConto(tavolo.venue.stripeAccountId), ...chiaveIdempotenza(payment.id) },
    );

    if (!sessione.url) throw new Error("Stripe non ha restituito un indirizzo di pagamento");

    await db.payment.update({
      where: { id: payment.id },
      data: { stripeCheckoutSessionId: sessione.id, stripePaymentId: idDaSessione(sessione.payment_intent) },
    });

    return {
      paymentId: payment.id,
      url: sessione.url,
      billCents: calcolo.billCents,
      tipCents,
      totalCents: calcolo.billCents + tipCents,
    };
  } catch (err) {
    // --- 3. Stripe ha detto di no: si libera subito. ---
    await liberaPagamento(payment.id, "FAILED").catch(() => undefined);
    if (err instanceof PagamentoError) throw err;
    throw new PagamentoError("stripe_rifiutato", { causa: err instanceof Error ? err.message : String(err) });
  }
}

function idDaSessione(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/* -------------------------------------------------------------------------- */
/*  Liberazione                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Libera un tentativo che non è andato a buon fine.
 *
 * Non tocca mai un pagamento già riuscito: se il webhook di conferma e quello
 * di scadenza arrivano nell'ordine sbagliato — Stripe non garantisce l'ordine
 * — annullare qui cancellerebbe un incasso vero.
 */
export async function liberaPagamento(
  paymentId: string,
  stato: "FAILED" | "CANCELLED" | "EXPIRED",
): Promise<void> {
  await db.$transaction(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (!p || p.status === "SUCCEEDED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED") return;

    await tx.payment.update({
      where: { id: paymentId },
      data: { status: stato, failedAt: stato === "FAILED" ? new Date() : undefined, expiresAt: null },
    });
    await tx.paymentAllocation.updateMany({
      where: { paymentId, status: "RESERVED" },
      data: { status: stato === "EXPIRED" ? "EXPIRED" : "RELEASED" },
    });
  });
}

/**
 * Libera tutti i tentativi scaduti di questa installazione.
 *
 * La scadenza è già rispettata in lettura — un impegno scaduto non conta nel
 * residuo — quindi questo non serve alla correttezza: serve a non lasciare in
 * tabella righe `PROCESSING` eterne che a fine mese sembrano pagamenti
 * rimasti a metà. Gira dal lavoro periodico.
 */
export async function scadiPagamentiVecchi(adesso = new Date()): Promise<number> {
  const scaduti = await db.payment.findMany({
    where: { kind: "TABLE_QR", status: "PROCESSING", expiresAt: { lt: adesso } },
    select: { id: true },
    take: 500,
  });
  for (const p of scaduti) await liberaPagamento(p.id, "EXPIRED");
  return scaduti.length;
}

/* -------------------------------------------------------------------------- */
/*  Incasso                                                                   */
/* -------------------------------------------------------------------------- */

export type EsitoIncasso = {
  /** Falso quando l'evento era già stato lavorato: non è un errore. */
  applicato: boolean;
  paymentId: string;
  venueId: string;
  orderId: string | null;
  billCents: number;
  tipCents: number;
  /** Quanto resta al tavolo **dopo** questo incasso. */
  residuoCents: number;
  /** Vero quando questo pagamento ha chiuso il conto. */
  saldato: boolean;
};

/**
 * Registra un incasso confermato da Stripe.
 *
 * ## Il redirect non conta
 *
 * Il cliente che torna sulla pagina «fatto» ha soltanto *chiuso una scheda del
 * browser*: non è una prova che il denaro sia arrivato, e chiunque può
 * aprire quell'indirizzo a mano. L'unica fonte di verità è l'evento firmato
 * che Stripe manda al server, ed è questa funzione.
 *
 * ## Idempotenza a due livelli
 *
 * Stripe consegna **almeno una volta**: lo stesso evento può arrivare due
 * volte, e due eventi diversi (`checkout.session.completed` e
 * `payment_intent.succeeded`) raccontano lo stesso incasso. Quindi:
 *
 * - la tabella `WebhookEvent` scarta l'evento già visto, per identificativo;
 * - e comunque, qui dentro, un pagamento già `SUCCEEDED` esce senza toccare
 *   niente. La seconda difesa esiste perché la prima non copre il caso di due
 *   eventi *diversi* sullo stesso pagamento.
 *
 * Tutto in una transazione sola, con la stessa serratura sul conto che usa
 * l'avvio: fra il momento in cui si legge il residuo e quello in cui si
 * chiude il conto non deve poter entrare nessuno.
 */
export async function registraIncasso(input: {
  paymentId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  metodo?: string | null;
  email?: string | null;
}): Promise<EsitoIncasso | null> {
  return db.$transaction(async (tx) => {
    const payment = await trovaPagamento(tx, input);
    if (!payment) return null;

    // Già incassato: l'evento è un doppione, o è il secondo evento dello
    // stesso pagamento. Non è un errore, e non va segnalato come tale.
    if (payment.status === "SUCCEEDED" || payment.status === "PARTIALLY_REFUNDED" || payment.status === "REFUNDED") {
      return {
        applicato: false,
        paymentId: payment.id,
        venueId: payment.venueId,
        orderId: payment.orderId,
        billCents: payment.amountCents - payment.tipCents,
        tipCents: payment.tipCents,
        residuoCents: 0,
        saldato: false,
      };
    }

    if (payment.orderId) await serrature(tx, payment.orderId);

    const adesso = new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        paidAt: adesso,
        // L'impegno non serve più: da adesso questo importo è incassato, non
        // riservato, e lasciare una scadenza lo esporrebbe al lavoro periodico.
        expiresAt: null,
        paymentMethod: input.metodo ?? payment.paymentMethod,
        stripePaymentId: input.paymentIntentId ?? payment.stripePaymentId,
        // Se il cliente ha lasciato l'indirizzo su Stripe e non da noi, si
        // prende quello: è comunque suo, e l'ha scritto per ricevere la
        // ricevuta.
        customerEmail: payment.customerEmail ?? input.email ?? null,
      },
    });

    // Le portate impegnate diventano pagate: da qui non tornano più
    // disponibili, se non con un rimborso.
    await tx.paymentAllocation.updateMany({
      where: { paymentId: payment.id, status: "RESERVED" },
      data: { status: "PAID" },
    });

    const billCents = payment.amountCents - payment.tipCents;
    let residuoCents = 0;
    let saldato = false;

    if (payment.orderId) {
      const conto = await ricalcolaResiduo(tx, payment.orderId, adesso);
      residuoCents = conto.residuoCents;
      saldato = conto.residuoCents <= 0 && conto.daPagareCents > 0;

      // `Order.paymentStatus` esisteva già e non lo scriveva nessuno: è il
      // posto giusto per «questo conto è saldato», e lo rende visibile a
      // chiunque legga l'ordine senza dover rifare la somma dei pagamenti.
      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: saldato ? "SUCCEEDED" : "PENDING" },
      });
    }

    return {
      applicato: true,
      paymentId: payment.id,
      venueId: payment.venueId,
      orderId: payment.orderId,
      billCents,
      tipCents: payment.tipCents,
      residuoCents,
      saldato,
    };
  });
}

/**
 * Ritrova il pagamento a cui un evento si riferisce.
 *
 * Tre strade, dalla più precisa alla più tollerante, perché Stripe non manda
 * sempre gli stessi campi: l'identificativo che abbiamo messo noi nei
 * metadati, la sessione di pagamento, l'intento. Cercarne una sola
 * significherebbe perdere incassi veri sul tipo di evento sbagliato.
 */
async function trovaPagamento(
  tx: Prisma.TransactionClient,
  input: { paymentId?: string | null; checkoutSessionId?: string | null; paymentIntentId?: string | null },
) {
  if (input.paymentId) {
    const p = await tx.payment.findUnique({ where: { id: input.paymentId } });
    if (p) return p;
  }
  if (input.checkoutSessionId) {
    const p = await tx.payment.findUnique({ where: { stripeCheckoutSessionId: input.checkoutSessionId } });
    if (p) return p;
  }
  if (input.paymentIntentId) {
    const p = await tx.payment.findFirst({ where: { stripePaymentId: input.paymentIntentId } });
    if (p) return p;
  }
  return null;
}

/**
 * Il residuo di un conto, ricalcolato dalle sue righe e dai suoi pagamenti.
 *
 * Non passa da `leggiContoPerOrder` perché quella parte dal tavolo e dal suo
 * token — qui il tavolo può non esserci più (il QR può essere stato
 * rigenerato mentre il cliente era su Stripe) e l'incasso va registrato
 * comunque: il denaro è arrivato, e rifiutarlo perché è cambiato un adesivo
 * sarebbe assurdo.
 */
async function ricalcolaResiduo(
  tx: Prisma.TransactionClient,
  orderId: string,
  adesso: Date,
): Promise<{ residuoCents: number; daPagareCents: number }> {
  const [righe, giftCard, punti, pagamenti] = await Promise.all([
    tx.orderItem.findMany({ where: { orderId }, select: { priceCents: true, quantity: true } }),
    tx.giftCardRedemption.aggregate({ where: { orderId }, _sum: { amountCents: true } }),
    tx.loyaltyTransaction.aggregate({ where: { orderId, kind: "REDEEMED" }, _sum: { amountCents: true } }),
    tx.payment.findMany({
      where: { orderId, deletedAt: null, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "PROCESSING"] } },
      select: { status: true, amountCents: true, tipCents: true, refundedCents: true, expiresAt: true },
    }),
  ]);

  const totale = righe.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  const sconti = (giftCard._sum.amountCents ?? 0) + (punti._sum.amountCents ?? 0);
  const daPagareCents = Math.max(0, totale - sconti);

  let coperto = 0;
  for (const p of pagamenti) {
    const conto = p.amountCents - p.tipCents;
    if (p.status === "PROCESSING") {
      if (!p.expiresAt || p.expiresAt > adesso) coperto += conto;
    } else {
      coperto += Math.max(0, conto - p.refundedCents);
    }
  }

  return { residuoCents: Math.max(0, daPagareCents - coperto), daPagareCents };
}

/**
 * Registra un rimborso arrivato da Stripe.
 *
 * Un rimborso parziale **non** è un rimborso: segnare solo `REFUNDED`
 * toglierebbe dall'incasso anche la parte che il locale ha tenuto. E le
 * portate pagate tornano disponibili solo se il rimborso è totale — di un
 * mezzo rimborso non si sa quale piatto riguardi.
 */
export async function registraRimborso(input: {
  paymentIntentId?: string | null;
  checkoutSessionId?: string | null;
  rimborsatoCents: number;
}): Promise<{ paymentId: string; venueId: string; totale: boolean } | null> {
  return db.$transaction(async (tx) => {
    const payment = await trovaPagamento(tx, input);
    if (!payment) return null;

    const totale = input.rimborsatoCents >= payment.amountCents;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: totale ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundedCents: input.rimborsatoCents,
        refundedAt: new Date(),
      },
    });

    if (totale) {
      await tx.paymentAllocation.updateMany({
        where: { paymentId: payment.id, status: "PAID" },
        data: { status: "RELEASED" },
      });
      if (payment.orderId) {
        await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: "PENDING" } });
      }
    }

    return { paymentId: payment.id, venueId: payment.venueId, totale };
  });
}
