import { Prisma, type LoyaltyTxnKind } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * La raccolta punti.
 *
 * `LoyaltyTransaction` era nello schema per intero — tipo di movimento, punti,
 * motivo, il legame con la prenotazione e con il conto — e `Guest.loyaltyPoints`
 * stava sulla scheda del cliente. Zero righe di codice: un contatore che
 * nessuno scriveva, cioè esattamente la specie di numero che questo progetto ha
 * passato giorni a togliere dalle pagine.
 *
 * Tre scelte tengono in piedi il resto.
 *
 * **I punti si guadagnano sui conti chiusi.** Non sulle visite, non sui
 * coperti, non su una spesa stimata: su euro davvero incassati. Prima dei conti
 * al tavolo una raccolta punti qui non poteva esistere se non regalando punti
 * su cifre inventate — ed è il motivo per cui arriva ora e non sei moduli fa.
 *
 * **La verità è la somma delle righe**, con il segno: un guadagno è positivo,
 * un riscatto è negativo, una rettifica è quello che è. Il saldo di un cliente
 * è `SUM(points)`, e `Guest.loyaltyPoints` è una copia aggiornata nella stessa
 * transazione — così chi legge il database non trova una bugia — ma nessun
 * controllo si fida di quella copia.
 *
 * **Le due regole le dichiara il locale.** Quanti punti per euro, e quanto vale
 * un punto quando si riscatta. Senza entrambe la raccolta è spenta: una
 * raccolta accesa a metà regalerebbe sconti decisi da noi, e non è una nostra
 * decisione da prendere.
 *
 * Cosa non c'è, di proposito: la **scadenza dei punti**. `LoyaltyTxnKind` ha
 * `EXPIRED`, ma far scadere i punti significa cancellare qualcosa che un
 * cliente considera suo, secondo una regola che nessuno ha scritto qui. Il
 * giorno in cui il locale deciderà «i punti valgono un anno», quel movimento
 * avrà un senso; oggi scriverlo vorrebbe dire inventare la regola.
 */

/* -------------------------------------------------------------------------- */
/*  Le regole                                                                 */
/* -------------------------------------------------------------------------- */

export type RegoleFedelta = {
  /** Punti accreditati per ogni euro speso, sui conti chiusi. */
  puntiPerEuro: number;
  /** Quanto vale un punto quando si riscatta, in centesimi. */
  valorePuntoCents: number;
  /**
   * Il traguardo, se il locale ne ha messo uno.
   *
   * Non serve a calcolare niente: serve a **dirlo**. «Ti mancano 40 punti alla
   * cena omaggio» è la frase che riporta le persone; «hai 160 punti» non lo è.
   */
  premio: { punti: number; cosa: string } | null;
};

/**
 * Le regole del locale, o `null` se la raccolta è spenta.
 *
 * Servono entrambe: con i punti ma senza il loro valore i clienti accumulano
 * qualcosa che non si può spendere, e con il valore ma senza i punti non si
 * accumula niente. Mezza raccolta punti è peggio di nessuna.
 */
export function regoleFedelta(venue: {
  loyaltyPointsPerEuro: number | null;
  loyaltyPointValueCents: number | null;
  loyaltyRewardPoints?: number | null;
  loyaltyRewardLabel?: string | null;
}): RegoleFedelta | null {
  if (!venue.loyaltyPointsPerEuro || !venue.loyaltyPointValueCents) return null;
  return {
    puntiPerEuro: venue.loyaltyPointsPerEuro,
    valorePuntoCents: venue.loyaltyPointValueCents,
    // Il premio esiste solo se ci sono **entrambi**: una soglia senza nome è
    // un numero, un nome senza soglia è una promessa senza condizione.
    premio:
      venue.loyaltyRewardPoints && venue.loyaltyRewardLabel
        ? { punti: venue.loyaltyRewardPoints, cosa: venue.loyaltyRewardLabel }
        : null,
  };
}

