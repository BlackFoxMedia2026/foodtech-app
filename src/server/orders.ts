import { Prisma, type Order, type OrderItem } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";
import { dateKeyInVenue } from "@/lib/venue-time";
import { finestraGiorno } from "./forecast";
import { accreditaPuntiConto, regoleFedelta } from "./loyalty";

/**
 * Il conto del tavolo.
 *
 * `Order` e `OrderItem` esistevano, pensati per l'asporto: nome e telefono
 * obbligatori, un orario di consegna, nessun legame con la prenotazione. Per
 * un conto al tavolo il cliente **è** la prenotazione, e l'unico modo di
 * aprirne uno sarebbe stato inventare un nome e un telefono.
 *
 * È il secondo anello di **menu → ordini → costo del cibo**, e il primo punto
 * in cui questa applicazione smette di stimare: finora ogni cifra in euro era
 * coperti per scontrino medio dichiarato. Un conto chiuso è un **incasso**.
 *
 * Due regole tengono in piedi il resto:
 *
 * - **il prezzo si fotografa quando si ordina.** La riga porta nome e prezzo
 *   copiati dal menu in quel momento: alzare il prezzo di un piatto domani non
 *   deve riscrivere il conto di ieri;
 * - **il totale si ricalcola dalle righe**, sempre, dentro la stessa
 *   transazione che le cambia. `Order.totalCents` resta aggiornato perché chi
 *   legge il database non trovi un numero falso, ma la verità sono le righe.
 */

/** Gli stati in cui un conto è ancora aperto e si può toccare. */
const APERTI = ["RECEIVED", "PREPARING", "READY"] as const;

