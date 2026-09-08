import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/**
 * I dati dei test end-to-end.
 *
 * Sono **separati dalla demo** di proposito. La demo serve a far vedere il
 * prodotto e cambia: un piatto in più, una prenotazione spostata, un numero
 * ritoccato per una schermata. Se i percorsi automatici poggiassero su di
 * essa, ogni ritocco commerciale romperebbe una prova, e nessuno saprebbe se
 * il rosso è un difetto o una modifica alla vetrina.
 *
 * Tre scelte che rendono i percorsi ripetibili:
 *
 * - **un locale tutto suo**, con lo stesso prefisso (`e2e-`) su ogni riga, in
 *   modo che la pulizia sia una riga di SQL e non un elenco da ricordare;
 * - **turni che coprono l'intera giornata.** Il locale demo apre a pranzo e a
 *   cena, e un test che gira alle 03:00 si sentirebbe dire — giustamente — che
 *   il locale è chiuso. Qui il servizio è sempre aperto, così le prove
 *   riguardano la funzione e non l'ora in cui girano;
 * - **capienza alta e tavoli abbondanti**, perché nessun percorso fallisca per
 *   un motivo diverso da quello che sta verificando.
 *
 * Si esegue da solo (`npm run db:seed-e2e`) ed è idempotente: se il locale
 * esiste già, viene svuotato e ricostruito.
 */

const db = new PrismaClient();

export const E2E = {
  prefisso: "e2e-",
  email: "e2e@tavolo.test",
  password: "e2e-tavolo-2026",
  venueSlug: "e2e-locale",
  orgSlug: "e2e-org",
} as const;

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questo seed scrive sul database: DATABASE_URL deve contenere 'dev' o 'test'. " +
      "Non esiste un motivo per creare un locale di prova in produzione.",
  );
}

async function pulisci() {
  // L'organizzazione cade a cascata su locali, tavoli, prenotazioni, ospiti e
  // tutto il resto: è il modo più corto di non dimenticare una tabella.
  await db.organization.deleteMany({ where: { slug: { startsWith: E2E.prefisso } } });
  await db.user.deleteMany({ where: { email: E2E.email } });
}

export async function seedE2E() {
  await pulisci();

  const passwordHash = await bcrypt.hash(E2E.password, 10);
  const user = await db.user.create({
    data: { email: E2E.email, name: "Prova E2E", passwordHash },
  });

  const org = await db.organization.create({
    data: {
      name: "E2E Hospitality",
      slug: E2E.orgSlug,
      plan: "GROWTH",
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  const venue = await db.venue.create({
    data: {
      orgId: org.id,
      name: "Locale di prova",
      slug: E2E.venueSlug,
      kind: "RESTAURANT",
      city: "Milano",
      country: "IT",
      timezone: "Europe/Rome",
      currency: "EUR",
      phone: "+39 02 000 0000",
      email: "prova@tavolo.test",
      // Le due regole della raccolta punti: dichiarate, altrimenti il percorso
      // del conto non potrebbe usare i punti.
      loyaltyPointsPerEuro: 1,
      loyaltyPointValueCents: 5,
      // Niente onboarding a metà: il banner «completa il brand» coprirebbe i
      // pulsanti nelle prove.
      onboardingStatus: "COMPLETED",
      onboardingCompletedAt: new Date(),
    },
  });

  await db.venueMembership.create({
    data: { userId: user.id, venueId: venue.id, role: "MANAGER" },
  });

  const room = await db.room.create({ data: { venueId: venue.id, name: "Sala" } });

  // Dieci tavoli: nessun percorso deve fallire per mancanza di posti.
  await db.table.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      venueId: venue.id,
      roomId: room.id,
      label: `P${i + 1}`,
      seats: i < 6 ? 4 : 6,
      shape: "SQUARE" as const,
      posX: 80 + (i % 5) * 160,
      posY: 80 + Math.floor(i / 5) * 160,
    })),
  });

  // Servizio sempre aperto: la prova riguarda la funzione, non l'orario.
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: {
        venueId: venue.id,
        name: "Servizio continuato",
        weekday,
        startMinute: 0,
        endMinute: 23 * 60 + 59,
        capacity: 200,
        slotMinutes: 15,
      },
    });
  }

  const categoria = await db.menuCategory.create({
    data: { venueId: venue.id, name: "Piatti", ordering: 0, menuKey: "main" },
  });

  // Due piatti: uno con il costo dichiarato (serve al food cost), uno senza.
  const conCosto = await db.menuItem.create({
    data: {
      venueId: venue.id,
      categoryId: categoria.id,
      name: "Tagliatelle di prova",
      priceCents: 1500,
      ordering: 0,
      allergens: ["glutine", "uova"],
      dietary: [],
    },
  });
  await db.menuItemCost.create({
    data: { venueId: venue.id, menuItemId: conCosto.id, costCents: 400 },
  });
  await db.menuItem.create({
    data: {
      venueId: venue.id,
      categoryId: categoria.id,
      name: "Sorbetto di prova",
      priceCents: 600,
      ordering: 1,
      allergens: [],
      dietary: ["vegano"],
    },
  });

  return { userId: user.id, orgId: org.id, venueId: venue.id, roomId: room.id };
}

// Eseguibile a mano: `npx tsx prisma/seed-e2e.ts`
if (process.argv[1]?.includes("seed-e2e")) {
  seedE2E()
    .then((r) => console.log(`→ Locale di prova pronto: ${r.venueId}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