export const RegoleInput = z
  .object({
    /** Vuoto o zero spegne la raccolta. */
    puntiPerEuro: z.union([z.coerce.number().int().min(0).max(1000), z.null()]),
    valorePuntoCents: z.union([z.coerce.number().int().min(0).max(10_000), z.null()]),
    /** Il traguardo: quanti punti e cosa si vince. Entrambi o nessuno. */
    premioPunti: z.union([z.coerce.number().int().min(1).max(100_000), z.null()]).optional(),
    premioCosa: z.union([z.string().trim().max(120), z.null()]).optional(),
  })
  .refine((d) => !d.puntiPerEuro === !d.valorePuntoCents, {
    message: "Servono entrambe le regole: quanti punti per euro e quanto vale un punto.",
    path: ["valorePuntoCents"],
  });

export async function setRegoleFedelta(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = RegoleInput.parse(raw);
  const spenta = !data.puntiPerEuro || !data.valorePuntoCents;

  // Il premio vale solo con entrambe le parti, e sparisce se la raccolta si
  // spegne: un traguardo senza punti da accumulare è una promessa vuota.
  const premioPunti = data.premioPunti ?? null;
  const premioCosa = data.premioCosa?.trim() || null;
  const premioValido = !spenta && premioPunti != null && !!premioCosa;

  const venue = await db.venue.update({
    where: { id: venueId },
    data: {
      loyaltyPointsPerEuro: spenta ? null : data.puntiPerEuro,
      loyaltyPointValueCents: spenta ? null : data.valorePuntoCents,
      loyaltyRewardPoints: premioValido ? premioPunti : null,
      loyaltyRewardLabel: premioValido ? premioCosa : null,
    },
    select: {
      loyaltyPointsPerEuro: true,
      loyaltyPointValueCents: true,
      loyaltyRewardPoints: true,
      loyaltyRewardLabel: true,
    },
  });

  await recordAudit(opts.actor, "loyalty.rules_update", "venue", venueId, {
    puntiPerEuro: venue.loyaltyPointsPerEuro,
    valorePuntoCents: venue.loyaltyPointValueCents,
  });
  return venue;
}

/** Quanto valgono, in centesimi, tot punti. */
export function valoreInCentesimi(punti: number, regole: RegoleFedelta): number {
  return Math.max(0, punti) * regole.valorePuntoCents;
}

/**
 * Quanti punti servono per scontare una certa cifra.
 *
 * Si arrotonda **per eccesso**: se un punto vale 5 centesimi e si vogliono
 * scontare 12 centesimi, servono 3 punti. Arrotondare per difetto regalerebbe
 * la differenza, e la differenza la paga il locale.
 */
export function puntiPerCentesimi(centesimi: number, regole: RegoleFedelta): number {
  if (regole.valorePuntoCents <= 0) return 0;
  return Math.ceil(Math.max(0, centesimi) / regole.valorePuntoCents);
}

/* -------------------------------------------------------------------------- */
/*  Il saldo                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Il saldo punti di un cliente: la somma delle righe, non il contatore.
 *
 * Il contatore su `Guest` esiste e viene tenuto aggiornato, ma è una copia. Chi
 * decide qualcosa — quanti punti si possono riscattare, per esempio — conta le
 * righe.
 */
export async function puntiDi(
  guestId: string,
  tx: Prisma.TransactionClient | typeof db = db,
): Promise<number> {
  const somma = await tx.loyaltyTransaction.aggregate({
    where: { guestId },
    _sum: { points: true },
  });
  return somma._sum.points ?? 0;
}

/** Il movimento più recente per primo: è la storia che legge il cliente. */
export function listMovimenti(venueId: string, guestId: string, take = 20) {
  return db.loyaltyTransaction.findMany({
    where: { venueId, guestId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, points: true, reason: true, orderId: true, createdAt: true },
  });
}

/** Come si racconta un movimento a chi guarda la scheda. */
export function descriviMovimento(m: { kind: LoyaltyTxnKind; points: number; reason: string | null }): string {
  if (m.reason) return m.reason;
  switch (m.kind) {
    case "EARNED":
      return "Punti da un conto chiuso";
    case "REDEEMED":
      return "Punti usati come sconto";
    case "ADJUSTED":
      return m.points >= 0 ? "Punti aggiunti a mano" : "Punti tolti a mano";
    case "EXPIRED":
      return "Punti scaduti";
  }
}

