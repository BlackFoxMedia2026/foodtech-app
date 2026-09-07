import { Prisma, type Coupon, type CouponKind } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * I coupon.
 *
 * `Coupon` e `CouponRedemption` erano nello schema per intero — codice, tipo,
 * validità, tetti d'uso, categoria, e perfino la traccia di chi l'ha usato e
 * quando. Zero righe di codice.
 *
 * La parte difficile di un coupon non è crearlo: è **il momento in cui viene
 * usato**. Lì, con il cliente al tavolo che aspetta, servono tre cose:
 *
 * - una risposta in un secondo: vale o non vale, e quanto sconta;
 * - **nessun uso in più di quelli previsti**, anche se due camerieri lo
 *   passano nello stesso momento da due tablet diversi;
 * - la possibilità di **annullare** l'utilizzo, perché lo sbaglio più comune
 *   non è la frode, è il tocco di troppo.
 *
 * Una scelta che vale la pena scrivere: **la verità su quante volte un coupon
 * è stato usato sono le righe di `CouponRedemption`**, non il contatore
 * `redemptionCount`. Il contatore si aggiorna nella stessa transazione (così
 * chi guarda il database non legge una bugia), ma i controlli contano le
 * righe. In questo progetto i contatori scollegati dai fatti hanno già fatto
 * abbastanza danni.
 */

/* -------------------------------------------------------------------------- */
/*  Creazione                                                                 */
/* -------------------------------------------------------------------------- */

export const CouponInput = z
  .object({
    name: z.string().trim().min(1, "Serve un nome, che è quello che legge il cliente").max(80),
    description: z.string().trim().max(500).optional().nullable(),
    /** Se non lo scrivi tu, lo generiamo leggibile. */
    code: z
      .string()
      .trim()
      .min(3, "Un codice troppo corto si indovina")
      .max(24)
      .regex(/^[A-Za-z0-9-]+$/, "Nel codice ci vanno solo lettere, numeri e il segno meno")
      .optional(),
    kind: z.enum(["PERCENT", "FIXED", "FREE_ITEM", "MENU_OFFER"]),
    /** Percentuale (1-100) o centesimi, secondo il tipo. */
    value: z.coerce.number().int().min(0).max(1_000_000).optional(),
    freeItem: z.string().trim().max(120).optional().nullable(),
    category: z
      .enum(["GENERIC", "BIRTHDAY", "WINBACK", "EVENT", "NEW_CUSTOMER", "WIFI", "REFERRAL", "STAFF"])
      .optional(),
    validFrom: z.coerce.date().optional().nullable(),
    validUntil: z.coerce.date().optional().nullable(),
    /** Quante volte in tutto. Vuoto = senza tetto. */
    maxRedemptions: z.coerce.number().int().min(1).max(100_000).optional().nullable(),
    /** Quante volte per singolo cliente. */
    maxPerGuest: z.coerce.number().int().min(1).max(100).optional(),
    /** Riservato a un cliente preciso. */
    guestId: z.string().optional().nullable(),
    /** Spesa minima del conto, in centesimi. */
    minSpendCents: z.coerce.number().int().min(0).max(1_000_00).optional().nullable(),
    /** Giorni della settimana in cui vale (0 = domenica). Vuoto = tutti. */
    validWeekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
  })
  .refine((d) => !(d.validFrom && d.validUntil) || d.validUntil > d.validFrom, {
    message: "La fine della validità deve venire dopo l'inizio",
    path: ["validUntil"],
  })
  .refine((d) => d.kind !== "PERCENT" || (d.value != null && d.value >= 1 && d.value <= 100), {
    message: "Una percentuale sta fra 1 e 100",
    path: ["value"],
  })
  .refine((d) => d.kind !== "FIXED" || (d.value != null && d.value > 0), {
    message: "Uno sconto fisso deve valere qualcosa",
    path: ["value"],
  })
  .refine((d) => (d.kind !== "FREE_ITEM" && d.kind !== "MENU_OFFER") || !!d.freeItem?.trim(), {
    message: "Scrivi cosa si offre",
    path: ["freeItem"],
  });

export type CouponInputType = z.infer<typeof CouponInput>;

/**
 * Un codice leggibile al telefono.
 *
 * Niente lettere e cifre che si confondono a voce o su carta (O/0, I/1/L,
 * S/5): un coupon si detta al telefono e si scrive a mano su un tovagliolo, e
 * «BENVENUTO-0IL5» è un modo sicuro di far litigare cassa e cliente.
 */