export class OrderError extends Error {
  constructor(public code: "not_found" | "already_closed" | "not_available" | "empty_order") {
    super(code);
  }
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export type OrderLineView = {
  id: string;
  menuItemId: string | null;
  name: string;
  priceCents: number;
  quantity: number;
  notes: string | null;
  totalCents: number;
};

/**
 * Quello che è già arrivato su questo conto senza passare dalla cassa.
 *
 * Una gift card è denaro **già incassato** il giorno in cui è stata venduta:
 * scalarla dal conto non toglie incasso al locale, sposta soltanto il momento
 * in cui quel denaro è entrato. Uno sconto in punti invece è incasso che non
 * arriverà: sono euro regalati per fedeltà.
 *
 * Sono due cose diverse e restano due voci diverse, perché rispondono a due
 * domande diverse: «quanto ho consumato» (il totale) e «quanto devo pagare
 * adesso» (`daIncassareCents`). Sommarle in un unico «sconto» renderebbe
 * impossibile capire, a fine mese, quanto è costata la raccolta punti.
 */
export type OrderPagamenti = {
  /** Scalato da gift card: denaro entrato prima. */
  giftCardCents: number;
  /** Scontato coi punti: incasso che il locale rinuncia a fare. */
  puntiCents: number;
  /** Quanti punti sono stati usati. */
  punti: number;
  /** Quello che resta da pagare al tavolo. */
  daIncassareCents: number;
};

export type OrderView = {
  id: string;
  reference: string;
  status: string;
  bookingId: string | null;
  guestId: string | null;
  tableLabel: string | null;
  openedAt: Date;
  closedAt: Date | null;
  righe: OrderLineView[];
  totalCents: number;
  pagamenti: OrderPagamenti;
  /** Vero finché si può aggiungere o togliere qualcosa. */
  aperto: boolean;
};

const NESSUN_PAGAMENTO: OrderPagamenti = {
  giftCardCents: 0,
  puntiCents: 0,
  punti: 0,
  daIncassareCents: 0,
};

/**
 * Gift card e punti già usati su questi conti.
 *
 * Non stanno fra le righe del conto di proposito: le righe sono quello che è
 * stato **consumato**, ed è la base su cui si calcola il costo del cibo. Una
 * riga negativa da «sconto» falserebbe sia l'incasso per piatto sia il fuori
 * carta. Come si paga è un'altra domanda, e sta in un'altra tabella.
 */
async function pagamentiDi(orderIds: string[]): Promise<Map<string, OrderPagamenti>> {
  const mappa = new Map<string, OrderPagamenti>();
  if (orderIds.length === 0) return mappa;

  const [giftCard, punti] = await Promise.all([
    db.giftCardRedemption.findMany({
      where: { orderId: { in: orderIds } },
      select: { orderId: true, amountCents: true },
    }),
    db.loyaltyTransaction.findMany({
      where: { orderId: { in: orderIds }, kind: "REDEEMED" },
      select: { orderId: true, points: true, amountCents: true },
    }),
  ]);

  const vuoto = () => ({ giftCardCents: 0, puntiCents: 0, punti: 0, daIncassareCents: 0 });
  for (const r of giftCard) {
    if (!r.orderId) continue;
    const p = mappa.get(r.orderId) ?? vuoto();
    // Gli annullamenti sono righe negative: la somma con il segno è il vero
    // importo scalato.
    p.giftCardCents += r.amountCents;
    mappa.set(r.orderId, p);
  }
  for (const r of punti) {
    if (!r.orderId) continue;
    const p = mappa.get(r.orderId) ?? vuoto();
    p.puntiCents += r.amountCents ?? 0;
    // I riscatti sono negativi nel saldo: qui si racconta quanti punti sono
    // stati usati, quindi in positivo.
    p.punti += Math.abs(r.points);
    mappa.set(r.orderId, p);
  }
  return mappa;
}

function toView(order: Order & { OrderItem: OrderItem[] }, pagamenti?: OrderPagamenti): OrderView {
  const righe = order.OrderItem.map((i) => ({
    id: i.id,
    menuItemId: i.menuItemId,
    name: i.name,
    priceCents: i.priceCents,
    quantity: i.quantity,
    notes: i.notes,
    totalCents: i.priceCents * i.quantity,
  }));

  const totalCents = righe.reduce((s, r) => s + r.totalCents, 0);
  const pag = pagamenti ?? NESSUN_PAGAMENTO;

  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    bookingId: order.bookingId,
    guestId: order.guestId,
    tableLabel: order.tableLabel,
    openedAt: order.createdAt,
    closedAt: order.completedAt,
    righe,
    // Il totale mostrato è quello calcolato dalle righe, non quello in colonna.
    totalCents,
    pagamenti: {
      ...pag,
      // Mai sotto zero: una gift card più grande del conto lascia il resto
      // sulla carta, non crea un credito al tavolo.
      daIncassareCents: Math.max(0, totalCents - pag.giftCardCents - pag.puntiCents),
    },
    aperto: (APERTI as readonly string[]).includes(order.status),
  };
}

/** Un conto con i suoi pagamenti già caricati. */
async function vistaCompleta(order: Order & { OrderItem: OrderItem[] }): Promise<OrderView> {
  const pagamenti = await pagamentiDi([order.id]);
  return toView(order, pagamenti.get(order.id));
}

/** Un conto, con i suoi pagamenti già arrivati. */
export async function getOrder(venueId: string, orderId: string): Promise<OrderView | null> {
  const order = await db.order.findFirst({
    where: { id: orderId, venueId },
    include: { OrderItem: { orderBy: { id: "asc" } } },
  });
  return order ? vistaCompleta(order) : null;
}

/** Il conto aperto di una prenotazione, se c'è. */
export async function getOrderForBooking(venueId: string, bookingId: string): Promise<OrderView | null> {
  const order = await db.order.findFirst({
    where: { venueId, bookingId, status: { in: [...APERTI] } },
    orderBy: { createdAt: "desc" },
    include: { OrderItem: { orderBy: { id: "asc" } } },
  });
  return order ? vistaCompleta(order) : null;
}

