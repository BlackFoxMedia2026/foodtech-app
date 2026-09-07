import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, WaitlistStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { fieldDiff, recordAudit, type AuditActor } from "./audit";
import { createBooking } from "./bookings";
import { checkAvailability, DEFAULT_DURATION_MIN } from "./availability";

/**
 * Lista d'attesa.
 *
 * `WaitlistEntry` esisteva nello schema — con token dell'offerta, scadenza,
 * conversione in prenotazione — e non aveva **una riga** di codice. Questo
 * modulo la trasforma in prodotto.
 *
 * Due scelte di fondo:
 *
 * - **La coda non si riordina da sola.** Chi arriva prima sta prima. Il fatto
 *   che un ospite sia VIP è un'informazione che mostriamo a chi decide, non un
 *   sorpasso automatico: in sala la fila è una promessa fatta a delle persone.
 * - **Sedere qualcuno passa da `createBooking`.** Così la lista d'attesa non
 *   diventa una porta di servizio per aggirare il controllo di disponibilità:
 *   se il tavolo non regge, non regge nemmeno da qui.
 */

/* -------------------------------------------------------------------------- */
/*  Stati                                                                     */
/* -------------------------------------------------------------------------- */

/** Stati in cui l'ospite è ancora in gioco: occupano un posto in coda. */
export const ACTIVE_WAITLIST_STATUSES = ["WAITING", "NOTIFIED", "CONFIRMED"] as const satisfies WaitlistStatus[];

/** Stati definitivi: la riga resta per lo storico ma esce dalla coda. */
export const CLOSED_WAITLIST_STATUSES = [
  "SEATED",
  "CANCELLED",
  "LEFT",
  "EXPIRED",
  "DECLINED",
  "NO_SHOW",
] as const satisfies WaitlistStatus[];

/**
 * Le transizioni ammesse. Tutto ciò che non è qui viene rifiutato: uno stato
 * impossibile è un dato corrotto, e in una lista d'attesa si traduce in un
 * tavolo tenuto per qualcuno che non arriverà.
 *
 * `OFFERED` esiste nello schema ma non viene mai scritto: dice la stessa cosa
 * di `NOTIFIED` e due stati con lo stesso significato si sfasano al primo
 * `if` dimenticato. È accettato solo come punto di partenza, per non
 * bloccare eventuali righe scritte a mano.
 */
const TRANSITIONS: Record<WaitlistStatus, readonly WaitlistStatus[]> = {
  WAITING: ["NOTIFIED", "SEATED", "LEFT", "CANCELLED"],
  // NOTIFIED -> NOTIFIED è deliberato: richiamare qualcuno è un gesto normale
  // in sala, e rinnova la tenuta del tavolo. È l'unica auto-transizione
  // ammessa: senza questo elenco, "accomoda" due volte creerebbe due
  // prenotazioni per la stessa persona.
  NOTIFIED: ["NOTIFIED", "CONFIRMED", "DECLINED", "EXPIRED", "SEATED", "LEFT", "CANCELLED"],
  OFFERED: ["CONFIRMED", "DECLINED", "EXPIRED", "SEATED", "LEFT", "CANCELLED"],
  CONFIRMED: ["SEATED", "NO_SHOW", "LEFT", "CANCELLED"],
  SEATED: [],
  CANCELLED: [],
  LEFT: [],
  EXPIRED: [],
  DECLINED: [],
  NO_SHOW: [],
};

export class WaitlistError extends Error {
  constructor(
    readonly code: "not_found" | "invalid_transition" | "already_closed" | "no_table",
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "WaitlistError";
  }
}

