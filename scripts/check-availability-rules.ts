/**
 * Verifica delle regole di disponibilità (`src/server/availability.ts`).
 *
 * Il repo non ha ancora un test runner: questo script esercita la parte pura del
 * motore senza toccare il database, così le regole restano verificabili.
 * Si esegue con `npx tsx scripts/check-availability-rules.ts`.
 */

import {
  evaluateAvailability,
  overlaps,
  zonedDayAndMinute,
  zonedTimeToInstant,
  zonedCalendarDate,
  findShiftFor,
  buildDaySlots,
  type AvailabilityContext,
  type ShiftLike,
} from "../src/server/availability";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
  } else {
    failures.push(detail ? `${name}\n    ${detail}` : name);
  }
}

const ROME = "Europe/Rome";

// Domenica 2 agosto 2026, ore 20:00 a Roma (18:00 UTC in ora estiva).
const SUNDAY_20 = new Date("2026-08-02T18:00:00.000Z");

const dinner: ShiftLike = {
  id: "s-dinner",
  name: "Cena",
  weekday: 0, // domenica, come Date.getDay()
  startMinute: 19 * 60,
  endMinute: 23 * 60,
  capacity: 90,
  active: true,
  slotMinutes: 15,
};

const lunch: ShiftLike = { ...dinner, id: "s-lunch", name: "Pranzo", startMinute: 12 * 60, endMinute: 15 * 60, capacity: 60 };

const table4: AvailabilityContext["table"] = { id: "t4", label: "12", seats: 4, active: true };

function ctx(over: Partial<AvailabilityContext> = {}): AvailabilityContext {
  return {
    timezone: ROME,
    shifts: [lunch, dinner],
    bookings: [],
    table: null,
    blocks: [],
    ...over,
  };
}

function booking(over: Partial<AvailabilityContext["bookings"][number]> = {}) {
  return {
    id: "b1",
    startsAt: SUNDAY_20,
    durationMin: 105,
    partySize: 2,
    tableId: null as string | null,
    combinedTableIds: [] as string[],
    ...over,
  };
}

const base = { startsAt: SUNDAY_20, durationMin: 105, partySize: 2 };

/* ---------------------------------- unità --------------------------------- */

check("sovrapposizione riconosciuta", overlaps(SUNDAY_20, 105, new Date(SUNDAY_20.getTime() + 60 * 60_000), 105));

check(
  "prenotazioni consecutive non si sovrappongono",
  !overlaps(SUNDAY_20, 105, new Date(SUNDAY_20.getTime() + 105 * 60_000), 105),
);

const zoned = zonedDayAndMinute(SUNDAY_20, ROME);
check(
  "fuso del locale: 18:00 UTC letto come domenica 20:00 a Roma",
  zoned.weekday === 0 && zoned.minuteOfDay === 20 * 60,
  `ottenuto weekday=${zoned.weekday} minuti=${zoned.minuteOfDay}`,
);

check("il turno cena copre le 20:00", findShiftFor([lunch, dinner], 0, 20 * 60)?.id === "s-dinner");
check("alle 17:00 nessun turno è aperto", findShiftFor([lunch, dinner], 0, 17 * 60) === null);

const wide: ShiftLike = { ...dinner, id: "s-wide", capacity: 200 };
const narrow: ShiftLike = { ...dinner, id: "s-narrow", capacity: 40 };
check(
  "fra turni sovrapposti vince la capienza minore",
  findShiftFor([wide, narrow], 0, 20 * 60)?.id === "s-narrow",
);

/* --------------------------------- apertura -------------------------------- */

check("orario dentro il turno: accettata", evaluateAvailability(base, ctx()).available);

const closed = evaluateAvailability({ ...base, startsAt: new Date("2026-08-02T15:00:00.000Z") }, ctx()); // 17:00 a Roma
check("orario fuori turno: rifiutata", !closed.available && closed.issues[0].code === "VENUE_CLOSED");

