import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STATI_IMPEGNATIVI, STATI_INCASSATI } from "@/lib/pagamento-vista";
import { tokenPlausibile } from "@/lib/pay-token";

/**
 * Il conto di un tavolo, visto da chi ci è seduto.
 *
 * ## Il QR punta al tavolo, non al conto
 *
 * È la decisione che regge tutta la funzione. Un QR legato a un conto sarebbe
 * un foglio da stampare a ogni servizio; legato al **tavolo** si stampa una
 * volta e resta incollato al legno per anni. Il prezzo di questa scelta è che
 * «qual è il conto di questo tavolo *adesso*» diventa una domanda vera, ed è
 * quello che risolve questo modulo.
 *
 * La catena è quella che il gestionale già usa in sala:
 *
 *     Table → Booking (seduta, non chiusa) → Order (aperto)
 *
 * e non `Order.tableLabel`, che è una stringa: rinominare il tavolo 12 in «12
 * bis» a metà serata sposterebbe il conto su un tavolo che non esiste. Il
 * legame vero è `Booking.tableId`, che è una chiave esterna.
 *
 * ## Il residuo non sta in colonna
 *
 * `paidAmount` e `remainingAmount` non esistono come campi, di proposito: si
 * sommano dai `Payment` di quel conto, dentro la stessa transazione che
 * incassa. Un totale copiato accanto alle righe che lo compongono è un totale
 * che prima o poi le contraddice — e qui contraddirle significa incassare due
 * volte la stessa cena, o non incassarla affatto.
 */

export type StatoConto =
  /** Aperto, nessuno ha ancora pagato niente. */
  | "OPEN"
  /** Qualcuno ha pagato una parte. */
  | "PARTIALLY_PAID"
  /** C'è almeno un pagamento in corso in questo momento. */
  | "PAYMENT_IN_PROGRESS"
  /** Il residuo è zero: il tavolo ha saldato. */
  | "PAID"
  /** Il conto è stato chiuso in cassa. */
  | "CLOSED";

/** Una riga del conto, con quanto ne resta da pagare. */
export type RigaPagabile = {
  id: string;
  nome: string;
  prezzoUnitarioCents: number;
  /** Quante unità sono state ordinate. */
  quantita: number;
  /** Quante sono già state pagate da qualcuno. */
  pagate: number;
  /** Quante sono impegnate da un pagamento in corso, adesso. */
  impegnate: number;
  /** Quante se ne possono ancora selezionare: `quantita - pagate - impegnate`. */
  disponibili: number;
};

export type ContoTavolo = {
  orderId: string;
  venueId: string;
  tableId: string;
  tavolo: string;
  locale: {
    id: string;
    nome: string;
    logoUrl: string | null;
    accento: string | null;
    currency: string;
    tipsEnabled: boolean;
    tipPresets: number[];
    minPaymentCents: number;
  };
  stato: StatoConto;
  /** Quanto è stato consumato: la somma delle righe. */
  totaleCents: number;
  /** Già scalato prima di arrivare qui: gift card e sconti in punti. */
  scontiCents: number;
  /** Quello che il tavolo deve davvero, al netto degli sconti. */
  daPagareCents: number;
  /** Quanto è già stato incassato col QR. */
  pagatoCents: number;
  /** Quanto è impegnato da pagamenti in corso in questo istante. */
  inCorsoCents: number;
  /** Quello che una persona può pagare adesso: `daPagare - pagato - inCorso`. */
  residuoCents: number;
  /** Le mance già lasciate. Non riducono il residuo: vedi sotto. */
  manceCents: number;
  righe: RigaPagabile[];
  /** Quanti pagamenti sono già stati fatti da questo tavolo. */
  pagamenti: number;
};

export class ContoTavoloError extends Error {
  constructor(
    public code:
      | "token_sconosciuto"
      | "qr_disattivato"
      | "locale_non_attivo"
      | "nessun_conto"
      | "conto_chiuso",
  ) {
    super(code);
    this.name = "ContoTavoloError";
  }
}

/** Gli stati in cui un conto è ancora aperto. Stessa lista di `server/orders.ts`. */
const APERTI = ["RECEIVED", "PREPARING", "READY"] as const;

/**
 * Il tavolo dietro a un token, senza ancora il conto.
 *
 * Separato dalla lettura del conto perché serve anche quando un conto non c'è:
 * la pagina pubblica deve poter dire «tavolo 12, non c'è ancora niente da
 * pagare» con il nome del locale in testa, e non una pagina d'errore anonima.
 */
