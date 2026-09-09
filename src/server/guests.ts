import { z } from "zod";
import { fieldDiff, recordAudit, type AuditActor } from "./audit";
import { db } from "@/lib/db";
import type { LoyaltyTier, Prisma } from "@prisma/client";
import { spesaPerOspite } from "./spesa-ospiti";

export const GuestInput = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).optional().nullable(),
  phone: z.string().optional().nullable(),
  birthday: z.coerce.date().optional().nullable(),
  language: z.string().optional(),
  loyaltyTier: z.enum(["NEW", "REGULAR", "VIP", "AMBASSADOR"]).optional(),
  preferences: z.any().optional(),
  allergies: z.string().optional().nullable(),
  privateNotes: z.string().optional().nullable(),
  marketingOptIn: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

/** Quanti ospiti per pagina. */
export const OSPITI_PER_PAGINA = 50;

function whereOspiti(venueId: string, q?: string, tag?: string): Prisma.GuestWhereInput {
  const where: Prisma.GuestWhereInput = { venueId };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ];
  }
  if (tag) {
    where.tags = { has: tag };
  }
  return where;
}

export type PaginaOspiti = {
  /**
   * Le sole colonne che l'elenco mostra. Non la riga intera: `totalSpend` è
   * un `Decimal` di Prisma e non attraversa il confine con i componenti
   * client, e le note riservate non hanno ragione di uscire da qui.
   */
  items: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    tags: string[];
    totalVisits: number;
    lastVisitAt: Date | null;
    loyaltyTier: LoyaltyTier;
    allergies: string | null;
    marketingOptIn: boolean;
    anonymizedAt: Date | null;
  }[];
  /** Quanti ne esistono in tutto, con questi filtri. */
  totale: number;
  pagina: number;
  pagine: number;
  perPagina: number;
  /**
   * Quanto ha speso ciascun ospite di **questa pagina**, in centesimi, contato
   * dai conti chiusi. Chi non c'è dentro non ha conti chiusi: è «non ancora
   * misurata», che non è lo stesso di «zero». Vedi `server/spesa-ospiti.ts`.
   */
  spesaCents: Map<string, number>;
};

/**
 * Gli ospiti, a pagine.
 *
 * Prima c'era `take: 200` e nient'altro: un locale con cinquecento clienti ne
 * vedeva duecento e **non lo sapeva**. Non c'era un messaggio, non c'era un
 * pulsante: i trecento restanti semplicemente non esistevano, e la ricerca
 * sembrava rotta a chi cercava qualcuno che era in archivio.
 *
 * Un tetto ci vuole comunque — una tabella da diecimila righe non si disegna —
 * ma va detto: qui torna anche il totale, così la pagina può scrivere «50 di
 * 312» e offrire il passo successivo.
 */
export async function listGuests(
  venueId: string,
  opts: { q?: string; tag?: string; pagina?: number; perPagina?: number } = {},
): Promise<PaginaOspiti> {
  const perPagina = Math.min(200, Math.max(10, opts.perPagina ?? OSPITI_PER_PAGINA));
  const where = whereOspiti(venueId, opts.q, opts.tag);

  const totale = await db.guest.count({ where });
  const pagine = Math.max(1, Math.ceil(totale / perPagina));
  // Una pagina fuori scala non è un errore: si riporta dentro, come per
  // un numero di pagina scritto a mano nell'indirizzo.
  const pagina = Math.min(pagine, Math.max(1, Math.floor(opts.pagina ?? 1)));

  /*
    Colonne scelte a mano, non la riga intera.

    `Guest.totalSpend` è un `Decimal` di Prisma, e un `Decimal` non attraversa
    il confine fra server e componente client: Next lo segnalava a ogni
    caricamento dell'elenco («Only plain objects can be passed to Client
    Components»). Adesso quella colonna non serve più a nessuno — la spesa si
    conta dai conti chiusi — e non chiederla è più semplice che convertirla.
  */
  const items = await db.guest.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      tags: true,
      totalVisits: true,
      lastVisitAt: true,
      loyaltyTier: true,
      allergies: true,
      marketingOptIn: true,
      anonymizedAt: true,
    },
    orderBy: [{ loyaltyTier: "desc" }, { lastVisitAt: "desc" }, { createdAt: "desc" }],
    skip: (pagina - 1) * perPagina,
    take: perPagina,
  });

  /*
    La spesa non si legge da `Guest.totalSpend` — colonna che nessuno scrive —
    ma si conta dai conti chiusi. Una query sola, e solo per i cinquanta ospiti
    di questa pagina: l'aggregazione su tutto l'archivio per mostrarne
    cinquanta sarebbe lavoro buttato.
  */
  const spesa = await spesaPerOspite(venueId, items.map((g) => g.id));

  return { items, totale, pagina, pagine, perPagina, spesaCents: spesa };
}

/**
 * Le etichette esistenti, tutte.
 *
 * Prima si leggevano i tag dei primi cinquecento ospiti e si univano: oltre
 * quella soglia un'etichetta usata solo dai clienti più vecchi **spariva dal
 * filtro**, e chi la cercava concludeva che non esisteva. Una domanda del
 * genere è una riga di SQL: `unnest` sull'array, distinti, ordinati.
 */
export async function listDistinctTags(venueId: string): Promise<string[]> {
  const righe = await db.$queryRaw<{ tag: string }[]>`
    select distinct unnest(tags) as tag
    from "Guest"
    where "venueId" = ${venueId}
    order by tag
  `;
  return righe.map((r) => r.tag);
}

export async function getGuest(venueId: string, id: string) {
  return db.guest.findFirst({
    where: { id, venueId },
    include: {
      bookings: {
        orderBy: { startsAt: "desc" },
        take: 30,
        include: { table: true },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
}

export async function createGuest(venueId: string, raw: unknown) {
  const data = GuestInput.parse(raw);
  return db.guest.create({
    data: {
      venueId,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      email: data.email || null,
      phone: data.phone ?? null,
      birthday: data.birthday ?? null,
      allergies: data.allergies ?? null,
      privateNotes: data.privateNotes ?? null,
      marketingOptIn: data.marketingOptIn ?? false,
      tags: data.tags ?? [],
      loyaltyTier: data.loyaltyTier ?? "NEW",
    },
  });
}

export async function updateGuest(venueId: string, id: string, raw: unknown, actor?: AuditActor) {
  const data = GuestInput.partial().parse(raw);
  const existing = await db.guest.findFirst({ where: { id, venueId } });
  if (!existing) throw new Error("not_found");
  const updated = await db.guest.update({ where: { id }, data });
  const diff = fieldDiff(existing, updated);
  if (diff) await recordAudit(actor, "guest.update", "guest", id, diff);
  return updated;
}
