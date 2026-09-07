/* eslint-disable no-console */
import { PrismaClient, BookingStatus, BookingSource, Occasion, LoyaltyTier, TableShape } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

/** Ampiezza della vetrina dimostrativa attorno a oggi. */
const PASSATO_GIORNI = 30;
const FUTURO_GIORNI = 14;

const FIRST = ["Lorenzo", "Giulia", "Matteo", "Sofia", "Andrea", "Camilla", "Tommaso", "Chiara", "Federico", "Alessia", "Marco", "Beatrice", "Riccardo", "Elena", "Davide", "Martina"];
const LAST = ["Ferri", "Conti", "Greco", "Russo", "Marini", "Bianchi", "De Luca", "Romano", "Esposito", "Ricci", "Galli", "Moretti", "Costa", "Vitale"];
const NOTES = [
  "Prefer table near the window",
  "Allergico ai crostacei",
  "Compleanno della moglie",
  "Cliente abituale dello chef",
  "Richiede menu vegano",
  null,
  null,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function setTime(date: Date, h: number, m = 0) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Riporta la vetrina dimostrativa a cavallo di oggi.
 *
 * Il seed genera prenotazioni relative al giorno in cui viene eseguito. Girando
 * una volta sola al primo deploy, la demo pubblica invecchiava: a settembre
 * mostrava prenotazioni di luglio, quindi ogni schermata diceva zero e chi
 * apriva il link vedeva un prodotto morto.
 *
 * Sposta tutte le date del locale demo dello stesso numero di giorni, così le
 * distanze fra le prenotazioni — e quindi gli andamenti in Analytics — restano
 * quelle pensate, e le prenotazioni passate restano passate.
 */
async function riallineaDateDemo(venueIds: string[]) {
  if (venueIds.length === 0) return;

  /**
   * Lo spostamento delle date è una modifica di massa: tocca **tutte** le
   * prenotazioni del locale. Va bene su un database di prova, dove i dati
   * sono finti; su quello vero sposterebbe di settimane anche le prenotazioni
   * inserite a mano durante una dimostrazione.
   *
   * Quindi non parte da sola: serve dirlo esplicitamente. Un comando che
   * modifica migliaia di righe deve essere una scelta, non l'effetto
   * collaterale di `npm run db:seed`.
   */
  if (process.env.SEED_ALLOW_DATE_SHIFT !== "1") {
    const totale = await db.booking.count({ where: { venueId: { in: venueIds } } });
    console.log(
      `→ Trovate ${totale} prenotazioni. NON sposto le date: per farlo esegui\n` +
        "  SEED_ALLOW_DATE_SHIFT=1 npm run db:seed\n" +
        "  (da usare solo su un database di prova: sposta tutte le prenotazioni del locale)",
    );
    return;
  }

  const ultima = await db.booking.findFirst({
    where: { venueId: { in: venueIds } },
    orderBy: { startsAt: "desc" },
    select: { startsAt: true },
  });
  if (!ultima) return;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const bersaglio = new Date(oggi);
  bersaglio.setDate(bersaglio.getDate() + FUTURO_GIORNI);

  const giorni = Math.round((bersaglio.getTime() - ultima.startsAt.getTime()) / 86_400_000);
  if (giorni === 0) {
    console.log("→ Le date della demo sono già allineate a oggi.");
    return;
  }

  const intervallo = `${giorni} days`;
  // Prisma non sa scrivere "colonna = colonna + intervallo": qui serve SQL.
  const pren = await db.$executeRawUnsafe(
    `UPDATE "Booking" SET "startsAt" = "startsAt" + $1::interval,
       "arrivedAt" = CASE WHEN "arrivedAt" IS NULL THEN NULL ELSE "arrivedAt" + $1::interval END,
       "seatedAt" = CASE WHEN "seatedAt" IS NULL THEN NULL ELSE "seatedAt" + $1::interval END,
       "closedAt" = CASE WHEN "closedAt" IS NULL THEN NULL ELSE "closedAt" + $1::interval END
     WHERE "venueId" = ANY($2::text[])`,
    intervallo,
    venueIds,
  );
  await db.$executeRawUnsafe(
    `UPDATE "Experience" SET "startsAt" = "startsAt" + $1::interval,
       "endsAt" = CASE WHEN "endsAt" IS NULL THEN NULL ELSE "endsAt" + $1::interval END
     WHERE "venueId" = ANY($2::text[])`,
    intervallo,
    venueIds,
  );

  console.log(`→ Demo riallineata: ${pren} prenotazioni spostate di ${giorni} giorni.`);
}

/** Il modulo Camerieri è il più recente e il più curato, e il seed non creava
 * nemmeno una persona: sulla demo appariva vuoto. */
async function creaCamerieriDemo(venueId: string) {
  const esistenti = await db.waiter.count({ where: { venueId } });
  if (esistenti > 0) return;

  const squadra = [
    { firstName: "Marco", lastName: "Bellini", primaryRole: "MAITRE" as const, role: "Maître", capabilities: ["MAITRE", "ROOM_SUPERVISOR"] as const },
    { firstName: "Sara", lastName: "Fontana", primaryRole: "CHEF_DE_RANG" as const, role: "Chef de rang", capabilities: ["TABLE_RESPONSIBLE"] as const },
    { firstName: "Luca", lastName: "Perini", primaryRole: "CAMERIERE" as const, role: "Cameriere", capabilities: ["TABLE_RESPONSIBLE", "TABLE_SUPPORT"] as const },
    { firstName: "Elisa", lastName: "Nardi", primaryRole: "SOMMELIER" as const, role: "Sommelier", capabilities: ["SOMMELIER"] as const },
    { firstName: "Davide", lastName: "Sanna", primaryRole: "RUNNER" as const, role: "Runner", capabilities: ["RUNNER"] as const },
    { firstName: "Giorgia", lastName: "Milani", primaryRole: "HOST" as const, role: "Host", capabilities: ["HOST"] as const },
  ];

  for (const [i, persona] of squadra.entries()) {
    await db.waiter.create({
      data: {
        venueId,
        firstName: persona.firstName,
        lastName: persona.lastName,
        role: persona.role,
        primaryRole: persona.primaryRole,
        capabilities: [...persona.capabilities],
        birthday: new Date(Date.UTC(1988 + i, (i * 3) % 12, 5 + i)),
        phone: `+39 34${i} ${1000000 + i * 111111}`,
      },
    });
  }
  console.log(`→ Creati ${squadra.length} camerieri demo.`);
}

async function main() {
  const existingOrg = await db.organization.findUnique({
    where: { slug: "casa-aurora" },
    include: { venues: { select: { id: true } } },
  });

  if (existingOrg) {
    // Non ricrea niente, ma non se ne va a mani vuote: rinfresca la vetrina.
    const venueIds = existingOrg.venues.map((v) => v.id);
    await riallineaDateDemo(venueIds);
    for (const id of venueIds) await creaCamerieriDemo(id);
    // La spesa media è dichiarata dal locale: se manca, la stima degli
    // incassi non si mostra. Sulla demo va impostata, altrimenti la
    // Panoramica sembra incompleta.
    for (const id of venueIds) {
      await db.venue.update({
        where: { id },
        data: { avgSpendCents: 4500 },
      });
    }
    console.log("→ Spesa media per coperto impostata a 45 € sui locali demo.");

    console.log("\n✓ Demo aggiornata.");
    return;
  }

  console.log("→ Creazione organizzazione demo…");
  const passwordHash = await bcrypt.hash("tavolo2026", 10);

  const owner = await db.user.upsert({
    where: { email: "owner@tavolo.demo" },
    update: { passwordHash },
    create: {
      email: "owner@tavolo.demo",
      name: "Anna Conti",
      passwordHash,
    },
  });

  const org = await db.organization.create({
    data: {
      name: "Casa Aurora Hospitality",
      slug: "casa-aurora",
      plan: "GROWTH",
      members: { create: { userId: owner.id, role: "OWNER" } },
      venues: {
        create: [
          {
            name: "Aurora Bistrot",
            slug: "aurora-bistrot",
            kind: "RESTAURANT",
            city: "Milano",
            country: "IT",
            address: "Via dei Fiori 12",
            phone: "+39 02 555 0101",
            email: "ciao@auroramilano.it",
          },
          {
            name: "Riva Beach Club",
            slug: "riva-beach",
            kind: "BEACH_CLUB",
            city: "Forte dei Marmi",
            country: "IT",
            address: "Lungomare 88",
            phone: "+39 0584 555 220",
          },
        ],
      },
    },
    include: { venues: true },
  });

  for (const venue of org.venues) {
    await db.venueMembership.create({ data: { userId: owner.id, venueId: venue.id, role: "MANAGER" } });

    console.log(`→ Setup ${venue.name}`);

    // Sale + tavoli
    const room = await db.room.create({
      data: { venueId: venue.id, name: venue.kind === "BEACH_CLUB" ? "Spiaggia" : "Sala principale", width: 1200, height: 760 },
    });

    const tableDefs = venue.kind === "BEACH_CLUB"
      ? Array.from({ length: 18 }).map((_, i) => ({
          label: `Beach ${i + 1}`,
          seats: 4,
          shape: "LOUNGE" as const,
          posX: 80 + (i % 6) * 170,
          posY: 100 + Math.floor(i / 6) * 200,
        }))
      : [
          ...Array.from({ length: 8 }).map((_, i) => ({
            label: `T${i + 1}`,
            seats: 2,
            shape: TableShape.ROUND,
            posX: 80 + i * 130,
            posY: 120,
          })),
          ...Array.from({ length: 6 }).map((_, i) => ({
            label: `T${i + 9}`,
            seats: 4,
            shape: TableShape.SQUARE,
            posX: 100 + i * 170,
            posY: 320,
          })),
          ...Array.from({ length: 3 }).map((_, i) => ({
            label: `B${i + 1}`,
            seats: 6,
            shape: TableShape.BOOTH,
            posX: 140 + i * 290,
            posY: 540,
          })),
        ];

    await db.table.createMany({
      data: tableDefs.map((t) => ({ ...t, venueId: venue.id, roomId: room.id })),
    });

    // Turni
    for (let weekday = 0; weekday < 7; weekday++) {
      await db.shift.createMany({
        data: [
          { venueId: venue.id, name: "Pranzo", weekday, startMinute: 12 * 60, endMinute: 15 * 60, capacity: 60 },
          { venueId: venue.id, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 90 },
        ],
      });
    }

    // Guests
    const guests = await Promise.all(
      Array.from({ length: 60 }).map((_, i) => {
        const first = pick(FIRST);
        const last = pick(LAST);
        const visits = Math.floor(Math.random() * 14);
        const tier: LoyaltyTier =
          visits > 10 ? "AMBASSADOR" : visits > 6 ? "VIP" : visits > 2 ? "REGULAR" : "NEW";
        return db.guest.create({
          data: {
            venueId: venue.id,
            firstName: first,
            lastName: last,
            email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}${i}@example.com`,
            phone: `+39 3${Math.floor(Math.random() * 90 + 10)} ${Math.floor(Math.random() * 9000000 + 1000000)}`,
            loyaltyTier: tier,
            totalVisits: visits,
            totalSpend: visits * (Math.floor(Math.random() * 60) + 35),
            tags: visits > 6 ? ["fedele"] : [],
            marketingOptIn: Math.random() > 0.3,
            preferences: Math.random() > 0.7 ? { table: "vista mare" } : undefined,
            allergies: Math.random() > 0.85 ? "Glutine" : null,
          },
        });
      }),
    );

    const tables = await db.table.findMany({ where: { venueId: venue.id } });

    // Prenotazioni: la finestra è centrata su oggi, e riallineaDateDemo la
    // riporta qui a ogni esecuzione successiva.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let dayOffset = -PASSATO_GIORNI; dayOffset <= FUTURO_GIORNI; dayOffset++) {
      const day = new Date(today);
      day.setDate(today.getDate() + dayOffset);

      const bookingsToday = 6 + Math.floor(Math.random() * 14);
      for (let i = 0; i < bookingsToday; i++) {
        const isLunch = Math.random() > 0.55;
        const baseHour = isLunch ? 12 + Math.floor(Math.random() * 3) : 19 + Math.floor(Math.random() * 4);
        const baseMin = pick([0, 15, 30, 45]);
        const startsAt = setTime(day, baseHour, baseMin);
        const partySize = 2 + Math.floor(Math.random() * 6);
        const guest = pick(guests);
        const table = pick(tables.filter((t) => t.seats >= partySize - 1)) ?? pick(tables);

        let status: BookingStatus = "CONFIRMED";
        if (dayOffset < 0) {
          const r = Math.random();
          if (r < 0.78) status = "COMPLETED";
          else if (r < 0.88) status = "NO_SHOW";
          else status = "CANCELLED";
        }

        await db.booking.create({
          data: {
            venueId: venue.id,
            guestId: guest.id,
            tableId: table.id,
            partySize,
            startsAt,
            durationMin: isLunch ? 90 : 120,
            status,
            source: pick<BookingSource>(["WIDGET", "PHONE", "WALK_IN", "GOOGLE", "SOCIAL", "CONCIERGE"]),
            occasion: Math.random() > 0.85 ? pick<Occasion>(["BIRTHDAY", "ANNIVERSARY", "BUSINESS", "DATE"]) : null,
            notes: pick(NOTES),
            depositCents: Math.random() > 0.7 ? 2000 * partySize : 0,
            depositStatus: Math.random() > 0.7 ? "HELD" : "NONE",
          },
        });
      }
    }

    // Esperienze
    if (venue.kind === "RESTAURANT") {
      await db.experience.create({
        data: {
          venueId: venue.id,
          title: "Cena degustazione tartufo bianco",
          slug: "degustazione-tartufo",
          description: "Sette portate dello chef in abbinamento a vini selezionati.",
          startsAt: setTime(new Date(today.getTime() + 7 * 86400000), 20, 0),
          endsAt: setTime(new Date(today.getTime() + 7 * 86400000), 23, 30),
          capacity: 24,
          priceCents: 12500,
          published: true,
        },
      });
    } else {
      await db.experience.create({
        data: {
          venueId: venue.id,
          title: "Sunset DJ Set & Cocktail",
          slug: "sunset-dj",
          description: "Live set in spiaggia con cocktail signature.",
          startsAt: setTime(new Date(today.getTime() + 4 * 86400000), 18, 30),
          endsAt: setTime(new Date(today.getTime() + 4 * 86400000), 22, 0),
          capacity: 120,
          priceCents: 3500,
          published: true,
        },
      });
    }

    await creaCamerieriDemo(venue.id);

    // Campagna esempio
    await db.campaign.create({
      data: {
        venueId: venue.id,
        name: "Recupero clienti dormienti",
        channel: "EMAIL",
        subject: "Ti aspettiamo per una serata dedicata",
        body: "Sono passati 90 giorni dalla tua ultima visita…",
        status: "SENT",
        sentCount: 142,
        openedCount: 81,
        bookedCount: 19,
      },
    });
  }

  console.log("\n✓ Seed completato.");
  console.log("  Login demo:  owner@tavolo.demo  /  tavolo2026");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