/* -------------------------------------------------------------------------- */
/*  Guadagnare                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Accredita i punti di un conto chiuso, **dentro la transazione che lo chiude**.
 *
 * Chiamarla dopo vorrebbe dire che un errore fra le due scritture lascia un
 * incasso senza i suoi punti, e nessuno se ne accorgerebbe fino al reclamo del
 * cliente.
 *
 * Non accredita niente e non si lamenta quando:
 *
 * - la raccolta è spenta (nessuna regola dichiarata);
 * - il conto non ha un cliente collegato — un tavolo senza nome non ha una
 *   tessera a cui accreditare;
 * - **quel conto ha già i suoi punti**: chiudere due volte lo stesso conto non
 *   deve raddoppiarli. È l'unica difesa che serve, perché la chiave è il
 *   conto, non il momento.
 */
export async function accreditaPuntiConto(
  tx: Prisma.TransactionClient,
  args: { venueId: string; orderId: string; guestId: string | null; totalCents: number; regole: RegoleFedelta | null },
): Promise<{ punti: number; saldo: number } | null> {
  const { venueId, orderId, guestId, totalCents, regole } = args;
  if (!regole || !guestId || totalCents <= 0) return null;

  const gia = await tx.loyaltyTransaction.findFirst({
    where: { orderId, kind: "EARNED" },
    select: { id: true },
  });
  if (gia) return null;

  // Gli euro interi: 24,90 € fanno 24 punti con una regola da un punto per
  // euro. I centesimi non si arrotondano in su, altrimenti il locale regala
  // punti su una cifra che non ha incassato.
  const euro = Math.floor(totalCents / 100);
  const punti = euro * regole.puntiPerEuro;
  if (punti <= 0) return null;

  await tx.loyaltyTransaction.create({
    data: {
      venueId,
      guestId,
      orderId,
      kind: "EARNED",
      points: punti,
      reason: `Conto da ${(totalCents / 100).toFixed(2).replace(".", ",")} €`,
    },
  });

  const saldo = await puntiDi(guestId, tx);
  await tx.guest.update({ where: { id: guestId }, data: { loyaltyPoints: saldo } });
  return { punti, saldo };
}

/* -------------------------------------------------------------------------- */
/*  Riscattare e rettificare                                                  */
/* -------------------------------------------------------------------------- */

export class LoyaltyError extends Error {
  constructor(public code: "not_found" | "loyalty_off" | "not_enough_points" | "invalid_points") {
    super(code);
  }
}

/**
 * Usa dei punti come sconto.
 *
 * Serializzabile e con il controllo del saldo **dentro** la transazione: due
 * tablet che riscattano gli stessi punti nello stesso istante non devono poter
 * mandare un cliente sotto zero. È lo stesso motivo dei coupon e dei tavoli.
 *
 * Il movimento è **negativo**: il saldo è la somma con il segno, e un riscatto
 * che togliesse punti aggiornando solo un contatore sarebbe il contatore
 * scollegato dai fatti di sempre.
 */