check(
  "locale senza turni configurati: nessun vincolo di orario",
  evaluateAvailability({ ...base, startsAt: new Date("2026-08-02T01:00:00.000Z") }, ctx({ shifts: [] })).available,
);

check(
  "turni configurati solo in altri giorni: chiuso",
  !evaluateAvailability(base, ctx({ shifts: [{ ...dinner, weekday: 3 }] })).available,
);

/* --------------------------------- capienza -------------------------------- */

const nearlyFull = Array.from({ length: 11 }, (_, i) => booking({ id: `b${i}`, partySize: 8 })); // 88 coperti

check(
  "sotto la capienza: accettata",
  evaluateAvailability(base, ctx({ bookings: nearlyFull })).available,
  "88 + 2 = 90, esattamente la capienza",
);

const overCapacity = evaluateAvailability({ ...base, partySize: 3 }, ctx({ bookings: nearlyFull }));
check(
  "oltre la capienza: rifiutata",
  !overCapacity.available && overCapacity.issues.some((i) => i.code === "SHIFT_FULL"),
  "88 + 3 supera 90",
);

check(
  "il messaggio dice quanti coperti restano",
  overCapacity.issues.some((i) => i.message.includes("2 coperti")),
  overCapacity.issues.map((i) => i.message).join(" | "),
);

check(
  "prenotazioni in un altro orario non consumano capienza",
  evaluateAvailability(
    { ...base, partySize: 20 },
    ctx({ bookings: nearlyFull.map((b) => ({ ...b, startsAt: new Date("2026-08-02T20:30:00.000Z") })) }),
  ).available,
  "quelle prenotazioni iniziano dopo la fine di questa",
);

/* ---------------------------------- tavolo --------------------------------- */

check(
  "tavolo libero e capiente: accettata",
  evaluateAvailability({ ...base, tableId: "t4" }, ctx({ table: table4 })).available,
);

const busy = evaluateAvailability(
  { ...base, tableId: "t4" },
  ctx({ table: table4, bookings: [booking({ tableId: "t4" })] }),
);
check("tavolo già occupato: rifiutata", !busy.available && busy.issues.some((i) => i.code === "TABLE_BUSY"));

const combined = evaluateAvailability(
  { ...base, tableId: "t4" },
  ctx({ table: table4, bookings: [booking({ tableId: "t9", combinedTableIds: ["t4"] })] }),
);
check(
  "tavolo impegnato dentro una combinazione: rifiutata",
  !combined.available && combined.issues.some((i) => i.code === "TABLE_BUSY"),
);

const tooSmall = evaluateAvailability({ ...base, partySize: 6, tableId: "t4" }, ctx({ table: table4 }));
check(
  "tavolo troppo piccolo: rifiutata",
  !tooSmall.available && tooSmall.issues.some((i) => i.code === "TABLE_TOO_SMALL"),
);

const inactive = evaluateAvailability(
  { ...base, tableId: "t4" },
  ctx({ table: { ...table4, active: false } }),
);
check("tavolo non in servizio: rifiutata", !inactive.available && inactive.issues.some((i) => i.code === "TABLE_INACTIVE"));

const blocked = evaluateAvailability(
  { ...base, tableId: "t4" },
  ctx({
    table: table4,
    blocks: [{ tableId: "t4", startsAt: new Date("2026-08-02T17:00:00.000Z"), endsAt: new Date("2026-08-02T21:00:00.000Z") }],
  }),
);
check("tavolo fuori servizio: rifiutata", !blocked.available && blocked.issues.some((i) => i.code === "TABLE_BLOCKED"));

check(
  "fuori servizio in un altro orario: irrilevante",
  evaluateAvailability(
    { ...base, tableId: "t4" },
    ctx({
      table: table4,
      blocks: [{ tableId: "t4", startsAt: new Date("2026-08-02T08:00:00.000Z"), endsAt: new Date("2026-08-02T10:00:00.000Z") }],
    }),
  ).available,
);