/** Tutti i conti di una prenotazione, aperti e chiusi. */
export async function listOrdersForBooking(venueId: string, bookingId: string): Promise<OrderView[]> {
  const orders = await db.order.findMany({
    where: { venueId, bookingId },
    orderBy: { createdAt: "desc" },
    include: { OrderItem: { orderBy: { id: "asc" } } },
  });
  const pagamenti = await pagamentiDi(orders.map((o) => o.id));
  return orders.map((o) => toView(o, pagamenti.get(o.id)));
}

/* -------------------------------------------------------------------------- */
/*  Apertura                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Un riferimento leggibile: la data e un numero progressivo del giorno.
 *
 * Il numero **non** è «quanti conti ci sono oggi»: è «il più alto già usato,
 * più uno». Contare sembrava equivalente e non lo è — basta annullare e
 * cancellare un conto perché il conteggio scenda e il numero successivo
 * ricada su uno già assegnato. `Order.reference` è unico, quindi quella
 * collisione non era un numero doppio: era un errore in faccia al cameriere
 * che apre il conto, con il tavolo che aspetta.
 *
 * Restituisce il pezzo fisso e il primo numero libero separati, perché chi
 * crea l'ordine deve poter riprovare col numero dopo: il vincolo è unico su
 * tutta l'installazione, e due locali che aprono il loro primo conto nello
 * stesso momento arrivano allo stesso candidato.
 */
async function riferimentoDelGiorno(
  venueId: string,
  timeZone: string,
): Promise<{ prefisso: string; prossimo: number }> {
  const giorno = dateKeyInVenue(new Date(), timeZone);
  const prefisso = giorno.replace(/-/g, "");
  const delGiorno = await db.order.findMany({
    where: { venueId, reference: { startsWith: `${prefisso}-` } },
    select: { reference: true },
  });
  const massimo = delGiorno.reduce((m, o) => {
    const n = Number.parseInt(o.reference.slice(prefisso.length + 1), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return { prefisso, prossimo: massimo + 1 };
}

/** Vero se l'errore è «questo riferimento esiste già». */
function riferimentoOccupato(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    JSON.stringify(err.meta?.target ?? "").includes("reference")
  );
}

/**
 * Apre il conto di una prenotazione, o restituisce quello già aperto.
 *
 * Non ne apre due: due camerieri che premono «conto» sullo stesso tavolo
 * devono ritrovarsi nello stesso conto, altrimenti a fine serata ci sono due
 * totali e nessuno sa quale sia quello giusto.
 */
export async function openOrderForBooking(
  venueId: string,
  bookingId: string,
  opts: { actor?: AuditActor } = {},
): Promise<OrderView> {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, venueId, deletedAt: null },
    include: { table: { select: { label: true } }, venue: { select: { timezone: true, currency: true } } },
  });
  if (!booking) throw new OrderError("not_found");

  const esistente = await getOrderForBooking(venueId, bookingId);
  if (esistente) return esistente;

  const { prefisso, prossimo } = await riferimentoDelGiorno(venueId, booking.venue.timezone);

  // Si riprova col numero dopo, non si alza le mani: il riferimento è unico su
  // tutta l'installazione, e chi ha il tavolo che aspetta non deve vedere un
  // errore per un numero già preso.
  let creato: Awaited<ReturnType<typeof db.order.create>> & { OrderItem: OrderItem[] };
  let numero = prossimo;
  for (;;) {
    try {
      creato = await db.order.create({
        data: {
          venueId,
          bookingId,
          guestId: booking.guestId,
          kind: "TABLE",
          status: "RECEIVED",
          reference: `${prefisso}-${String(numero).padStart(3, "0")}`,
          // Per un conto al tavolo «programmato per» è adesso: si apre quando le
          // persone si siedono.
          scheduledAt: new Date(),
          tableLabel: booking.table?.label ?? null,
          currency: booking.venue.currency,
          totalCents: 0,
        },
        include: { OrderItem: true },
      });
      break;
    } catch (err) {
      if (!riferimentoOccupato(err) || numero > prossimo + 200) throw err;
      numero += 1;
    }
  }

  await recordAudit(opts.actor, "order.open", "order", creato.id, {
    riferimento: creato.reference,
    prenotazione: bookingId,
    tavolo: creato.tableLabel,
  });

  return vistaCompleta(creato);
}