const ALFABETO = "ABCDEFGHJKMNPQRTUVWXYZ2346789";

export function codiceCasuale(lunghezza = 6): string {
  let out = "";
  for (let i = 0; i < lunghezza; i++) {
    out += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return out;
}

/** Un prefisso ricavato dal nome, per un codice che si riconosce. */
export function prefissoDaNome(nome: string): string {
  const pulito = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return pulito.slice(0, 8) || "COUPON";
}

async function codiceLibero(nome: string): Promise<string> {
  // `Coupon.code` è unico su tutta l'installazione, non per locale: la
  // collisione può arrivare da un altro ristorante, e va gestita comunque.
  for (let tentativo = 0; tentativo < 20; tentativo++) {
    const candidato = `${prefissoDaNome(nome)}-${codiceCasuale()}`;
    const preso = await db.coupon.findUnique({ where: { code: candidato }, select: { id: true } });
    if (!preso) return candidato;
  }
  return `${prefissoDaNome(nome)}-${Date.now().toString(36).toUpperCase()}`;
}

export async function createCoupon(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = CouponInput.parse(raw);

  const code = data.code?.trim().toUpperCase() ?? (await codiceLibero(data.name));
  if (data.code) {
    const preso = await db.coupon.findUnique({ where: { code }, select: { id: true } });
    if (preso) throw new Error("code_taken");
  }

  if (data.guestId) {
    const ospite = await db.guest.findFirst({ where: { id: data.guestId, venueId }, select: { id: true } });
    if (!ospite) throw new Error("not_found");
  }

  const creato = await db.coupon.create({
    data: {
      venueId,
      code,
      name: data.name,
      description: data.description ?? null,
      kind: data.kind,
      value: data.value ?? 0,
      freeItem: data.freeItem ?? null,
      category: data.category ?? "GENERIC",
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
      maxRedemptions: data.maxRedemptions ?? null,
      maxPerGuest: data.maxPerGuest ?? 1,
      guestId: data.guestId ?? null,
      minSpendCents: data.minSpendCents ?? null,
      validWeekdays: data.validWeekdays ?? [],
      status: "ACTIVE",
    },
  });

  await recordAudit(opts.actor, "coupon.create", "coupon", creato.id, {
    codice: creato.code,
    nome: creato.name,
    tipo: creato.kind,
    valore: creato.value,
  });

  return creato;
}

export async function setCouponStatus(
  venueId: string,
  id: string,
  status: "ACTIVE" | "PAUSED" | "ARCHIVED",
  opts: { actor?: AuditActor } = {},
) {
  const esistente = await db.coupon.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");

  const aggiornato = await db.coupon.update({ where: { id }, data: { status } });
  await recordAudit(opts.actor, "coupon.update", "coupon", id, { codice: aggiornato.code, stato: status });
  return aggiornato;
}

/* -------------------------------------------------------------------------- */
/*  Vale o non vale                                                           */
/* -------------------------------------------------------------------------- */

export type NonValido =
  | "paused"
  | "archived"
  | "not_yet_valid"
  | "expired"
  | "exhausted"
  | "wrong_guest"
  | "guest_limit"
  | "guest_unknown"
  | "wrong_day"
  | "below_min_spend";

/** Perché un coupon non si può usare, detto in italiano. */
export const MOTIVO_NON_VALIDO: Record<NonValido, string> = {
  paused: "Questo coupon è in pausa.",
  archived: "Questo coupon è stato archiviato.",
  not_yet_valid: "Questo coupon non è ancora valido.",
  expired: "Questo coupon è scaduto.",
  exhausted: "Questo coupon ha esaurito gli utilizzi previsti.",
  wrong_guest: "Questo coupon è riservato a un altro cliente.",
  guest_limit: "Questo cliente ha già usato il coupon tutte le volte previste.",
  guest_unknown: "Per questo coupon serve sapere chi lo sta usando: la prenotazione non ha un cliente collegato.",
  wrong_day: "Questo coupon non vale oggi.",
  below_min_spend: "Il conto non arriva alla spesa minima prevista da questo coupon.",
};

export type Usabilita = { usable: true } | { usable: false; reason: NonValido };

/**
 * Se questo coupon si può usare adesso, per questa persona.
 *
 * Una funzione sola, usata sia per **mostrare** lo stato nell'elenco sia per
 * **decidere** al momento dell'uso: se fossero due strade diverse, prima o poi
 * la pagina direbbe «valido» e la cassa risponderebbe di no.
 *
 * La scadenza è calcolata dalle date, non letta dallo stato: `status` è quello
 * che ha deciso il locale (attivo, in pausa, archiviato), mentre «scaduto»
 * dipende dall'orologio. Tenerlo in un campo vorrebbe dire che qualcuno deve
 * ricordarsi di aggiornarlo.
 */
export function couponUsability(
  coupon: Pick<
    Coupon,
    | "status"
    | "validFrom"
    | "validUntil"
    | "maxRedemptions"
    | "maxPerGuest"
    | "guestId"
    | "minSpendCents"
    | "validWeekdays"
  >,
  contesto: {
    now: Date;
    usiTotali: number;
    /**
     * Chi lo sta usando, **se lo si sta usando**.
     *
     * Assente vuol dire «giudizio generale», ed è il caso dell'elenco: lì un
     * cliente non c'è, e i limiti per persona non si possono valutare. Prima
     * questa distinzione non c'era e ogni coupon compariva «non valido» —
     * perché il controllo del tetto per cliente scattava su un cliente che
     * nessuno aveva indicato.
     *
     * Presente con `guestId: null` è un caso diverso e vero: si sta usando su
     * una prenotazione senza cliente collegato, e allora il tetto per persona
     * **non si può rispettare**. Meglio rifiutare che far finta di
     * controllare.
     */
    ospite?: { guestId: string | null; usi: number };
    /**
     * Il conto su cui si sta usando, se c'è.
     *
     * Assente vuol dire «giudizio generale», come per l'ospite: nell'elenco
     * non c'è un conto, e bocciare un coupon perché non conosciamo una spesa
     * che nessuno ha ancora fatto sarebbe il difetto del tetto per cliente,
     * ripetuto.
     */
    conto?: { totaleCents: number };
  },
): Usabilita {
  if (coupon.status === "PAUSED") return { usable: false, reason: "paused" };
  if (coupon.status === "ARCHIVED") return { usable: false, reason: "archived" };
  if (coupon.validFrom && contesto.now < coupon.validFrom) return { usable: false, reason: "not_yet_valid" };
  if (coupon.validUntil && contesto.now > coupon.validUntil) return { usable: false, reason: "expired" };
  if (coupon.maxRedemptions != null && contesto.usiTotali >= coupon.maxRedemptions) {
    return { usable: false, reason: "exhausted" };
  }

  // Il giorno si sa sempre: è oggi.
  //
  // `?? []` non è difensivismo inutile: una riga scritta prima che la colonna
  // esistesse, o una lettura parziale, arriva qui senza quel campo — e una
  // pagina che elenca coupon non deve andare in bianco per un valore mancante.
  const giorniValidi = coupon.validWeekdays ?? [];
  if (giorniValidi.length > 0 && !giorniValidi.includes(contesto.now.getDay())) {
    return { usable: false, reason: "wrong_day" };
  }

  // La spesa minima si può giudicare solo con un conto davanti.
  if (coupon.minSpendCents != null && contesto.conto && contesto.conto.totaleCents < coupon.minSpendCents) {
    return { usable: false, reason: "below_min_spend" };
  }

  // Da qui in giù si parla del singolo cliente: senza sapere per chi, non c'è
  // niente da verificare e niente da bocciare.
  if (!contesto.ospite) return { usable: true };

  if (coupon.guestId) {
    if (!contesto.ospite.guestId) return { usable: false, reason: "guest_unknown" };
    if (contesto.ospite.guestId !== coupon.guestId) return { usable: false, reason: "wrong_guest" };
  }

  if (coupon.maxPerGuest > 0) {
    // Un tetto per cliente si può rispettare solo sapendo chi è il cliente.
    if (!contesto.ospite.guestId) return { usable: false, reason: "guest_unknown" };
    if (contesto.ospite.usi >= coupon.maxPerGuest) return { usable: false, reason: "guest_limit" };
  }

  return { usable: true };
}

/** Quanto sconta, detto come lo dice il cameriere. */
export function descriviCoupon(coupon: Pick<Coupon, "kind" | "value" | "freeItem">): string {
  switch (coupon.kind as CouponKind) {
    case "PERCENT":
      return `${coupon.value}% di sconto`;
    case "FIXED":
      return `${(coupon.value / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })} di sconto`;
    case "FREE_ITEM":
      return `${coupon.freeItem ?? "un omaggio"} in omaggio`;
    case "MENU_OFFER":
      return coupon.freeItem ?? "offerta dedicata";
  }
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export type CouponView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: CouponKind;
  value: number;
  freeItem: string | null;
  category: string;
  status: string;
  validFrom: Date | null;
  validUntil: Date | null;
  maxRedemptions: number | null;
  maxPerGuest: number;
  /** Le due condizioni, se ci sono: servono a leggerle senza aprire nulla. */
  minSpendCents: number | null;
  validWeekdays: number[];
  guestName: string | null;
  /** Le righe vere, non il contatore. */
  usi: number;
  /** Quanti ne restano, se c'è un tetto. */
  restanti: number | null;
  descrizione: string;
  /** Lo stato utile: si può usare adesso? Se no, perché. */
  stato: "usabile" | NonValido;
};

export async function listCoupons(
  venueId: string,
  opts: { includeArchived?: boolean; now?: Date } = {},
): Promise<CouponView[]> {
  const now = opts.now ?? new Date();
  const coupons = await db.coupon.findMany({
    where: { venueId, ...(opts.includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
    orderBy: { createdAt: "desc" },
    include: {
      Guest: { select: { firstName: true, lastName: true } },
      // Solo gli utilizzi non annullati: annullare deve rimettere l'uso a
      // disposizione, altrimenti un tocco sbagliato brucia un coupon.
      CouponRedemption: { where: { deletedAt: null }, select: { id: true } },
    },
  });

  return coupons.map((c) => {
    const usi = c.CouponRedemption.length;
    // Nell'elenco non c'è un cliente: si valuta tutto tranne i limiti per
    // persona, che dipendono da chi lo sta usando.
    const esito = couponUsability(c, { now, usiTotali: usi });
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      kind: c.kind,
      value: c.value,
      freeItem: c.freeItem,
      category: c.category,
      status: c.status,
      validFrom: c.validFrom,
      validUntil: c.validUntil,
      maxRedemptions: c.maxRedemptions,
      maxPerGuest: c.maxPerGuest,
      minSpendCents: c.minSpendCents,
      validWeekdays: c.validWeekdays,
      guestName: c.Guest ? `${c.Guest.firstName}${c.Guest.lastName ? ` ${c.Guest.lastName}` : ""}` : null,
      usi,
      restanti: c.maxRedemptions != null ? Math.max(0, c.maxRedemptions - usi) : null,
      descrizione: descriviCoupon(c),
      stato: esito.usable ? "usabile" : esito.reason,
    };
  });
}

/** Gli ultimi utilizzi di un coupon: chi, quando, con quale prenotazione. */
export function listRedemptions(venueId: string, couponId: string) {
  return db.couponRedemption.findMany({
    where: { venueId, couponId, deletedAt: null },
    orderBy: { redeemedAt: "desc" },
    take: 50,
    select: {
      id: true,
      redeemedAt: true,
      amountCents: true,
      notes: true,
      Guest: { select: { id: true, firstName: true, lastName: true } },
      bookingId: true,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  L'uso                                                                     */
/* -------------------------------------------------------------------------- */

export class CouponError extends Error {
  constructor(
    public code: "not_found" | NonValido,
    public detail?: unknown,
  ) {
    super(code);
  }
}

export type RedeemInput = {
  code: string;
  guestId?: string | null;
  bookingId?: string | null;
  /** Quanto è stato scontato davvero, se lo si sa. */
  amountCents?: number | null;
  notes?: string | null;
};

/**
 * Segna un coupon come usato.
 *
 * Tutto dentro una transazione con isolamento serializzabile, e i controlli
 * **dentro** la transazione: due camerieri che passano lo stesso codice nello
 * stesso istante da due tablet non devono poter superare il tetto. È lo stesso
 * motivo per cui l'assegnazione dei tavoli è serializzabile.
 */
export async function redeemCoupon(venueId: string, input: RedeemInput, opts: { actor?: AuditActor } = {}) {
  const code = input.code.trim().toUpperCase();

  const esito = await db.$transaction(
    async (tx) => {
      // Il codice si cerca **dentro** il locale: quello di un altro
      // ristorante non deve nemmeno risultare esistente.
      const coupon = await tx.coupon.findFirst({ where: { code, venueId } });
      if (!coupon) throw new CouponError("not_found");

      const [usiTotali, usiDelCliente] = await Promise.all([
        tx.couponRedemption.count({ where: { couponId: coupon.id, deletedAt: null } }),
        input.guestId
          ? tx.couponRedemption.count({
              where: { couponId: coupon.id, guestId: input.guestId, deletedAt: null },
            })
          : Promise.resolve(0),
      ]);

      // Il conto aperto di quella prenotazione, se c'è: senza, la spesa
      // minima non si può giudicare e non si giudica.
      const contoAperto = input.bookingId
        ? await tx.order.findFirst({
            where: { venueId, bookingId: input.bookingId, status: { in: ["RECEIVED", "PREPARING", "READY"] } },
            select: { OrderItem: { select: { priceCents: true, quantity: true } } },
          })
        : null;
      const totaleConto = contoAperto
        ? contoAperto.OrderItem.reduce((n, r) => n + r.priceCents * r.quantity, 0)
        : null;

      const valido = couponUsability(coupon, {
        now: new Date(),
        usiTotali,
        ospite: { guestId: input.guestId ?? null, usi: usiDelCliente },
        ...(totaleConto != null ? { conto: { totaleCents: totaleConto } } : {}),
      });
      if (!valido.usable) throw new CouponError(valido.reason);

      const redenzione = await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          venueId,
          guestId: input.guestId ?? null,
          bookingId: input.bookingId ?? null,
          amountCents: input.amountCents ?? null,
          notes: input.notes ?? null,
          redeemedBy: opts.actor?.userId ?? null,
        },
      });

      // Il contatore si tiene aggiornato perché chi legge il database non
      // trovi un numero falso; la verità resta il conteggio delle righe.
      const usiDopo = usiTotali + 1;
      const esaurito = coupon.maxRedemptions != null && usiDopo >= coupon.maxRedemptions;
      const aggiornato = await tx.coupon.update({
        where: { id: coupon.id },
        data: {
          redemptionCount: usiDopo,
          // Esaurito è un fatto compiuto, non una scadenza: qui lo stato si
          // può scrivere senza che nessuno debba ricordarsene dopo.
          ...(esaurito ? { status: "EXPIRED" as const } : {}),
        },
      });

      return { coupon: aggiornato, redenzione, usiDopo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(opts.actor, "coupon.redeem", "coupon", esito.coupon.id, {
    codice: esito.coupon.code,
    ospite: input.guestId ?? null,
    prenotazione: input.bookingId ?? null,
    usi: esito.usiDopo,
  });

  return {
    couponId: esito.coupon.id,
    redemptionId: esito.redenzione.id,
    code: esito.coupon.code,
    name: esito.coupon.name,
    descrizione: descriviCoupon(esito.coupon),
    usi: esito.usiDopo,
    restanti: esito.coupon.maxRedemptions != null ? Math.max(0, esito.coupon.maxRedemptions - esito.usiDopo) : null,
  };
}

/**
 * Annulla un utilizzo.
 *
 * Lo sbaglio più comune al tavolo non è la frode, è il tocco di troppo: un
 * coupon segnato per la persona sbagliata deve poter tornare disponibile.
 * L'utilizzo non si cancella, si segna annullato — così resta la traccia di
 * cosa è stato fatto e da chi (i campi `deletedAt`/`deletedBy` esistevano già).
 */
export async function undoRedemption(venueId: string, redemptionId: string, opts: { actor?: AuditActor } = {}) {
  const esito = await db.$transaction(async (tx) => {
    const redenzione = await tx.couponRedemption.findFirst({
      where: { id: redemptionId, venueId, deletedAt: null },
    });
    if (!redenzione) throw new CouponError("not_found");

    await tx.couponRedemption.update({
      where: { id: redemptionId },
      data: { deletedAt: new Date(), deletedBy: opts.actor?.userId ?? null },
    });

    const usi = await tx.couponRedemption.count({
      where: { couponId: redenzione.couponId, deletedAt: null },
    });
    const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: redenzione.couponId } });
    const tornaDisponibile = coupon.status === "EXPIRED" && (coupon.maxRedemptions == null || usi < coupon.maxRedemptions);

    await tx.coupon.update({
      where: { id: coupon.id },
      data: {
        redemptionCount: usi,
        // Se era finito solo perché esaurito, torna attivo: annullare un uso
        // che non doveva esserci deve rimettere le cose come stavano.
        ...(tornaDisponibile ? { status: "ACTIVE" as const } : {}),
      },
    });

    return { couponId: coupon.id, code: coupon.code, usi };
  });

  await recordAudit(opts.actor, "coupon.redeem_undo", "coupon", esito.couponId, {
    codice: esito.code,
    utilizzo: redemptionId,
    usi: esito.usi,
  });

  return esito;
}