const missing = evaluateAvailability({ ...base, tableId: "t404" }, ctx({ table: null }));
check("tavolo inesistente: rifiutata", !missing.available && missing.issues.some((i) => i.code === "TABLE_NOT_FOUND"));

/* -------------------------------- spostamenti ------------------------------ */

check(
  "una prenotazione non si scontra con se stessa",
  evaluateAvailability(
    { ...base, tableId: "t4", excludeBookingId: "b-self" },
    ctx({ table: table4, bookings: [booking({ id: "b-self", tableId: "t4" })] }),
  ).available,
);

/* --------------------------- motivi cumulativi ----------------------------- */

const multi = evaluateAvailability(
  { ...base, partySize: 6, tableId: "t4", startsAt: new Date("2026-08-02T15:00:00.000Z") },
  ctx({ table: table4 }),
);
check(
  "più motivi di rifiuto vengono riportati insieme",
  multi.issues.length >= 2,
  multi.issues.map((i) => i.code).join(", "),
);

/* ------------------------- orario del locale → istante --------------------- */

check(
  "20:00 del 3 agosto a Roma corrisponde alle 18:00 UTC (ora estiva)",
  zonedTimeToInstant({ year: 2026, month: 8, day: 3 }, 20 * 60, ROME).toISOString() ===
    "2026-08-03T18:00:00.000Z",
  zonedTimeToInstant({ year: 2026, month: 8, day: 3 }, 20 * 60, ROME).toISOString(),
);

check(
  "20:00 del 3 gennaio a Roma corrisponde alle 19:00 UTC (ora solare)",
  zonedTimeToInstant({ year: 2026, month: 1, day: 3 }, 20 * 60, ROME).toISOString() ===
    "2026-01-03T19:00:00.000Z",
  zonedTimeToInstant({ year: 2026, month: 1, day: 3 }, 20 * 60, ROME).toISOString(),
);

// L'ora legale 2026 in Europa inizia domenica 29 marzo: alle 02:00 locali le lancette
// vanno alle 03:00, quindi le 02:30 non esistono.
check(
  "notte del cambio d'ora: le 12:00 restano corrette",
  zonedTimeToInstant({ year: 2026, month: 3, day: 29 }, 12 * 60, ROME).toISOString() ===
    "2026-03-29T10:00:00.000Z",
  zonedTimeToInstant({ year: 2026, month: 3, day: 29 }, 12 * 60, ROME).toISOString(),
);

check(
  "notte del ritorno all'ora solare: le 12:00 restano corrette",
  zonedTimeToInstant({ year: 2026, month: 10, day: 25 }, 12 * 60, ROME).toISOString() ===
    "2026-10-25T11:00:00.000Z",
  zonedTimeToInstant({ year: 2026, month: 10, day: 25 }, 12 * 60, ROME).toISOString(),
);

check(
  "andata e ritorno fra istante e orario del locale",
  (() => {
    const instant = zonedTimeToInstant({ year: 2026, month: 8, day: 3 }, 19 * 60 + 45, ROME);
    const back = zonedDayAndMinute(instant, ROME);
    return back.minuteOfDay === 19 * 60 + 45;
  })(),
);

check(
  "un fuso diverso dà un istante diverso a parità di orario",
  zonedTimeToInstant({ year: 2026, month: 8, day: 3 }, 20 * 60, "America/New_York").toISOString() ===
    "2026-08-04T00:00:00.000Z",
  zonedTimeToInstant({ year: 2026, month: 8, day: 3 }, 20 * 60, "America/New_York").toISOString(),
);

check(
  "data civile letta nel fuso del locale",
  (() => {
    // 22:30 UTC del 3 agosto è già il 4 agosto a Roma.
    const d = zonedCalendarDate(new Date("2026-08-03T22:30:00.000Z"), ROME);
    return d.year === 2026 && d.month === 8 && d.day === 4;
  })(),
);

