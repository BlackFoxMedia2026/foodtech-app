import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { contatoriDaPrenotazioni, eUnaVisita } from "@/lib/visite";

/**
 * Da anagrafica a conoscenza del cliente.
 *
 * La scheda ospite mostrava cinque numeri — visite, spesa, no-show, ultima
 * visita, punti — presi da colonne che **nessuna parte del codice aggiornava**:
 * valori messi dal seed e mai più toccati, presentati come fatti. Il primo
 * lavoro di questo modulo non è aggiungere metriche, è renderle vere.
 *
 * Tutto ciò che segue è **calcolato dalle prenotazioni**, che sono l'unico
 * posto dove sta la storia reale di un cliente. Le colonne denormalizzate
 * restano — le leggono analytics e la lista ospiti — ma ora vengono
 * ricalcolate da qui.
 *
 * Una cosa che **non** c'è, di proposito: il valore in euro. Senza ordini né
 * incassi collegati, un «lifetime value» sarebbe un numero inventato. Quando
 * il locale dichiara la spesa media per coperto (`Venue.avgSpendCents`) si
 * mostra una stima, detta stima. Vedi §10 del brief e la regola sulle feature
 * fantasma.
 */

/* -------------------------------------------------------------------------- */
/*  Soglie                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Le soglie dei tag, in un posto solo.
 *
 * Sono decisioni di prodotto, non dettagli: un ristorante di quartiere e un
 * ristorante stellato hanno idee diverse su cosa sia «abituale». Stanno qui
 * perché il giorno in cui diventano configurabili per locale, il codice non
 * cambia — cambia solo da dove arrivano.
 */
export const TAG_RULES = {
  /** Visite da cui si è «abituale». */
  regularVisits: 4,
  /** Giorni di silenzio da cui si è «a rischio». */
  atRiskDays: 60,
  /** Giorni di silenzio da cui si è «inattivo». */
  inactiveDays: 120,
  /** Quota di assenze da cui si segnala il problema (con almeno 2 assenze). */
  noShowRate: 0.25,
  /** Giorni entro cui il compleanno è «vicino». */
  birthdaySoonDays: 14,
  /** Coperti medi da cui è un cliente «da gruppi». */
  largePartyAvg: 6,
  /** Quota di visite nello stesso giorno o fascia per parlare di abitudine. */
  habitShare: 0.6,
  /** Visite minime perché un'abitudine sia un'abitudine e non un caso. */
  habitMinVisits: 3,
} as const;

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"] as const;

/* -------------------------------------------------------------------------- */
/*  Profilo calcolato                                                         */
/* -------------------------------------------------------------------------- */

export type GuestTag = {
  key: string;
  label: string;
  tone: "neutral" | "good" | "warning";
  /** Perché questo cliente ha questa etichetta: mostrato come suggerimento. */
  why: string;
};

export type GuestProfile = {
  guestId: string;
  /** Visite effettive: prenotazioni completate o sedute. */
  visits: number;
  firstVisitAt: string | null;
  lastVisitAt: string | null
  daysSinceLastVisit: number | null;
  /** Giorni medi fra una visita e la successiva. Nullo con meno di due visite. */
  avgDaysBetweenVisits: number | null;
  avgPartySize: number | null;
  /** Giorni medi fra la prenotazione e la visita: dice quanto si organizza. */
  avgLeadTimeDays: number | null;
  totalBookings: number;
  cancellations: number;
  noShows: number;
  /** L'ultima volta che non si è presentato: nulla se non è mai successo. */
  lastNoShowAt: string | null;
  cancellationRate: number;
  noShowRate: number;
  preferredWeekday: { weekday: number; label: string; share: number } | null;
  preferredTimeBand: { band: "pranzo" | "cena"; share: number } | null;
  preferredRoom: { roomId: string; name: string; share: number } | null;
  preferredTable: { tableId: string; label: string; share: number } | null;
  occasions: { occasion: string; count: number }[];
  /** Stima del valore, **solo** se il locale ha dichiarato la spesa media. */
  estimatedValue: { totalCents: number; avgPerVisitCents: number; basedOnAvgSpendCents: number } | null;
  tags: GuestTag[];
};

type BookingRow = {
  startsAt: Date;
  createdAt: Date;
  partySize: number;
  status: string;
  occasion: string | null;
  tableId: string | null;
  table: { id: string; label: string; roomId: string | null; room: { id: string; name: string } | null } | null;
};

