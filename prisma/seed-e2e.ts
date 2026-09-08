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
      // Il profilo pubblico serve al percorso del sondaggio: da qui nasce da
      // sola la prima destinazione dove mandare chi è contento (vedi
      // `ensureReviewLinks`), e il percorso verifica anche quello.
      googleBusinessUrl: "https://esempio.test/recensione-e2e",
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

  /**
   * Una visita di ieri, chiusa, col suo sondaggio già inviato.
   *
   * Serve al percorso «sondaggio → recensione»: il messaggio lo manda un
   * lavoro pianificato il giorno dopo la visita, e un percorso non può
   * aspettare domani. Il lavoro pianificato ha già i suoi test; qui si
   * verifica quello che succede **dal link in poi**, che è la parte che
   * nessun test unitario percorre.
   */
  const ieri = new Date(Date.now() - 26 * 3_600_000);
  const ospite = await db.guest.create({
    data: {
      venueId: venue.id,
      firstName: "Chiara",
      lastName: "Prova",
      email: "chiara.prova@tavolo.test",
      marketingOptIn: true,
    },
  });
  const visita = await db.booking.create({
    data: {
      venueId: venue.id,
      guestId: ospite.id,
      partySize: 2,
      startsAt: ieri,
      durationMin: 105,
      status: "COMPLETED",
      source: "PHONE",
      seatedAt: ieri,
      closedAt: new Date(ieri.getTime() + 105 * 60_000),
    },
  });
  const sondaggio = await db.survey.create({
    data: {
      venueId: venue.id,
      guestId: ospite.id,
      bookingId: visita.id,
      token: `${E2E.prefisso}sondaggio`,
      sentAt: new Date(),
    },
  });

  // Un secondo link, per la strada opposta: un voto basso. Ne serve un altro
  // perché **un sondaggio si risponde una volta sola** — è una difesa, non un
  // limite, e il percorso del promotore ha già consumato il primo.
  const sondaggioBasso = await db.survey.create({
    data: {
      venueId: venue.id,
      guestId: ospite.id,
      token: `${E2E.prefisso}sondaggio-basso`,
      sentAt: new Date(),
    },
  });

  /**
   * Una campagna **già inviata**, per il percorso dell'attribuzione.
   *
   * L'invio vero passa da un fornitore email che in prova non c'è, e ha già i
   * suoi test unitari. Quello che nessun test percorre è la parte **dal clic
   * in poi**: il link porta a prenotare, la prenotazione nasce col merito
   * della campagna, e il merito si vede nei risultati.
   *
   * Serve anche una riga di `MessageLog`: la finestra di attribuzione parte
   * dal primo invio registrato, e senza quella riga una prenotazione di
   * adesso non avrebbe nessun invio a cui essere attribuita.
   */
  const campagna = await db.campaign.create({
    data: {
      venueId: venue.id,
      name: "Prova e2e: torna a trovarci",
      channel: "EMAIL",
      status: "SENT",
      subject: "Ti aspettiamo",
      body: "<p>Un tavolo per te.</p>",
      sentCount: 1,
      openedCount: 1,
      segment: { audienceTag: "inattivi" },
    },
  });
  await db.messageLog.create({
    data: {
      venueId: venue.id,
      campaignId: campagna.id,
      guestId: ospite.id,
      channel: "EMAIL",
      kind: "campaign.send",
      status: "SENT",
      sentAt: new Date(Date.now() - 2 * 3_600_000),
      toAddress: ospite.email!,
      subject: "Ti aspettiamo",
      // Due ore fa: dentro la finestra, e prima della prenotazione che il
      // percorso creerà adesso.
      createdAt: new Date(Date.now() - 2 * 3_600_000),
    },
  });

  return {
    userId: user.id,
    campaignId: campagna.id,
    orgId: org.id,
    venueId: venue.id,
    roomId: room.id,
    surveyToken: sondaggio.token,
    surveyTokenBasso: sondaggioBasso.token,
  };
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