/* ----------------------- orari prenotabili della giornata ------------------ */

const AUG_3 = { year: 2026, month: 8, day: 3 }; // lunedì
const BEFORE = new Date("2026-08-01T00:00:00.000Z");

const monday = { ...dinner, weekday: 1 };
const mondayLunch = { ...lunch, weekday: 1 };

const day = buildDaySlots(
  { date: AUG_3, partySize: 2, durationMin: 105, now: BEFORE },
  ctx({ shifts: [mondayLunch, monday] }),
);

check("la giornata riporta entrambi i servizi", day.shifts.length === 2, day.shifts.map((s) => s.name).join(", "));
check("i servizi sono in ordine di orario", day.shifts[0].name === "Pranzo");
check("la giornata non risulta chiusa", !day.closed);

const dinnerSlots = day.shifts.find((s) => s.name === "Cena")!;
check(
  "cena 19:00-23:00 a passi di 15 minuti dà 17 orari",
  dinnerSlots.slots.length === 17,
  `ottenuti ${dinnerSlots.slots.length}`,
);
check("il primo orario della cena è 19:00", dinnerSlots.slots[0].label === "19:00");
check("l'ultimo orario della cena è 23:00", dinnerSlots.slots.at(-1)!.label === "23:00");
check(
  "gli orari portano un istante assoluto",
  dinnerSlots.slots[0].startsAt === "2026-08-03T17:00:00.000Z",
  dinnerSlots.slots[0].startsAt,
);
check("con la sala vuota tutti gli orari sono disponibili", dinnerSlots.slots.every((s) => s.available));
check("riporta i coperti ancora liberi", dinnerSlots.slots[0].seatsLeft === 90);

const dayClosed = buildDaySlots(
  { date: AUG_3, partySize: 2, durationMin: 105, now: BEFORE },
  ctx({ shifts: [dinner] }), // solo domenica
);
check("giorno senza servizi: chiuso e senza orari", dayClosed.closed && dayClosed.shifts.length === 0);

const dayPast = buildDaySlots(
  { date: AUG_3, partySize: 2, durationMin: 105, now: new Date("2026-08-03T18:30:00.000Z") }, // 20:30 a Roma
  ctx({ shifts: [monday] }),
);
check(
  "gli orari già passati non vengono proposti",
  dayPast.shifts[0].slots[0].label === "20:45",
  dayPast.shifts[0].slots[0]?.label,
);

const dayFull = buildDaySlots(
  { date: AUG_3, partySize: 4, durationMin: 105, now: BEFORE },
  ctx({
    shifts: [monday],
    // 90 coperti impegnati alle 20:00: gli orari che si sovrappongono si chiudono
    bookings: [booking({ id: "big", startsAt: new Date("2026-08-03T18:00:00.000Z"), partySize: 90, durationMin: 105 })],
  }),
);
const at2000 = dayFull.shifts[0].slots.find((s) => s.label === "20:00")!;
const at1900 = dayFull.shifts[0].slots.find((s) => s.label === "19:00")!;
// La prenotazione da 90 coperti occupa 20:00–21:45, quindi anche le 19:00 ricadono
// nella sua ombra: 19:00 + 105 minuti arriva alle 20:45.
const at2200 = dayFull.shifts[0].slots.find((s) => s.label === "22:00")!;
check("orario al completo: non disponibile", !at2000.available && at2000.seatsLeft === 0);
check("orario nell'ombra di un tavolone: non disponibile", !at1900.available);
check(
  "orario dopo la fine del tavolone: di nuovo disponibile",
  at2200.available && at2200.seatsLeft === 90,
  `22:00 seatsLeft=${at2200.seatsLeft}`,
);

/* ---------------------------------- esito ---------------------------------- */

console.log(`\n  ${passed} verifiche superate`);

if (failures.length > 0) {
  console.error(`  ${failures.length} FALLITE:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log("  Tutte le regole di disponibilità si comportano come previsto.\n");