/* -------------------------------------------------------------------------- */
/*  Righe                                                                     */
/* -------------------------------------------------------------------------- */

export const AddLineInput = z.object({
  /** Un piatto del menu, oppure un nome libero per il fuori carta. */
  menuItemId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  priceCents: z.coerce.number().int().min(0).max(1_000_00).optional(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  notes: z.string().trim().max(200).optional().nullable(),
});

/**
 * Ricalcola il totale dalle righe e lo scrive in colonna.
 *
 * Da chiamare dentro la transazione che ha cambiato le righe: il totale è una
 * copia, e una copia che si aggiorna dopo è una copia che prima o poi resta
 * indietro.
 */
async function ricalcola(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
  const righe = await tx.orderItem.findMany({ where: { orderId }, select: { priceCents: true, quantity: true } });
  const totale = righe.reduce((s, r) => s + r.priceCents * r.quantity, 0);
  await tx.order.update({ where: { id: orderId }, data: { totalCents: totale } });
  return totale;
}

async function contoApertoOEccezione(tx: Prisma.TransactionClient, venueId: string, orderId: string) {
  const order = await tx.order.findFirst({ where: { id: orderId, venueId } });
  if (!order) throw new OrderError("not_found");
  if (!(APERTI as readonly string[]).includes(order.status)) throw new OrderError("already_closed");
  return order;
}

/**
 * Aggiunge una riga al conto.
 *
 * Con `menuItemId` il nome e il prezzo si **copiano dal menu adesso**: se
 * domani quel piatto costa due euro in più, il conto di stasera non cambia.
 * Un piatto non disponibile non si ordina — segnarlo finito serve a questo.
 *
 * Senza `menuItemId` si può scrivere una riga a mano: il fuori carta esiste, e
 * costringere a inventare un piatto nel menu per batterlo sul conto
 * significherebbe sporcare la carta del cliente.
 */
export async function addLine(
  venueId: string,
  orderId: string,
  raw: unknown,
  opts: { actor?: AuditActor } = {},
): Promise<OrderView> {
  const data = AddLineInput.parse(raw);

  const esito = await db.$transaction(async (tx) => {
    await contoApertoOEccezione(tx, venueId, orderId);

    let name = data.name?.trim() ?? "";
    let priceCents = data.priceCents ?? 0;
    let menuItemId: string | null = null;

    if (data.menuItemId) {
      const piatto = await tx.menuItem.findFirst({ where: { id: data.menuItemId, venueId } });
      if (!piatto) throw new OrderError("not_found");
      if (!piatto.available) throw new OrderError("not_available");
      menuItemId = piatto.id;
      name = piatto.name;
      priceCents = piatto.priceCents;
    } else if (!name) {
      throw new OrderError("not_found");
    }

    await tx.orderItem.create({
      data: { orderId, menuItemId, name, priceCents, quantity: data.quantity, notes: data.notes ?? null },
    });
    await ricalcola(tx, orderId);

    return tx.order.findFirstOrThrow({ where: { id: orderId }, include: { OrderItem: { orderBy: { id: "asc" } } } });
  });

  await recordAudit(opts.actor, "order.line_add", "order", orderId, {
    piatto: data.menuItemId ?? data.name,
    quantita: data.quantity,
  });
  return vistaCompleta(esito);
}

/** Cambia la quantità di una riga. A zero la riga si toglie. */
export async function setLineQuantity(
  venueId: string,
  orderId: string,
  lineId: string,
  quantity: number,
  opts: { actor?: AuditActor } = {},
): Promise<OrderView> {
  const q = Math.max(0, Math.min(99, Math.floor(quantity)));

  const esito = await db.$transaction(async (tx) => {
    await contoApertoOEccezione(tx, venueId, orderId);
    const riga = await tx.orderItem.findFirst({ where: { id: lineId, orderId } });
    if (!riga) throw new OrderError("not_found");

    if (q === 0) await tx.orderItem.delete({ where: { id: lineId } });
    else await tx.orderItem.update({ where: { id: lineId }, data: { quantity: q } });

    await ricalcola(tx, orderId);
    return tx.order.findFirstOrThrow({ where: { id: orderId }, include: { OrderItem: { orderBy: { id: "asc" } } } });
  });

  await recordAudit(opts.actor, "order.line_update", "order", orderId, { riga: lineId, quantita: q });
  return vistaCompleta(esito);
}

/* -------------------------------------------------------------------------- */
/*  Chiusura                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Chiude il conto: da qui in poi quel totale è un **incasso**.
 *
 * Un conto vuoto non si chiude: sarebbe un incasso da zero euro in mezzo ai
 * dati veri, e chi guarda i numeri del mese non ha modo di distinguerlo da un
 * tavolo che ha consumato nulla. Se il conto è vuoto perché era un errore, si
 * annulla.
 */
export type ContoChiuso = OrderView & {
  /**
   * I punti accreditati al cliente chiudendo questo conto, se la raccolta è
   * attiva e il tavolo ha un cliente collegato. Va detto subito: un punto che
   * il cameriere non annuncia è un punto che il cliente non sa di avere.
   */
  puntiAccreditati: { punti: number; saldo: number } | null;
};

export async function closeOrder(
  venueId: string,
  orderId: string,
  opts: { actor?: AuditActor } = {},
): Promise<ContoChiuso> {
  const esito = await db.$transaction(async (tx) => {
    const conto = await contoApertoOEccezione(tx, venueId, orderId);
    const righe = await tx.orderItem.count({ where: { orderId } });
    if (righe === 0) throw new OrderError("empty_order");

    const totale = await ricalcola(tx, orderId);
    await tx.order.update({
      where: { id: orderId },
      data: { status: "COMPLETED", completedAt: new Date(), totalCents: totale },
    });

    // I punti nascono qui, nella stessa transazione che trasforma un totale in
    // un incasso: accreditarli dopo vorrebbe dire che un errore fra le due
    // scritture lascia un incasso senza i suoi punti, e nessuno se ne
    // accorgerebbe fino al reclamo del cliente.
    const venue = await tx.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { loyaltyPointsPerEuro: true, loyaltyPointValueCents: true },
    });
    const punti = await accreditaPuntiConto(tx, {
      venueId,
      orderId,
      guestId: conto.guestId,
      totalCents: totale,
      regole: regoleFedelta(venue),
    });

    const finale = await tx.order.findFirstOrThrow({
      where: { id: orderId },
      include: { OrderItem: { orderBy: { id: "asc" } } },
    });
    return { finale, punti };
  });

  await recordAudit(opts.actor, "order.close", "order", orderId, {
    riferimento: esito.finale.reference,
    totale: esito.finale.totalCents,
    puntiAccreditati: esito.punti?.punti ?? 0,
  });

  const vista = await vistaCompleta(esito.finale);
  return { ...vista, puntiAccreditati: esito.punti };
}