export async function tavoloDaToken(token: string) {
  if (!tokenPlausibile(token)) throw new ContoTavoloError("token_sconosciuto");

  const tavolo = await db.table.findUnique({
    where: { payQrToken: token },
    include: {
      venue: {
        select: {
          id: true,
          name: true,
          active: true,
          currency: true,
          brandLogoUrl: true,
          brandAccent: true,
          qrPaymentsEnabled: true,
          tipsEnabled: true,
          tipPresets: true,
          minPaymentCents: true,
          stripeAccountId: true,
          stripeChargesEnabled: true,
        },
      },
    },
  });

  if (!tavolo) throw new ContoTavoloError("token_sconosciuto");
  // Spento si dice, non si nasconde: l'adesivo resta sul tavolo anche quando
  // il locale sospende la funzione, e chi lo inquadra merita una frase invece
  // di una pagina d'errore che sembra un guasto.
  if (!tavolo.payQrEnabled || !tavolo.venue.qrPaymentsEnabled) throw new ContoTavoloError("qr_disattivato");
  if (!tavolo.venue.active) throw new ContoTavoloError("locale_non_attivo");

  return tavolo;
}

/**
 * Segna che qualcuno ha inquadrato questo QR.
 *
 * Fuori da ogni transazione e senza attenderne l'esito: è una statistica, e
 * non deve poter far fallire l'apertura di un conto. Si aggiorna al massimo
 * una volta al minuto per non scrivere una riga a ogni battito della sonda
 * che tiene viva la pagina.
 */
export async function segnaScansione(tableId: string, ultima: Date | null): Promise<void> {
  const adesso = Date.now();
  if (ultima && adesso - ultima.getTime() < 60_000) return;
  await db.table
    .update({ where: { id: tableId }, data: { payQrLastSeenAt: new Date() } })
    .catch(() => undefined);
}

/**
 * Il conto aperto di un tavolo.
 *
 * Passa dalla prenotazione seduta, che è il legame vero fra un tavolo e una
 * serata. Se ce ne fosse più d'una — un tavolo liberato e riassegnato senza
 * chiudere la prima — si prende **la più recente per orario di seduta**: è
 * quella delle persone che sono lì adesso, e sono loro che hanno in mano il
 * telefono.
 */