/**
 * Giorni di calendario fra due istanti.
 *
 * Contare le ore dava «2 giorni fa» per una visita della sera del 4 settembre
 * guardata a mezzogiorno del 7 — accanto alla data «04 set» sembrava un
 * errore. Una persona conta i giorni sul calendario, e la scheda deve dire
 * quello che direbbe lei.
 */
function giorniDiCalendario(da: Date, a: Date): number {
  const inizio = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const fine = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.max(0, Math.round((fine - inizio) / 86_400_000));
}

/**
 * Il valore più frequente di una lista, con la sua quota sul totale.
 *
 * `chiave` esiste perché su oggetti la sola uguaglianza di riferimento non
 * raggruppa niente: due prenotazioni sullo stesso tavolo portano due istanze
 * diverse, e senza una chiave il «tavolo preferito» risulterebbe sempre
 * frequentato una volta sola.
 */
function moda<T>(valori: T[], chiave: (v: T) => string = (v) => String(v)): { value: T; share: number } | null {
  if (valori.length === 0) return null;
  const gruppi = new Map<string, { value: T; count: number }>();
  for (const v of valori) {
    const k = chiave(v);
    const g = gruppi.get(k);
    if (g) g.count += 1;
    else gruppi.set(k, { value: v, count: 1 });
  }
  let migliore: { value: T; count: number } | null = null;
  for (const g of gruppi.values()) {
    if (!migliore || g.count > migliore.count) migliore = g;
  }
  return migliore ? { value: migliore.value, share: migliore.count / valori.length } : null;
}

export function computeGuestProfile(
  guest: {
    id: string;
    birthday: Date | null;
    loyaltyTier: string;
    allergies: string | null;
    preferences: Prisma.JsonValue | null;
  },
  bookings: BookingRow[],
  opts: { now?: Date; avgSpendCents?: number | null } = {},
): GuestProfile {
  const now = opts.now ?? new Date();

  const visite = bookings
    .filter((b) => eUnaVisita(b.status))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const cancellate = bookings.filter((b) => b.status === "CANCELLED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW");
  const assenze = noShow.length;
  // **Quando** è successo conta quanto quante volte: due assenze di due anni
  // fa non sono lo stesso cliente di due assenze in un mese, e una percentuale
  // da sola non distingue i due casi.
  const ultimaAssenza = noShow.reduce<Date | null>(
    (piuRecente, b) => (!piuRecente || b.startsAt > piuRecente ? b.startsAt : piuRecente),
    null,
  );

  const prima = visite[0]?.startsAt ?? null;
  const ultima = visite.at(-1)?.startsAt ?? null;

  const giorniDaUltima = ultima ? giorniDiCalendario(ultima, now) : null;

  let mediaFra: number | null = null;
  if (visite.length >= 2) {
    const spazi: number[] = [];
    for (let i = 1; i < visite.length; i++) {
      spazi.push((visite[i].startsAt.getTime() - visite[i - 1].startsAt.getTime()) / 86_400_000);
    }
    mediaFra = Math.round(spazi.reduce((a, b) => a + b, 0) / spazi.length);
  }

  const mediaCoperti = visite.length
    ? Math.round((visite.reduce((n, b) => n + b.partySize, 0) / visite.length) * 10) / 10
    : null;

  // Quanto in anticipo prenota: si misura su tutte le prenotazioni, non solo
  // sulle visite — anche una disdetta dice come si organizza.
  const anticipi = bookings
    .map((b) => (b.startsAt.getTime() - b.createdAt.getTime()) / 86_400_000)
    .filter((d) => d >= 0);
  const mediaAnticipo = anticipi.length
    ? Math.round((anticipi.reduce((a, b) => a + b, 0) / anticipi.length) * 10) / 10
    : null;

  const giornoPreferito = moda(visite.map((b) => b.startsAt.getDay()));
  const fasciaPreferita = moda(visite.map((b) => (b.startsAt.getHours() < 17 ? "pranzo" : "cena")));
  const salaPreferita = moda(
    visite.map((b) => b.table?.room).filter((r): r is { id: string; name: string } => !!r),
    (r) => r.id,
  );
  const tavoloPreferito = moda(
    visite.map((b) => b.table).filter((t): t is NonNullable<BookingRow["table"]> => !!t),
    (t) => t.id,
  );

  const occasioni = new Map<string, number>();
  for (const b of bookings) {
    if (b.occasion) occasioni.set(b.occasion, (occasioni.get(b.occasion) ?? 0) + 1);
  }

  const profile: GuestProfile = {
    guestId: guest.id,
    visits: visite.length,
    firstVisitAt: prima?.toISOString() ?? null,
    lastVisitAt: ultima?.toISOString() ?? null,
    daysSinceLastVisit: giorniDaUltima,
    avgDaysBetweenVisits: mediaFra,
    avgPartySize: mediaCoperti,
    avgLeadTimeDays: mediaAnticipo,
    totalBookings: bookings.length,
    cancellations: cancellate,
    noShows: assenze,
    lastNoShowAt: ultimaAssenza?.toISOString() ?? null,
    cancellationRate: bookings.length ? cancellate / bookings.length : 0,
    noShowRate: bookings.length ? assenze / bookings.length : 0,
    preferredWeekday:
      giornoPreferito && visite.length >= TAG_RULES.habitMinVisits
        ? { weekday: giornoPreferito.value, label: GIORNI[giornoPreferito.value], share: giornoPreferito.share }
        : null,
    preferredTimeBand:
      fasciaPreferita && visite.length >= TAG_RULES.habitMinVisits
        ? { band: fasciaPreferita.value as "pranzo" | "cena", share: fasciaPreferita.share }
        : null,
    preferredRoom:
      salaPreferita && visite.length >= TAG_RULES.habitMinVisits
        ? { roomId: salaPreferita.value.id, name: salaPreferita.value.name, share: salaPreferita.share }
        : null,
    preferredTable:
      tavoloPreferito && visite.length >= TAG_RULES.habitMinVisits
        ? { tableId: tavoloPreferito.value.id, label: tavoloPreferito.value.label, share: tavoloPreferito.share }
        : null,
    occasions: [...occasioni.entries()]
      .map(([occasion, count]) => ({ occasion, count }))
      .sort((a, b) => b.count - a.count),
    // Una stima, e detta stima: senza ordini né incassi il valore reale non
    // esiste, e inventarlo sarebbe peggio che non mostrarlo.
    estimatedValue:
      opts.avgSpendCents && visite.length > 0
        ? {
            totalCents: Math.round(
              opts.avgSpendCents * visite.reduce((n, b) => n + b.partySize, 0),
            ),
            avgPerVisitCents: Math.round(opts.avgSpendCents * (mediaCoperti ?? 0)),
            basedOnAvgSpendCents: opts.avgSpendCents,
          }
        : null,
    tags: [],
  };

  profile.tags = computeGuestTags(guest, profile, now);
  return profile;
}