/** Annulla un conto: resta in tabella, segnato annullato, e non fa incasso. */
export async function cancelOrder(
  venueId: string,
  orderId: string,
  opts: { actor?: AuditActor } = {},
): Promise<OrderView> {
  const esito = await db.$transaction(async (tx) => {
    await contoApertoOEccezione(tx, venueId, orderId);
    await tx.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return tx.order.findFirstOrThrow({ where: { id: orderId }, include: { OrderItem: { orderBy: { id: "asc" } } } });
  });

  await recordAudit(opts.actor, "order.cancel", "order", orderId, { riferimento: esito.reference });
  return vistaCompleta(esito);
}

/* -------------------------------------------------------------------------- */
/*  Incasso                                                                   */
/* -------------------------------------------------------------------------- */

export type IncassoDelGiorno = {
  /** Somma dei conti chiusi, in centesimi. Zero se non ce ne sono. */
  totalCents: number;
  /**
   * Quanto di quel totale era già stato pagato con una gift card: denaro
   * entrato in cassa il giorno in cui la carta è stata venduta, non oggi.
   */
  giftCardCents: number;
  /** Quanto è stato scontato coi punti fedeltà: incasso a cui si è rinunciato. */
  scontiPuntiCents: number;
  /**
   * Quello che è entrato **oggi**: il consumato meno le gift card e gli sconti
   * in punti. Se un tavolo da 100 € paga con una gift card, il locale ha
   * servito 100 € di cena e ha visto zero euro: sono due numeri veri e
   * diversi, e confonderli è il modo più rapido di non tornare con la cassa.
   */
  incassatoCents: number;
  /** Quanti conti chiusi. Zero significa «nessun dato», non «zero euro». */
  conti: number;
  /** Il costo delle materie prime dei piatti venduti, dove è dichiarato. */
  costoCents: number | null;
  /** Su quanti dei piatti venduti conosciamo il costo. */
  righeConCosto: number;
  righeTotali: number;
};