export function canTransition(from: WaitlistStatus, to: WaitlistStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function assertTransition(from: WaitlistStatus, to: WaitlistStatus) {
  if (!canTransition(from, to)) {
    const chiuso = (CLOSED_WAITLIST_STATUSES as readonly string[]).includes(from);
    throw new WaitlistError(
      chiuso ? "already_closed" : "invalid_transition",
      chiuso
        ? "Questa persona è già uscita dalla lista d'attesa."
        : `Non si può passare da ${from} a ${to}.`,
      { from, to },
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Ingresso                                                                  */
/* -------------------------------------------------------------------------- */

export const WaitlistInput = z.object({
  guestId: z.string().optional().nullable(),
  guestName: z.string().min(1, "Serve almeno il nome."),
  phone: z.string().optional().nullable(),
  email: z.string().email("L'indirizzo email non sembra valido.").optional().nullable().or(z.literal("")),
  partySize: z.coerce.number().int().min(1).max(50),
  /** Nullo = "il prima possibile". */
  desiredAt: z.coerce.date().optional().nullable(),
  flexibilityMin: z.coerce.number().int().min(0).max(240).default(0),
  expectedWaitMin: z.coerce.number().int().min(0).max(480).default(20),
  preferredRoomId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type WaitlistInputType = z.infer<typeof WaitlistInput>;

const WITH_RELATIONS = {
  guest: { select: { id: true, firstName: true, lastName: true, loyaltyTier: true, totalVisits: true, allergies: true } },
  preferredRoom: { select: { id: true, name: true } },
} satisfies Prisma.WaitlistEntryInclude;

export type WaitlistEntryWithRelations = Prisma.WaitlistEntryGetPayload<{ include: typeof WITH_RELATIONS }>;

export async function addToWaitlist(venueId: string, raw: unknown, actor?: AuditActor) {
  const data = WaitlistInput.parse(raw);

  // In coda dopo l'ultimo: chi arriva prima sta prima.
  const ultimo = await db.waitlistEntry.findFirst({
    where: { venueId, status: { in: [...ACTIVE_WAITLIST_STATUSES] } },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await db.waitlistEntry.create({
    data: {
      venueId,
      guestId: data.guestId || null,
      guestName: data.guestName.trim(),
      phone: data.phone || null,
      email: data.email || null,
      partySize: data.partySize,
      desiredAt: data.desiredAt ?? null,
      flexibilityMin: data.flexibilityMin,
      expectedWaitMin: data.expectedWaitMin,
      preferredRoomId: data.preferredRoomId || null,
      notes: data.notes || null,
      position: (ultimo?.position ?? 0) + 1,
    },
    include: WITH_RELATIONS,
  });

  await recordAudit(actor, "waitlist.add", "waitlist_entry", created.id, {
    ospite: created.guestName,
    persone: created.partySize,
    attesaStimata: created.expectedWaitMin,
  });

  return created;
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export type WaitlistView = WaitlistEntryWithRelations & {
  /** Minuti trascorsi da quando è entrato in lista. */
  waitingMin: number;
  /** Vero quando ha aspettato più della stima: è il momento di dire qualcosa. */
  overdue: boolean;
  /** L'offerta è scaduta ma nessuno l'ha ancora chiusa. */
  offerExpired: boolean;
  isVip: boolean;
};

function decorate(entry: WaitlistEntryWithRelations, now: Date): WaitlistView {
  const waitingMin = Math.max(0, Math.round((now.getTime() - entry.createdAt.getTime()) / 60_000));
  return {
    ...entry,
    waitingMin,
    overdue: entry.status === "WAITING" && waitingMin > entry.expectedWaitMin,
    offerExpired:
      entry.status === "NOTIFIED" && !!entry.offerExpiresAt && entry.offerExpiresAt.getTime() < now.getTime(),
    isVip: entry.guest?.loyaltyTier === "VIP" || entry.guest?.loyaltyTier === "AMBASSADOR",
  };
}

/** La coda viva, in ordine di arrivo. */
export async function listWaitlist(venueId: string, opts: { now?: Date } = {}): Promise<WaitlistView[]> {
  const now = opts.now ?? new Date();
  const entries = await db.waitlistEntry.findMany({
    where: { venueId, status: { in: [...ACTIVE_WAITLIST_STATUSES] } },
    include: WITH_RELATIONS,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return entries.map((e) => decorate(e, now));
}

/** Le uscite di oggi: serve a chi vuole capire com'è andata la serata. */
export async function listWaitlistClosedToday(venueId: string, from: Date, to: Date) {
  return db.waitlistEntry.findMany({
    where: {
      venueId,
      status: { in: [...CLOSED_WAITLIST_STATUSES] },
      updatedAt: { gte: from, lte: to },
    },
    include: WITH_RELATIONS,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

async function requireEntry(venueId: string, id: string) {
  const entry = await db.waitlistEntry.findFirst({ where: { id, venueId }, include: WITH_RELATIONS });
  if (!entry) throw new WaitlistError("not_found", "Questa persona non è più in lista d'attesa.");
  return entry;
}

/* -------------------------------------------------------------------------- */
/*  Tavoli compatibili                                                        */
/* -------------------------------------------------------------------------- */

export type TableSearchResult = {
  tables: TableMatch[];
  /** Perché non c'è niente da proporre. `null` quando ci sono tavoli. */
  reason: "venue_closed" | "shift_full" | "all_busy" | null;
};

export type TableMatch = {
  tableId: string;
  label: string;
  seats: number;
  roomId: string | null;
  roomName: string | null;
  /** Vero se è la sala che l'ospite ha chiesto. */
  matchesPreference: boolean;
};

/**
 * Quali tavoli possono accogliere questa persona **adesso**.
 *
 * Non riscrive le regole: chiede al motore di disponibilità, tavolo per
 * tavolo. Costa una query in più per tavolo, ma è l'unico modo di non avere
 * due verità su cosa sia libero — e i tavoli di un ristorante sono decine,
 * non migliaia.
 */
export async function findTablesForEntry(
  venueId: string,
  entryId: string,
  opts: { now?: Date; durationMin?: number } = {},
): Promise<TableSearchResult> {
  const entry = await requireEntry(venueId, entryId);
  const now = opts.now ?? new Date();
  const durationMin = opts.durationMin ?? DEFAULT_DURATION_MIN;

  // Se ha chiesto un orario futuro si prova quello, altrimenti adesso.
  const startsAt = entry.desiredAt && entry.desiredAt.getTime() > now.getTime() ? entry.desiredAt : now;

  const tables = await db.table.findMany({
    where: { venueId, active: true, seats: { gte: entry.partySize } },
    select: { id: true, label: true, seats: true, roomId: true, room: { select: { name: true } } },
    orderBy: { seats: "asc" },
  });

  const matches: TableMatch[] = [];
  let venueClosed = false;
  let shiftFull = false;

  for (const table of tables) {
    const result = await checkAvailability(venueId, {
      startsAt,
      durationMin,
      partySize: entry.partySize,
      tableId: table.id,
    });
    if (!result.available) {
      // Questi due motivi non dipendono dal tavolo: valgono per tutti, e sono
      // la differenza fra "riprova fra poco" e "siamo chiusi".
      if (result.issues.some((i) => i.code === "VENUE_CLOSED")) venueClosed = true;
      if (result.issues.some((i) => i.code === "SHIFT_FULL")) shiftFull = true;
      continue;
    }
    matches.push({
      tableId: table.id,
      label: table.label,
      seats: table.seats,
      roomId: table.roomId,
      roomName: table.room?.name ?? null,
      matchesPreference: !!entry.preferredRoomId && table.roomId === entry.preferredRoomId,
    });
  }

  // Prima la sala richiesta, poi il tavolo più piccolo che basta: tenere un
  // sei posti per due persone è il modo più rapido di riempire la sala e non
  // avere più posti per il gruppo che arriva dopo.
  matches.sort((a, b) => {
    if (a.matchesPreference !== b.matchesPreference) return a.matchesPreference ? -1 : 1;
    return a.seats - b.seats;
  });

  const reason: TableSearchResult["reason"] =
    matches.length > 0 ? null : venueClosed ? "venue_closed" : shiftFull ? "shift_full" : "all_busy";

  return { tables: matches, reason };
}

/**
 * Il verso opposto: si è liberato un tavolo, **chi ci sta?**
 *
 * È la domanda che si fa un maître quando un tavolo si alza, e la ragione per
 * cui una lista d'attesa vale più di un foglio di carta.
 */
export async function suggestEntriesForTable(
  venueId: string,
  tableId: string,
  opts: { now?: Date; durationMin?: number } = {},
): Promise<WaitlistView[]> {
  const now = opts.now ?? new Date();
  const durationMin = opts.durationMin ?? DEFAULT_DURATION_MIN;

  const table = await db.table.findFirst({
    where: { id: tableId, venueId, active: true },
    select: { id: true, seats: true, roomId: true },
  });
  if (!table) throw new WaitlistError("no_table", "Questo tavolo non esiste più.");

  const coda = await listWaitlist(venueId, { now });
  const compatibili = coda.filter((e) => e.partySize <= table.seats);
  if (compatibili.length === 0) return [];

  // Una verifica per candidato, non una sola con il gruppo più numeroso: la
  // capienza residua del turno dipende dai coperti, quindi un tavolo può
  // reggere due persone e non cinque. Le persone in coda sono una decina, non
  // migliaia: la precisione costa poco e una proposta sbagliata costa un giro
  // a vuoto in sala.
  const proponibili: WaitlistView[] = [];
  for (const entry of compatibili) {
    const esito = await checkAvailability(venueId, {
      startsAt: now,
      durationMin,
      partySize: entry.partySize,
      tableId: table.id,
    });
    if (esito.available) proponibili.push(entry);
  }

  return proponibili.sort((a, b) => {
    // A parità di coda, chi ha chiesto questa sala e chi aspetta da più tempo.
    const prefA = a.preferredRoomId === table.roomId ? 0 : 1;
    const prefB = b.preferredRoomId === table.roomId ? 0 : 1;
    if (prefA !== prefB) return prefA - prefB;
    return a.position - b.position;
  });
}

/* -------------------------------------------------------------------------- */
/*  Azioni                                                                    */
/* -------------------------------------------------------------------------- */

/** Durata dell'offerta: oltre, il tavolo torna disponibile per gli altri. */
export const OFFER_TTL_MIN = 10;

/**
 * «Il tavolo è pronto». Genera un token per il link di conferma e mette una
 * scadenza: senza scadenza un tavolo resta bloccato da qualcuno che non
 * risponde, che è il modo più silenzioso di perdere coperti.
 *
 * L'invio del messaggio non è qui: questo modulo registra l'offerta, il canale
 * la recapita.
 */
export async function notifyWaitlistEntry(
  venueId: string,
  id: string,
  opts: { via?: string; ttlMin?: number; now?: Date } = {},
  actor?: AuditActor,
) {
  const entry = await requireEntry(venueId, id);
  assertTransition(entry.status, "NOTIFIED");

  const now = opts.now ?? new Date();
  const updated = await db.waitlistEntry.update({
    where: { id },
    data: {
      status: "NOTIFIED",
      notifiedAt: now,
      offerToken: randomBytes(24).toString("base64url"),
      offerExpiresAt: new Date(now.getTime() + (opts.ttlMin ?? OFFER_TTL_MIN) * 60_000),
      offerSentVia: (opts.via ?? "manuale").slice(0, 20),
    },
    include: WITH_RELATIONS,
  });

  await recordAudit(actor, "waitlist.notify", "waitlist_entry", id, {
    ospite: updated.guestName,
    canale: updated.offerSentVia,
    scadeAlle: updated.offerExpiresAt?.toISOString() ?? null,
  });

  return updated;
}

/** L'ospite conferma che sta arrivando. */
export async function confirmWaitlistEntry(venueId: string, id: string, actor?: AuditActor) {
  const entry = await requireEntry(venueId, id);
  assertTransition(entry.status, "CONFIRMED");

  const updated = await db.waitlistEntry.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
    include: WITH_RELATIONS,
  });
  await recordAudit(actor, "waitlist.confirm", "waitlist_entry", id, { ospite: updated.guestName });
  return updated;
}

/**
 * Uscita dalla lista. Tre motivi diversi, tre stati diversi, perché a fine
 * serata «quante persone se ne sono andate perché non le abbiamo servite» è
 * una domanda diversa da «quante ne abbiamo cancellate noi».
 */
export async function closeWaitlistEntry(
  venueId: string,
  id: string,
  status: Extract<WaitlistStatus, "LEFT" | "CANCELLED" | "DECLINED" | "EXPIRED" | "NO_SHOW">,
  actor?: AuditActor,
) {
  const entry = await requireEntry(venueId, id);
  assertTransition(entry.status, status);

  const now = new Date();
  const updated = await db.waitlistEntry.update({
    where: { id },
    data: {
      status,
      cancelledAt: status === "CANCELLED" || status === "LEFT" ? now : undefined,
      declinedAt: status === "DECLINED" ? now : undefined,
      offerToken: null,
      offerExpiresAt: null,
    },
    include: WITH_RELATIONS,
  });

  await recordAudit(actor, "waitlist.close", "waitlist_entry", id, {
    ospite: updated.guestName,
    esito: status,
    attesaMinuti: Math.round((now.getTime() - entry.createdAt.getTime()) / 60_000),
  });

  return updated;
}

/** Modifica dei dati (persone, orario, note): non cambia lo stato. */
export async function updateWaitlistEntry(venueId: string, id: string, raw: unknown, actor?: AuditActor) {
  const data = WaitlistInput.partial().parse(raw);
  const entry = await requireEntry(venueId, id);
  if ((CLOSED_WAITLIST_STATUSES as readonly string[]).includes(entry.status)) {
    throw new WaitlistError("already_closed", "Questa persona è già uscita dalla lista d'attesa.");
  }

  const updated = await db.waitlistEntry.update({
    where: { id },
    data: {
      guestName: data.guestName?.trim(),
      phone: data.phone === undefined ? undefined : data.phone || null,
      email: data.email === undefined ? undefined : data.email || null,
      partySize: data.partySize,
      desiredAt: data.desiredAt === undefined ? undefined : data.desiredAt,
      flexibilityMin: data.flexibilityMin,
      expectedWaitMin: data.expectedWaitMin,
      preferredRoomId: data.preferredRoomId === undefined ? undefined : data.preferredRoomId || null,
      notes: data.notes === undefined ? undefined : data.notes || null,
    },
    include: WITH_RELATIONS,
  });

  const diff = fieldDiff(entry, updated);
  if (diff) await recordAudit(actor, "waitlist.update", "waitlist_entry", id, diff);
  return updated;
}

/**
 * Accomoda: la lista d'attesa diventa una prenotazione seduta.
 *
 * Passa da `createBooking`, quindi il controllo di disponibilità vale anche
 * qui. Se il tavolo non regge, l'errore che torna è quello del motore di
 * disponibilità, con i motivi in chiaro.
 */
export async function seatWaitlistEntry(
  venueId: string,
  id: string,
  input: { tableId: string; startsAt?: Date; durationMin?: number },
  actor?: AuditActor,
) {
  const entry = await requireEntry(venueId, id);
  assertTransition(entry.status, "SEATED");

  const now = new Date();
  const booking = await createBooking(
    venueId,
    {
      guestId: entry.guestId ?? undefined,
      guest: entry.guestId
        ? undefined
        : {
            firstName: entry.guestName.split(" ")[0] || entry.guestName,
            lastName: entry.guestName.split(" ").slice(1).join(" ") || null,
            email: entry.email,
            phone: entry.phone,
          },
      partySize: entry.partySize,
      startsAt: input.startsAt ?? now,
      durationMin: input.durationMin ?? DEFAULT_DURATION_MIN,
      tableId: input.tableId,
      source: "WALK_IN",
      notes: entry.notes,
    },
    // Chi arriva dalla lista d'attesa si siede adesso: lo stato non lo
    // decide il canale, lo sappiamo noi.
    { actor, status: "SEATED" },
  );

  const updated = await db.waitlistEntry.update({
    where: { id },
    data: {
      status: "SEATED",
      seatedAt: now,
      convertedBookingId: booking.id,
      offerToken: null,
      offerExpiresAt: null,
    },
    include: WITH_RELATIONS,
  });

  await recordAudit(actor, "waitlist.seat", "waitlist_entry", id, {
    ospite: updated.guestName,
    persone: updated.partySize,
    tavolo: input.tableId,
    prenotazione: booking.id,
    attesaMinuti: Math.round((now.getTime() - entry.createdAt.getTime()) / 60_000),
  });

  return { entry: updated, booking };
}

/**
 * Chiude le offerte scadute.
 *
 * Senza questo passaggio una lista d'attesa mente: mostra tre persone
 * «avvisate» che in realtà sono andate altrove mezz'ora fa. Viene chiamato
 * dalla lettura della coda, così la pulizia avviene guardando la lista e non
 * serve un lavoro pianificato per una cosa che riguarda i prossimi dieci
 * minuti.
 */
export async function expireStaleOffers(venueId: string, now: Date = new Date()) {
  const { count } = await db.waitlistEntry.updateMany({
    where: {
      venueId,
      status: "NOTIFIED",
      offerExpiresAt: { lt: now },
    },
    data: { status: "EXPIRED", offerToken: null, offerExpiresAt: null },
  });
  return count;
}

/** Numeri per la testa della pagina e, in futuro, per la modalità servizio. */
export async function waitlistSummary(venueId: string, now: Date = new Date()) {
  const coda = await listWaitlist(venueId, { now });
  return {
    inAttesa: coda.filter((e) => e.status === "WAITING").length,
    avvisati: coda.filter((e) => e.status === "NOTIFIED").length,
    confermati: coda.filter((e) => e.status === "CONFIRMED").length,
    personeInCoda: coda.reduce((n, e) => n + e.partySize, 0),
    attesaMediaMin: coda.length
      ? Math.round(coda.reduce((n, e) => n + e.waitingMin, 0) / coda.length)
      : 0,
    inRitardo: coda.filter((e) => e.overdue).length,
  };
}
