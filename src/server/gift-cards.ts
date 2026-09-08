import { Prisma, type GiftCard, type GiftCardStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";
import { createNotification } from "./notifications";
import { codiceCasuale } from "./coupons";

/**
 * Le gift card.
 *
 * `GiftCard` e `GiftCardRedemption` erano nello schema — codice, importo
 * iniziale, saldo, destinatario, dedica, scadenza, stato — e nessuna riga di
 * codice le creava o le usava. Il saldo, `balanceCents`, era il solito numero
 * in colonna che nessuno aggiornava.
 *
 * Una gift card non è un coupon: **è denaro già incassato**. Il locale ha preso
 * i soldi il giorno in cui l'ha venduta, e da quel momento ha un debito verso
 * chi la presenterà. Tutto il resto segue da qui:
 *
 * - **il saldo si calcola**: importo iniziale meno la somma degli utilizzi. La
 *   colonna `balanceCents` si aggiorna nella stessa transazione, così chi legge
 *   il database non trova un numero falso, ma i controlli sommano le righe;
 * - **si può usare in più volte.** Una gift card da 100 € su un conto da 38 €
 *   lascia 62 € da spendere un'altra sera: obbligare a bruciarla tutta sarebbe
 *   rubare il resto;
 * - **non si può usare per più del suo saldo**, e il controllo sta dentro una
 *   transazione serializzabile: due tablet che la passano nello stesso istante
 *   non devono poter scontare 200 € su una carta da 100;
 * - **annullare un utilizzo è una riga di segno opposto.** Qui non c'è un campo
 *   «annullato» come nei coupon, e inventarlo con una migrazione per una cosa
 *   che si può scrivere in contabilità sarebbe sprecare una colonna: una
 *   restituzione è un movimento negativo, e la storia resta leggibile per
 *   intero.
 *
 * Lo stato `PENDING_PAYMENT` esiste nello schema e qui non si usa: serve al
 * giorno in cui una gift card si comprerà dal sito pagando online. Una gift
 * card creata dal locale nasce **attiva**, perché i soldi li ha già presi alla
 * cassa.
 */

/* -------------------------------------------------------------------------- */
/*  Creazione                                                                 */
/* -------------------------------------------------------------------------- */

export const GiftCardInput = z.object({
  /** L'importo, in centesimi: è quello che il locale ha incassato. */
  initialCents: z.coerce.number().int().min(500, "Una gift card da meno di 5 € non ha molto senso").max(500_000),
  recipientName: z.string().trim().max(120).optional().nullable(),
  recipientEmail: z.string().trim().email("Questa email non sembra valida").max(200).optional().nullable(),
  senderName: z.string().trim().max(120).optional().nullable(),
  /** La dedica, che è il motivo per cui si regala una cena. */
  message: z.string().trim().max(500).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

/**
 * Un codice che si legge a voce e si scrive a mano.
 *
 * Stesso alfabeto dei coupon — niente O/0, I/1/L, S/5 — perché una gift card
 * si detta al telefono e si stampa su un cartoncino. Il prefisso «REGALO» dice
 * cos'è a chi la trova in un cassetto sei mesi dopo.
 */
async function codiceLibero(): Promise<string> {
  for (let tentativo = 0; tentativo < 20; tentativo++) {
    const candidato = `REGALO-${codiceCasuale(8)}`;
    const preso = await db.giftCard.findUnique({ where: { code: candidato }, select: { id: true } });
    if (!preso) return candidato;
  }
  return `REGALO-${Date.now().toString(36).toUpperCase()}`;
}

export async function createGiftCard(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = GiftCardInput.parse(raw);
  const venue = await db.venue.findUnique({ where: { id: venueId }, select: { currency: true } });
  if (!venue) throw new GiftCardError("not_found");

  const creata = await db.giftCard.create({
    data: {
      venueId,
      code: await codiceLibero(),
      initialCents: data.initialCents,
      // Nasce col saldo pieno: nessun utilizzo, quindi importo iniziale.
      balanceCents: data.initialCents,
      currency: venue.currency,
      recipientName: data.recipientName ?? null,
      recipientEmail: data.recipientEmail ?? null,
      senderName: data.senderName ?? null,
      message: data.message ?? null,
      expiresAt: data.expiresAt ?? null,
      status: "ACTIVE",
      createdBy: opts.actor?.userId ?? null,
    },
  });

  await recordAudit(opts.actor, "giftcard.create", "giftcard", creata.id, {
    codice: creata.code,
    importoCentesimi: creata.initialCents,
    destinatario: creata.recipientName,
  });
  return creata;
}

/** Annulla una gift card: da qui non si usa più. Il saldo resta visibile. */
export async function cancelGiftCard(venueId: string, id: string, opts: { actor?: AuditActor } = {}) {
  const esistente = await db.giftCard.findFirst({ where: { id, venueId }, select: { id: true, code: true } });
  if (!esistente) throw new GiftCardError("not_found");

  const aggiornata = await db.giftCard.update({ where: { id }, data: { status: "CANCELLED" } });
  await recordAudit(opts.actor, "giftcard.cancel", "giftcard", id, { codice: esistente.code });
  return aggiornata;
}

/* -------------------------------------------------------------------------- */
/*  Vale o non vale                                                           */
/* -------------------------------------------------------------------------- */

export type GiftCardNonValida = "cancelled" | "not_paid" | "expired" | "exhausted";

export const MOTIVO_GIFT_CARD: Record<GiftCardNonValida, string> = {
  cancelled: "Questa gift card è stata annullata.",
  not_paid: "Questa gift card non è ancora stata pagata.",
  expired: "Questa gift card è scaduta.",
  exhausted: "Questa gift card è già stata usata per intero.",
};

export type UsabilitaGiftCard = { usable: true; residuoCents: number } | { usable: false; reason: GiftCardNonValida };

/**
 * Se questa gift card si può usare adesso, e per quanto.
 *
 * Una funzione sola per l'elenco e per la cassa: se fossero due strade
 * diverse, prima o poi la pagina direbbe «valida» e il tavolo si sentirebbe
 * dire di no. La scadenza si calcola dalla data, non si legge dallo stato —
 * `status` è quello che ha deciso il locale, «scaduta» dipende dall'orologio.
 */
export function giftCardUsability(
  card: Pick<GiftCard, "status" | "expiresAt" | "initialCents">,
  contesto: { now: Date; spesoCents: number },
): UsabilitaGiftCard {
  if (card.status === "CANCELLED") return { usable: false, reason: "cancelled" };
  if (card.status === "PENDING_PAYMENT") return { usable: false, reason: "not_paid" };
  if (card.expiresAt && contesto.now > card.expiresAt) return { usable: false, reason: "expired" };

  const residuoCents = card.initialCents - contesto.spesoCents;
  if (residuoCents <= 0) return { usable: false, reason: "exhausted" };
  return { usable: true, residuoCents };
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export type GiftCardView = {
  id: string;
  code: string;
  initialCents: number;
  /** Calcolato dalle righe, non letto dalla colonna. */
  residuoCents: number;
  spesoCents: number;
  currency: string;
  recipientName: string | null;
  recipientEmail: string | null;
  senderName: string | null;
  message: string | null;
  status: GiftCardStatus;
  expiresAt: Date | null;
  createdAt: Date;
  utilizzi: number;
  stato: "usabile" | GiftCardNonValida;
};

function toView(
  card: GiftCard & { GiftCardRedemption: { amountCents: number }[] },
  now: Date,
): GiftCardView {
  const spesoCents = card.GiftCardRedemption.reduce((s, r) => s + r.amountCents, 0);
  const esito = giftCardUsability(card, { now, spesoCents });
  return {
    id: card.id,
    code: card.code,
    initialCents: card.initialCents,
    residuoCents: Math.max(0, card.initialCents - spesoCents),
    spesoCents,
    currency: card.currency,
    recipientName: card.recipientName,
    recipientEmail: card.recipientEmail,
    senderName: card.senderName,
    message: card.message,
    status: card.status,
    expiresAt: card.expiresAt,
    createdAt: card.createdAt,
    utilizzi: card.GiftCardRedemption.length,
    stato: esito.usable ? "usabile" : esito.reason,
  };
}

export async function listGiftCards(
  venueId: string,
  opts: { now?: Date } = {},
): Promise<GiftCardView[]> {
  const now = opts.now ?? new Date();
  const cards = await db.giftCard.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    include: { GiftCardRedemption: { select: { amountCents: true } } },
  });
  return cards.map((c) => toView(c, now));
}

/** Cerca una gift card per codice, dentro il locale. */
export async function findGiftCardByCode(
  venueId: string,
  code: string,
  opts: { now?: Date } = {},
): Promise<GiftCardView | null> {
  const card = await db.giftCard.findFirst({
    where: { venueId, code: code.trim().toUpperCase() },
    include: { GiftCardRedemption: { select: { amountCents: true } } },
  });
  return card ? toView(card, opts.now ?? new Date()) : null;
}

/** La storia di una gift card: quando, quanto, su quale conto. */
export function listGiftCardRedemptions(giftCardId: string) {
  return db.giftCardRedemption.findMany({
    where: { giftCardId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, amountCents: true, orderId: true, bookingId: true, reason: true, createdAt: true },
  });
}

/**
 * Quanto resta da spendere su una gift card, in una lettura sola.
 *
 * Il totale in denaro delle gift card in circolazione è un **debito** del
 * locale, non un incasso: i soldi sono già entrati, la cena no. Chi lo mostra
 * deve dirlo con queste parole.
 */
export async function debitoGiftCards(venueId: string, now = new Date()) {
  const cards = await listGiftCards(venueId, { now });
  const vive = cards.filter((c) => c.stato === "usabile");
  return {
    carte: vive.length,
    residuoCents: vive.reduce((s, c) => s + c.residuoCents, 0),
    venduteCents: cards.reduce((s, c) => s + c.initialCents, 0),
    usateCents: cards.reduce((s, c) => s + c.spesoCents, 0),
  };
}

/* -------------------------------------------------------------------------- */
/*  L'uso                                                                     */
/* -------------------------------------------------------------------------- */

export class GiftCardError extends Error {
  constructor(
    public code: "not_found" | "invalid_amount" | "insufficient_balance" | GiftCardNonValida,
    public detail?: unknown,
  ) {
    super(code);
  }
}

/**
 * Scala un importo da una gift card.
 *
 * Serializzabile, con il controllo del residuo **dentro** la transazione: è la
 * stessa difesa dei coupon e dei tavoli, e qui protegge del denaro vero.
 *
 * Chiedere più del residuo è un errore e non uno scalare silenzioso a quanto
 * c'è: chi sta alla cassa deve sapere che restano 12 € e che i 26 mancanti
 * vanno pagati, non scoprire dopo che il conto è chiuso a metà.
 */
export async function redeemGiftCard(
  venueId: string,
  input: { code: string; amountCents: number; orderId?: string | null; bookingId?: string | null; reason?: string | null },
  opts: { actor?: AuditActor } = {},
) {
  const importo = Math.floor(input.amountCents);
  if (!Number.isFinite(importo) || importo <= 0) throw new GiftCardError("invalid_amount");
  const code = input.code.trim().toUpperCase();

  const esito = await db.$transaction(
    async (tx) => {
      // Il codice si cerca dentro il locale: quello di un altro ristorante non
      // deve nemmeno risultare esistente.
      const card = await tx.giftCard.findFirst({ where: { venueId, code } });
      if (!card) throw new GiftCardError("not_found");

      const somma = await tx.giftCardRedemption.aggregate({
        where: { giftCardId: card.id },
        _sum: { amountCents: true },
      });
      const spesoCents = somma._sum.amountCents ?? 0;

      const valida = giftCardUsability(card, { now: new Date(), spesoCents });
      if (!valida.usable) throw new GiftCardError(valida.reason);
      if (importo > valida.residuoCents) {
        throw new GiftCardError("insufficient_balance", { residuoCents: valida.residuoCents });
      }

      const utilizzo = await tx.giftCardRedemption.create({
        data: {
          giftCardId: card.id,
          amountCents: importo,
          orderId: input.orderId ?? null,
          bookingId: input.bookingId ?? null,
          reason: input.reason?.slice(0, 200) ?? null,
          createdBy: opts.actor?.userId ?? null,
        },
      });

      const residuo = valida.residuoCents - importo;
      const aggiornata = await tx.giftCard.update({
        where: { id: card.id },
        data: {
          // La colonna è una copia, tenuta al passo nella stessa transazione.
          balanceCents: residuo,
          // Esaurita è un fatto compiuto, non una scadenza: si può scrivere
          // adesso senza che nessuno debba ricordarsene dopo.
          ...(residuo === 0 ? { status: "EXHAUSTED" as const } : {}),
        },
      });

      return { card: aggiornata, utilizzoId: utilizzo.id, importo, residuo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(opts.actor, "giftcard.redeem", "giftcard", esito.card.id, {
    codice: esito.card.code,
    importoCentesimi: esito.importo,
    residuoCentesimi: esito.residuo,
    conto: input.orderId ?? null,
  });

  // Denaro che si muove: è la categoria di notizia che un titolare vuole
  // vedere anche quando non era lui a battere il conto. Fuori dalla
  // transazione di proposito — un avviso non riuscito non deve annullare un
  // utilizzo già valido.
  const euro = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;
  await createNotification(venueId, {
    kind: "GIFT_CARD_REDEEMED",
    title: `Gift card usata: ${euro(esito.importo)}`,
    body:
      esito.residuo > 0
        ? `Codice ${esito.card.code}. Restano ${euro(esito.residuo)} sulla carta.`
        : `Codice ${esito.card.code}. La carta è esaurita.`,
    link: "/marketing/gift-cards",
    meta: { giftCardId: esito.card.id, importoCentesimi: esito.importo },
  });

  return {
    giftCardId: esito.card.id,
    code: esito.card.code,
    utilizzoId: esito.utilizzoId,
    importoCents: esito.importo,
    residuoCents: esito.residuo,
    currency: esito.card.currency,
  };
}

/**
 * Annulla un utilizzo restituendo l'importo sulla carta.
 *
 * Non si cancella la riga: si scrive un movimento **negativo**, come in
 * contabilità. Così il saldo torna giusto sommando le righe, e la storia
 * conserva sia lo sbaglio sia la correzione — che è quello che serve quando fra
 * un mese un cliente chiede perché la sua carta da 100 € ne ha 62.
 */
export async function undoGiftCardRedemption(
  venueId: string,
  utilizzoId: string,
  opts: { actor?: AuditActor } = {},
) {
  const esito = await db.$transaction(
    async (tx) => {
      const utilizzo = await tx.giftCardRedemption.findFirst({
        where: { id: utilizzoId, GiftCard: { venueId } },
        include: { GiftCard: true },
      });
      if (!utilizzo) throw new GiftCardError("not_found");
      if (utilizzo.amountCents <= 0) throw new GiftCardError("invalid_amount");

      await tx.giftCardRedemption.create({
        data: {
          giftCardId: utilizzo.giftCardId,
          amountCents: -utilizzo.amountCents,
          orderId: utilizzo.orderId,
          bookingId: utilizzo.bookingId,
          reason: "Utilizzo annullato",
          createdBy: opts.actor?.userId ?? null,
        },
      });

      const somma = await tx.giftCardRedemption.aggregate({
        where: { giftCardId: utilizzo.giftCardId },
        _sum: { amountCents: true },
      });
      const spesoCents = somma._sum.amountCents ?? 0;
      const residuo = utilizzo.GiftCard.initialCents - spesoCents;

      const aggiornata = await tx.giftCard.update({
        where: { id: utilizzo.giftCardId },
        data: {
          balanceCents: residuo,
          // Se era finita solo perché esaurita, torna spendibile: annullare un
          // utilizzo che non doveva esserci rimette le cose come stavano.
          ...(utilizzo.GiftCard.status === "EXHAUSTED" && residuo > 0 ? { status: "ACTIVE" as const } : {}),
        },
      });

      return { card: aggiornata, importo: utilizzo.amountCents, residuo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(opts.actor, "giftcard.redeem_undo", "giftcard", esito.card.id, {
    codice: esito.card.code,
    utilizzo: utilizzoId,
    importoCentesimi: esito.importo,
    residuoCentesimi: esito.residuo,
  });
  return esito;
}