/**
 * L'incasso vero di una giornata: la somma dei conti chiusi.
 *
 * `conti: 0` non vuol dire «zero euro»: vuol dire che nessuno ha chiuso un
 * conto, e chi mostra il numero deve saper distinguere le due cose — è la
 * stessa distinzione fra una stima e un dato che questo progetto ha passato
 * giorni a rimettere a posto.
 *
 * Insieme all'incasso torna il **costo** dei piatti venduti, dove è
 * dichiarato, con il conto di quante righe lo conoscono: un food cost
 * calcolato sulla metà dei piatti va detto, non arrotondato.
 */
export async function incassoDelGiorno(
  venueId: string,
  giorno: string,
  timeZone: string,
): Promise<IncassoDelGiorno> {
  const { start, end } = finestraGiorno(giorno, timeZone);

  const conti = await db.order.findMany({
    where: { venueId, status: "COMPLETED", completedAt: { gte: start, lt: end } },
    include: { OrderItem: { select: { menuItemId: true, priceCents: true, quantity: true } } },
  });

  const menuItemIds = [
    ...new Set(conti.flatMap((o) => o.OrderItem.map((i) => i.menuItemId).filter((x): x is string => !!x))),
  ];
  const costi = menuItemIds.length
    ? await db.menuItemCost.findMany({
        where: { venueId, menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, costCents: true },
      })
    : [];
  const costoDi = new Map(costi.map((c) => [c.menuItemId, c.costCents]));

  let totalCents = 0;
  let costoCents = 0;
  let righeConCosto = 0;
  let righeTotali = 0;

  for (const o of conti) {
    for (const riga of o.OrderItem) {
      totalCents += riga.priceCents * riga.quantity;
      righeTotali += riga.quantity;
      const costo = riga.menuItemId ? costoDi.get(riga.menuItemId) : undefined;
      if (costo != null) {
        costoCents += costo * riga.quantity;
        righeConCosto += riga.quantity;
      }
    }
  }

  const pagamenti = await pagamentiDi(conti.map((o) => o.id));
  let giftCardCents = 0;
  let scontiPuntiCents = 0;
  for (const p of pagamenti.values()) {
    giftCardCents += p.giftCardCents;
    scontiPuntiCents += p.puntiCents;
  }

  return {
    totalCents,
    giftCardCents,
    scontiPuntiCents,
    incassatoCents: Math.max(0, totalCents - giftCardCents - scontiPuntiCents),
    conti: conti.length,
    costoCents: righeConCosto > 0 ? costoCents : null,
    righeConCosto,
    righeTotali,
  };
}