/* -------------------------------------------------------------------------- */
/*  Tag automatici                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Le etichette che si deducono dai fatti.
 *
 * Ognuna porta con sé il **perché**: un'etichetta senza motivo è un'opinione
 * del software, e chi lavora in sala ha il diritto di non essere d'accordo.
 */
export function computeGuestTags(
  guest: { birthday: Date | null; loyaltyTier: string; allergies: string | null },
  p: GuestProfile,
  now: Date = new Date(),
): GuestTag[] {
  const tags: GuestTag[] = [];

  if (guest.loyaltyTier === "VIP" || guest.loyaltyTier === "AMBASSADOR") {
    tags.push({
      key: "vip",
      label: "VIP",
      tone: "good",
      why: `Livello ${guest.loyaltyTier === "AMBASSADOR" ? "ambassador" : "VIP"} assegnato dal locale.`,
    });
  }

  if (p.visits === 0) {
    tags.push({ key: "nuovo", label: "Nuovo", tone: "neutral", why: "Non è ancora venuto." });
  } else if (p.visits === 1) {
    tags.push({ key: "prima_volta", label: "Prima visita", tone: "neutral", why: "È venuto una volta sola." });
  } else if (p.visits >= TAG_RULES.regularVisits) {
    tags.push({
      key: "abituale",
      label: "Abituale",
      tone: "good",
      why: `${p.visits} visite${p.avgDaysBetweenVisits ? `, in media una ogni ${p.avgDaysBetweenVisits} giorni` : ""}.`,
    });
  }

  if (p.daysSinceLastVisit != null && p.visits > 0) {
    if (p.daysSinceLastVisit >= TAG_RULES.inactiveDays) {
      tags.push({
        key: "inattivo",
        label: "Inattivo",
        tone: "warning",
        why: `Non viene da ${p.daysSinceLastVisit} giorni.`,
      });
    } else if (
      p.daysSinceLastVisit >= TAG_RULES.atRiskDays &&
      p.visits >= TAG_RULES.regularVisits
    ) {
      // Era abituale e ha smesso: è il momento in cui un richiamo serve
      // ancora a qualcosa.
      tags.push({
        key: "a_rischio",
        label: "A rischio",
        tone: "warning",
        why: `Era abituale (${p.visits} visite) e non viene da ${p.daysSinceLastVisit} giorni.`,
      });
    }
  }

  if (p.noShows >= 2 && p.noShowRate >= TAG_RULES.noShowRate) {
    tags.push({
      key: "assenze",
      label: "Assenze ripetute",
      tone: "warning",
      why: `${p.noShows} assenze su ${p.totalBookings} prenotazioni (${Math.round(p.noShowRate * 100)}%).`,
    });
  }

  if (guest.birthday) {
    const compleanno = new Date(now.getFullYear(), guest.birthday.getMonth(), guest.birthday.getDate());
    if (compleanno < now) compleanno.setFullYear(now.getFullYear() + 1);
    const giorni = Math.ceil((compleanno.getTime() - now.getTime()) / 86_400_000);
    if (giorni <= TAG_RULES.birthdaySoonDays) {
      tags.push({
        key: "compleanno",
        label: giorni === 0 ? "Compleanno oggi" : `Compleanno fra ${giorni} giorni`,
        tone: "good",
        why: "Data di nascita in scheda.",
      });
    }
  }

  if (p.avgPartySize != null && p.avgPartySize >= TAG_RULES.largePartyAvg) {
    tags.push({
      key: "gruppi",
      label: "Viene in gruppo",
      tone: "neutral",
      why: `In media ${p.avgPartySize} coperti per visita.`,
    });
  }

  if (p.preferredWeekday && p.preferredWeekday.share >= TAG_RULES.habitShare) {
    tags.push({
      key: `giorno_${p.preferredWeekday.weekday}`,
      label: `Abitué del ${p.preferredWeekday.label}`,
      tone: "neutral",
      why: `${Math.round(p.preferredWeekday.share * 100)}% delle visite di ${p.preferredWeekday.label}.`,
    });
  }

  if (p.preferredRoom && p.preferredRoom.share >= TAG_RULES.habitShare) {
    tags.push({
      key: `sala_${p.preferredRoom.roomId}`,
      label: `Affezionato a ${p.preferredRoom.name}`,
      tone: "neutral",
      why: `${Math.round(p.preferredRoom.share * 100)}% delle visite in ${p.preferredRoom.name}.`,
    });
  }

  if (guest.allergies) {
    tags.push({
      key: "allergie",
      label: "Allergie",
      tone: "warning",
      why: guest.allergies,
    });
  }

  return tags;
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export async function getGuestProfile(
  venueId: string,
  guestId: string,
  opts: { now?: Date } = {},
): Promise<GuestProfile | null> {
  const [guest, venue] = await Promise.all([
    db.guest.findFirst({
      where: { id: guestId, venueId },
      select: { id: true, birthday: true, loyaltyTier: true, allergies: true, preferences: true },
    }),
    db.venue.findUnique({ where: { id: venueId }, select: { avgSpendCents: true } }),
  ]);
  if (!guest) return null;

  const bookings = await db.booking.findMany({
    where: { guestId, venueId, deletedAt: null },
    select: {
      startsAt: true,
      createdAt: true,
      partySize: true,
      status: true,
      occasion: true,
      tableId: true,
      table: { select: { id: true, label: true, roomId: true, room: { select: { id: true, name: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  return computeGuestProfile(guest, bookings, {
    now: opts.now,
    avgSpendCents: venue?.avgSpendCents ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/*  Colonne denormalizzate: da finzione a verità                              */
/* -------------------------------------------------------------------------- */

/**
 * Riallinea i contatori sulla scheda ospite ai fatti.
 *
 * `totalVisits`, `noShowCount` e `lastVisitAt` esistono da sempre e **nessuno
 * li scriveva**: erano valori del seed mostrati come dati. Li leggono la lista
 * ospiti e le analisi, quindi non si possono semplicemente ignorare: vanno
 * resi veri.
 *
 * Viene chiamata quando una prenotazione cambia stato in modo che conta —
 * completata, assente, annullata — perché sono i tre momenti in cui la storia
 * di un cliente cambia davvero.
 *
 * `totalSpend` resta fuori di proposito: senza incassi collegati, scriverci un
 * numero sarebbe inventarlo.
 */
export async function refreshGuestStats(guestId: string): Promise<void> {
  const bookings = await db.booking.findMany({
    where: { guestId, deletedAt: null },
    select: { startsAt: true, status: true },
  });

  const { visite, assenze, ultimaVisita } = contatoriDaPrenotazioni(bookings);

  await db.guest.update({
    where: { id: guestId },
    data: { totalVisits: visite, noShowCount: assenze, lastVisitAt: ultimaVisita },
  });
}

/* -------------------------------------------------------------------------- */
/*  Storia dell'ospite                                                        */
/* -------------------------------------------------------------------------- */

export type GuestEvent = {
  at: string;
  kind:
    | "booking_created"
    | "visit"
    | "no_show"
    | "cancelled"
    | "waitlist"
    | "message";
  title: string;
  detail: string | null;
  /** Dove andare per vedere il fatto per intero. */
  href?: string;
};

/**
 * La storia di un cliente, con **solo gli eventi che esistono davvero**.
 *
 * Il brief chiede una timeline che va da prenotazione a ordine a pagamento a
 * recensione. Ordini, pagamenti e recensioni non sono implementati: metterli
 * qui come righe vuote — o peggio, riempirle di dati plausibili — sarebbe
 * l'esatto contrario di quello che serve a chi legge la scheda prima di
 * accogliere qualcuno.
 *
 * Quindi: prenotazioni fatte, visite, assenze, disdette, attese in lista,
 * messaggi mandati, e le risposte dell'ospite dai link dei promemoria. Quando
 * ordini e pagamenti arriveranno, si aggiungeranno qui.
 */
export async function getGuestTimeline(
  venueId: string,
  guestId: string,
  opts: { limit?: number } = {},
): Promise<GuestEvent[]> {
  const [bookings, messaggi, attese] = await Promise.all([
    db.booking.findMany({
      where: { guestId, venueId, deletedAt: null },
      select: {
        id: true,
        startsAt: true,
        createdAt: true,
        partySize: true,
        status: true,
        occasion: true,
        source: true,
        table: { select: { label: true } },
      },
      orderBy: { startsAt: "desc" },
      take: 40,
    }),
    db.messageLog.findMany({
      where: { guestId, venueId },
      select: { id: true, kind: true, channel: true, status: true, createdAt: true, subject: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.waitlistEntry.findMany({
      where: { guestId, venueId },
      select: { id: true, createdAt: true, partySize: true, status: true, seatedAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const eventi: GuestEvent[] = [];
  const fmt = (n: number) => `${n} ${n === 1 ? "persona" : "persone"}`;

  for (const b of bookings) {
    const dove = b.table ? ` · tavolo ${b.table.label}` : "";

    if (b.status === "COMPLETED" || b.status === "SEATED") {
      eventi.push({
        at: b.startsAt.toISOString(),
        kind: "visit",
        title: "Visita",
        detail: `${fmt(b.partySize)}${dove}${b.occasion ? ` · ${b.occasion.toLowerCase()}` : ""}`,
        href: `/bookings/${b.id}`,
      });
    } else if (b.status === "NO_SHOW") {
      eventi.push({
        at: b.startsAt.toISOString(),
        kind: "no_show",
        title: "Non si è presentato",
        detail: `${fmt(b.partySize)}${dove}`,
        href: `/bookings/${b.id}`,
      });
    } else if (b.status === "CANCELLED") {
      eventi.push({
        at: b.startsAt.toISOString(),
        kind: "cancelled",
        title: "Prenotazione annullata",
        detail: fmt(b.partySize),
        href: `/bookings/${b.id}`,
      });
    } else {
      eventi.push({
        at: b.startsAt.toISOString(),
        kind: "booking_created",
        title: "Prenotazione",
        detail: `${fmt(b.partySize)}${dove} · da ${b.source.toLowerCase()}`,
        href: `/bookings/${b.id}`,
      });
    }
  }

  for (const m of messaggi) {
    eventi.push({
      at: m.createdAt.toISOString(),
      kind: "message",
      title: m.kind?.startsWith("booking.reminder") ? "Promemoria inviato" : "Messaggio inviato",
      detail: `${m.channel.toLowerCase()}${m.subject ? ` · ${m.subject}` : ""}${
        m.status === "FAILED" ? " · non recapitato" : ""
      }`,
    });
  }

  for (const w of attese) {
    eventi.push({
      at: w.createdAt.toISOString(),
      kind: "waitlist",
      title: w.status === "SEATED" ? "In attesa, poi accomodato" : "Messo in lista d'attesa",
      detail: fmt(w.partySize),
      href: "/waitlist",
    });
  }

  return eventi
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, opts.limit ?? 30);
}