export async function riscattaPunti(
  venueId: string,
  input: { guestId: string; punti: number; orderId?: string | null; bookingId?: string | null; reason?: string | null },
  opts: { actor?: AuditActor } = {},
) {
  const punti = Math.floor(input.punti);
  if (!Number.isFinite(punti) || punti <= 0) throw new LoyaltyError("invalid_points");

  const esito = await db.$transaction(
    async (tx) => {
      const venue = await tx.venue.findUnique({
        where: { id: venueId },
        select: { loyaltyPointsPerEuro: true, loyaltyPointValueCents: true },
      });
      if (!venue) throw new LoyaltyError("not_found");
      const regole = regoleFedelta(venue);
      if (!regole) throw new LoyaltyError("loyalty_off");

      const ospite = await tx.guest.findFirst({ where: { id: input.guestId, venueId }, select: { id: true } });
      if (!ospite) throw new LoyaltyError("not_found");

      const saldo = await puntiDi(input.guestId, tx);
      if (saldo < punti) throw new LoyaltyError("not_enough_points");

      const scontoCents = valoreInCentesimi(punti, regole);
      const movimento = await tx.loyaltyTransaction.create({
        data: {
          venueId,
          guestId: input.guestId,
          kind: "REDEEMED",
          points: -punti,
          // Il valore si fotografa adesso: se domani un punto vale il doppio,
          // lo sconto di stasera resta quello di stasera.
          amountCents: scontoCents,
          orderId: input.orderId ?? null,
          bookingId: input.bookingId ?? null,
          reason: input.reason ?? `Sconto di ${(scontoCents / 100).toFixed(2).replace(".", ",")} €`,
          createdBy: opts.actor?.userId ?? null,
        },
      });

      const dopo = saldo - punti;
      await tx.guest.update({ where: { id: input.guestId }, data: { loyaltyPoints: dopo } });

      return { movimentoId: movimento.id, punti, scontoCents, saldo: dopo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(opts.actor, "loyalty.redeem", "guest", input.guestId, {
    punti: esito.punti,
    scontoCentesimi: esito.scontoCents,
    conto: input.orderId ?? null,
    saldo: esito.saldo,
  });
  return esito;
}

/**
 * Aggiunge o toglie punti a mano, con un motivo scritto.
 *
 * Serve per rimediare: un conto pagato in contanti senza tessera, un gesto
 * commerciale, un riscatto annullato. Il motivo è obbligatorio perché fra sei
 * mesi «+200 punti» senza spiegazione è indistinguibile da un errore.
 */
export async function rettificaPunti(
  venueId: string,
  input: { guestId: string; punti: number; reason: string },
  opts: { actor?: AuditActor } = {},
) {
  const punti = Math.floor(input.punti);
  const reason = input.reason.trim();
  if (!Number.isFinite(punti) || punti === 0) throw new LoyaltyError("invalid_points");
  if (!reason) throw new LoyaltyError("invalid_points");

  const esito = await db.$transaction(
    async (tx) => {
      const ospite = await tx.guest.findFirst({ where: { id: input.guestId, venueId }, select: { id: true } });
      if (!ospite) throw new LoyaltyError("not_found");

      const saldo = await puntiDi(input.guestId, tx);
      // Il saldo non va sotto zero nemmeno a mano: un saldo negativo è un
      // debito che nessuna parte dell'applicazione sa raccontare.
      if (punti < 0 && saldo + punti < 0) throw new LoyaltyError("not_enough_points");

      await tx.loyaltyTransaction.create({
        data: {
          venueId,
          guestId: input.guestId,
          kind: "ADJUSTED",
          points: punti,
          reason: reason.slice(0, 200),
          createdBy: opts.actor?.userId ?? null,
        },
      });

      const dopo = saldo + punti;
      await tx.guest.update({ where: { id: input.guestId }, data: { loyaltyPoints: dopo } });
      return { punti, saldo: dopo };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  await recordAudit(opts.actor, "loyalty.adjust", "guest", input.guestId, {
    punti: esito.punti,
    motivo: reason,
    saldo: esito.saldo,
  });
  return esito;
}

/* -------------------------------------------------------------------------- */
/*  La scheda del cliente                                                     */
/* -------------------------------------------------------------------------- */

export type SaldoFedelta = {
  attiva: boolean;
  punti: number;
  /** Quanto manca al premio, se il locale ne ha messo uno. */
  alPremio: { mancano: number; cosa: string; punti: number } | null;
  /** Quanto valgono, se la raccolta è attiva. */
  valoreCents: number | null;
  regole: RegoleFedelta | null;
  movimenti: Awaited<ReturnType<typeof listMovimenti>>;
};

/** Punti, valore e storia di un cliente, in una lettura. */
export async function getSaldoFedelta(venueId: string, guestId: string): Promise<SaldoFedelta> {
  const [venue, punti, movimenti] = await Promise.all([
    db.venue.findUnique({
      where: { id: venueId },
      select: {
        loyaltyPointsPerEuro: true,
        loyaltyPointValueCents: true,
        loyaltyRewardPoints: true,
        loyaltyRewardLabel: true,
      },
    }),
    puntiDi(guestId),
    listMovimenti(venueId, guestId),
  ]);

  const regole = venue ? regoleFedelta(venue) : null;
  return {
    attiva: regole != null,
    punti,
    alPremio:
      regole?.premio != null
        ? {
            mancano: Math.max(0, regole.premio.punti - punti),
            cosa: regole.premio.cosa,
            punti: regole.premio.punti,
          }
        : null,
    valoreCents: regole ? valoreInCentesimi(punti, regole) : null,
    regole,
    movimenti,
  };
}
