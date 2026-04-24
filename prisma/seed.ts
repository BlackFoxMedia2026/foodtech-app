/* eslint-disable no-console */
import { PrismaClient, BookingStatus, BookingSource, Occasion, LoyaltyTier, TableShape } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

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

async function main() {
  const existingOrg = await db.organization.findUnique({ where: { slug: "casa-aurora" } });
  if (existingOrg) {
    console.log("→ Seed già presente, salto.");
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

    // Bookings: ultimi 30 giorni + prossimi 14
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let dayOffset = -30; dayOffset <= 14; dayOffset++) {
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