export async function trovaOrderIdDelTavolo(
  tx: Prisma.TransactionClient | typeof db,
  venueId: string,
  tableId: string,
): Promise<string | null> {
  const conto = await tx.order.findFirst({
    where: {
      venueId,
      status: { in: [...APERTI] },
      booking: {
        tableId,
        deletedAt: null,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    },
    orderBy: [{ booking: { seatedAt: "desc" } }, { createdAt: "desc" }],
    select: { id: true },
  });
  return conto?.id ?? null;
}

/**
 * Quanto è già stato pagato, quanto è impegnato, quante mance.
 *
 * Una sola interrogazione raggruppata invece di tre somme: è la lettura più
 * frequente dell'intera funzione — ogni apertura di pagina, ogni battito della
 * sonda, ogni tentativo di pagamento — e sta sull'indice `[orderId, status]`.
 *
 * I pagamenti in corso contano **solo finché non sono scaduti**: uno abbandonato
 * bloccherebbe per sempre la sua parte di conto, e gli altri commensali
 * resterebbero davanti a un residuo che non possono pagare.
 */
export async function sommeDelConto(
  tx: Prisma.TransactionClient | typeof db,
  orderId: string,
  adesso = new Date(),
): Promise<{ pagatoCents: number; inCorsoCents: number; manceCents: number; pagamenti: number }> {
  const righe = await tx.payment.findMany({
    where: {
      orderId,
      deletedAt: null,
      status: { in: [...STATI_INCASSATI, ...STATI_IMPEGNATIVI] },
    },
    select: { status: true, amountCents: true, tipCents: true, refundedCents: true, expiresAt: true },
  });

  let pagatoCents = 0;
  let inCorsoCents = 0;
  let manceCents = 0;
  let pagamenti = 0;

  for (const p of righe) {
    const conto = p.amountCents - p.tipCents;
    if ((STATI_INCASSATI as string[]).includes(p.status)) {
      // Un rimborso parziale toglie dall'incasso solo quello che è tornato
      // indietro: il resto è denaro che il locale ha davvero.
      pagatoCents += Math.max(0, conto - p.refundedCents);
      manceCents += p.tipCents;
      pagamenti += 1;
    } else if (!p.expiresAt || p.expiresAt > adesso) {
      inCorsoCents += conto;
    }
  }

  return { pagatoCents, inCorsoCents, manceCents, pagamenti };
}

/**
 * Quante unità di ogni riga sono già prese, per riga d'ordine.
 *
 * Come sopra: le prenotazioni scadute non contano, altrimenti un carrello
 * abbandonato renderebbe una bottiglia impagabile per sempre.
 */
export async function unitaOccupate(
  tx: Prisma.TransactionClient | typeof db,
  orderId: string,
  adesso = new Date(),
): Promise<Map<string, { pagate: number; impegnate: number }>> {
  const allocazioni = await tx.paymentAllocation.findMany({
    where: { orderId, status: { in: ["RESERVED", "PAID"] } },
    select: {
      orderItemId: true,
      quantity: true,
      status: true,
      payment: { select: { status: true, expiresAt: true } },
    },
  });

  const mappa = new Map<string, { pagate: number; impegnate: number }>();
  for (const a of allocazioni) {
    const voce = mappa.get(a.orderItemId) ?? { pagate: 0, impegnate: 0 };
    if (a.status === "PAID") {
      voce.pagate += a.quantity;
    } else if (!a.payment.expiresAt || a.payment.expiresAt > adesso) {
      voce.impegnate += a.quantity;
    }
    mappa.set(a.orderItemId, voce);
  }
  return mappa;
}

/**
 * Tutto quello che serve a mostrare — e a far pagare — il conto di un tavolo.
 *
 * Si chiama sia dalla pagina pubblica sia da dentro le transazioni che
 * incassano: è **la** fonte del residuo, e averne una sola è ciò che impedisce
 * che la cifra sullo schermo del cliente e quella controllata dal server
 * possano divergere.
 */
export async function leggiContoTavolo(
  token: string,
  opts: { tx?: Prisma.TransactionClient; adesso?: Date } = {},
): Promise<ContoTavolo> {
  const tx = opts.tx ?? db;
  const adesso = opts.adesso ?? new Date();
  const tavolo = await tavoloDaToken(token);

  const orderId = await trovaOrderIdDelTavolo(tx, tavolo.venueId, tavolo.id);
  if (!orderId) throw new ContoTavoloError("nessun_conto");

  return leggiContoPerOrder(tx, orderId, tavolo, adesso);
}

/** La parte che lavora su un conto già trovato. Riusata dalle transazioni. */
export async function leggiContoPerOrder(
  tx: Prisma.TransactionClient | typeof db,
  orderId: string,
  tavolo: Awaited<ReturnType<typeof tavoloDaToken>>,
  adesso = new Date(),
): Promise<ContoTavolo> {
  const conto = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { OrderItem: { orderBy: { id: "asc" } } },
  });

  if (!(APERTI as readonly string[]).includes(conto.status)) throw new ContoTavoloError("conto_chiuso");

  // Gli sconti già applicati in sala: gift card (denaro entrato prima) e punti
  // fedeltà (incasso a cui il locale rinuncia). Vengono scalati **prima** del
  // residuo, esattamente come fa la cassa: vedi `server/orders.ts`.
  const [giftCard, punti, somme, occupate] = await Promise.all([
    tx.giftCardRedemption.aggregate({ where: { orderId }, _sum: { amountCents: true } }),
    tx.loyaltyTransaction.aggregate({ where: { orderId, kind: "REDEEMED" }, _sum: { amountCents: true } }),
    sommeDelConto(tx, orderId, adesso),
    unitaOccupate(tx, orderId, adesso),
  ]);

  const totaleCents = conto.OrderItem.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  const scontiCents = (giftCard._sum.amountCents ?? 0) + (punti._sum.amountCents ?? 0);
  const daPagareCents = Math.max(0, totaleCents - scontiCents);
  const residuoCents = Math.max(0, daPagareCents - somme.pagatoCents - somme.inCorsoCents);

  const righe: RigaPagabile[] = conto.OrderItem.map((r) => {
    const o = occupate.get(r.id) ?? { pagate: 0, impegnate: 0 };
    return {
      id: r.id,
      nome: r.name,
      prezzoUnitarioCents: r.priceCents,
      quantita: r.quantity,
      pagate: o.pagate,
      impegnate: o.impegnate,
      disponibili: Math.max(0, r.quantity - o.pagate - o.impegnate),
    };
  });

  return {
    orderId,
    venueId: tavolo.venueId,
    tableId: tavolo.id,
    tavolo: tavolo.label,
    locale: {
      id: tavolo.venue.id,
      nome: tavolo.venue.name,
      logoUrl: tavolo.venue.brandLogoUrl,
      accento: tavolo.venue.brandAccent,
      currency: tavolo.venue.currency,
      tipsEnabled: tavolo.venue.tipsEnabled,
      tipPresets: tavolo.venue.tipPresets,
      minPaymentCents: tavolo.venue.minPaymentCents,
    },
    stato: statoDi({ daPagareCents, residuoCents, inCorso: somme.inCorsoCents, pagato: somme.pagatoCents }),
    totaleCents,
    scontiCents,
    daPagareCents,
    pagatoCents: somme.pagatoCents,
    inCorsoCents: somme.inCorsoCents,
    residuoCents,
    manceCents: somme.manceCents,
    righe,
    pagamenti: somme.pagamenti,
  };
}

function statoDi(v: {
  daPagareCents: number;
  residuoCents: number;
  inCorso: number;
  pagato: number;
}): StatoConto {
  if (v.daPagareCents > 0 && v.pagato >= v.daPagareCents) return "PAID";
  if (v.inCorso > 0) return "PAYMENT_IN_PROGRESS";
  if (v.pagato > 0) return "PARTIALLY_PAID";
  return "OPEN";
}
