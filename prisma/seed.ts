/* eslint-disable no-console */
import { PrismaClient, BookingStatus, BookingSource, Occasion, LoyaltyTier, TableShape } from "@prisma/client";
import { contatoriDaPrenotazioni } from "../src/lib/visite";
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
/**
 * Visite, assenze, ultima visita e livello fedeltà: **dalle righe**.
 *
 * È la stessa regola che vale nel prodotto (`refreshGuestStats` in
 * `server/guest-intelligence.ts`): un contatore è il conteggio di qualcosa che
 * esiste, non un numero scritto a mano. Qui va rifatta perché il seed crea le
 * prenotazioni **dopo** gli ospiti, e finché non le ha create non c'è niente
 * da contare.
 *
 * `totalSpend` resta fuori, come nel prodotto: senza conti chiusi collegati,
 * scriverci una cifra sarebbe inventarla.
 */
async function allineaContatoriOspiti(venueId: string) {
  const ospiti = await db.guest.findMany({
    where: { venueId },
    select: { id: true, bookings: { where: { deletedAt: null }, select: { status: true, startsAt: true } } },
  });

  for (const o of ospiti) {
    const { visite, assenze, ultimaVisita } = contatoriDaPrenotazioni(o.bookings);
    // Le stesse soglie di prima, applicate però a un numero vero.
    const livello: LoyaltyTier =
      visite > 10 ? "AMBASSADOR" : visite > 6 ? "VIP" : visite > 2 ? "REGULAR" : "NEW";

    await db.guest.update({
      where: { id: o.id },
      data: {
        totalVisits: visite,
        noShowCount: assenze,
        lastVisitAt: ultimaVisita,
        loyaltyTier: livello,
        tags: visite > 6 ? ["fedele"] : [],
      },
    });
  }

  console.log(`→ Contatori di ${ospiti.length} ospiti ricalcolati dalle prenotazioni.`);
}

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

/**
 * Un menu demo: senza questo la pagina Menu appare vuota, e una carta vuota
 * non racconta niente di quello che il modulo sa fare — allergeni, piatti
 * finiti, margine sul costo.
 *
 * I costi ci sono solo su alcuni piatti, di proposito: così si vede la
 * differenza fra un piatto con il margine calcolato e uno senza, che è la
 * situazione vera di un locale che sta cominciando a compilarlo.
 */
/**
 * La raccolta punti e due gift card, sulla demo.
 *
 * Le regole della raccolta le dichiara il locale, e senza di esse la funzione
 * resta spenta — giustamente. Sulla demo vanno impostate, altrimenti chi guarda
 * l'applicazione per la prima volta trova una scheda cliente che dice «la
 * raccolta è spenta» e non capisce se manca un pezzo.
 *
 * Un punto per euro e cinque centesimi il punto: restituisce il 5%, che è la
 * misura in cui si muove il mestiere.
 *
 * Le gift card demo restano **senza utilizzi**: un residuo si crea usandole al
 * tavolo, e inventare qui degli utilizzi vorrebbe dire scrivere movimenti di
 * denaro che non sono mai avvenuti.
 */
async function creaFedeltaDemo(venueId: string) {
  await db.venue.update({
    where: { id: venueId },
    data: {
      loyaltyPointsPerEuro: 1,
      loyaltyPointValueCents: 5,
      // Un traguardo: si arriva a 200 punti spendendo 200 €, cioè in tre o
      // quattro cene. Senza, i punti restano uno sconto che nessuno insegue.
      loyaltyRewardPoints: 200,
      loyaltyRewardLabel: "una bottiglia della casa",
    },
  });

  const gia = await db.giftCard.count({ where: { venueId } });
  if (gia > 0) return;

  await db.giftCard.createMany({
    data: [
      {
        venueId,
        code: `REGALO-DEMO${venueId.slice(-4).toUpperCase()}`,
        initialCents: 10_000,
        balanceCents: 10_000,
        recipientName: "Giulia Ferrari",
        senderName: "Marco Bianchi",
        message: "Buon anniversario, ci vediamo a cena.",
        status: "ACTIVE",
      },
      {
        venueId,
        code: `REGALO-DEMOB${venueId.slice(-3).toUpperCase()}`,
        initialCents: 5_000,
        balanceCents: 5_000,
        status: "ACTIVE",
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * Il portale Wi-Fi sulla demo.
 *
 * Serve una password vera, altrimenti il portale resta chiuso e la pagina
 * pubblica non esiste — che è il comportamento giusto ma rende invisibile la
 * funzione a chi guarda la demo. Nessun contatto finto: quelli li lascia chi
 * apre il portale.
 */
async function creaWifiDemo(venueId: string) {
  // Il nome della rete si ricava da quello del locale: due locali della stessa
  // demo con la stessa rete «Aurora-Ospiti» erano una svista visibile a
  // chiunque aprisse il portale del secondo.
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { name: true } });
  const rete = `${venue.name.split(/\s+/)[0]}-Ospiti`;

  await db.venue.update({
    where: { id: venueId },
    data: {
      wifiNetworkName: rete,
      wifiPassword: "buonacena2026",
      wifiPortalWelcome: "Benvenuto da noi. Collegati alla rete e resta quanto vuoi.",
      wifiPortalLegal:
        "I dati che lasci servono a darti l'accesso alla rete e, solo se lo scegli, a informarti sulle nostre serate. Puoi chiederne la cancellazione in qualsiasi momento scrivendo al locale.",
      wifiAutoCouponEnabled: true,
      wifiAutoCouponPercent: 10,
      wifiAutoCouponDays: 30,
      wifiSetupAt: new Date(),
    },
  });
}

async function creaMenuDemo(venueId: string) {
  const esistenti = await db.menuCategory.count({ where: { venueId } });
  if (esistenti > 0) return;

  const carta: {
    categoria: string;
    piatti: {
      name: string;
      description?: string;
      priceCents: number;
      costCents?: number;
      available?: boolean;
      allergens?: string[];
      dietary?: string[];
    }[];
  }[] = [
    {
      categoria: "Antipasti",
      piatti: [
        { name: "Tartare di fassona", description: "Senape antica, tuorlo marinato, pane croccante.", priceCents: 1600, costCents: 450, allergens: ["uova", "senape", "glutine"] },
        { name: "Vitello tonnato", description: "La ricetta di sempre, con capperi di Pantelleria.", priceCents: 1400, costCents: 380, allergens: ["pesce", "uova"] },
        { name: "Giardino d'autunno", description: "Verdure di stagione, nocciole, aceto di mele.", priceCents: 1200, allergens: ["frutta_a_guscio"], dietary: ["vegano", "senza_glutine"] },
      ],
    },
    {
      categoria: "Primi",
      piatti: [
        { name: "Tagliatelle al ragù bianco", description: "Tirate a mano, ragù di maiale e vino.", priceCents: 1500, costCents: 380, allergens: ["glutine", "uova", "solfiti"] },
        { name: "Risotto alla zucca", description: "Zucca mantovana, amaretto, grana 36 mesi.", priceCents: 1600, costCents: 420, allergens: ["latte", "frutta_a_guscio"], dietary: ["vegetariano", "senza_glutine"] },
        { name: "Spaghetti alle vongole", description: "Vongole veraci, prezzemolo, peperoncino.", priceCents: 1800, allergens: ["glutine", "molluschi"], dietary: ["piccante"] },
      ],
    },
    {
      categoria: "Secondi",
      piatti: [
        { name: "Guancia di manzo al Barolo", description: "Cottura lenta, purea di patate alla vaniglia.", priceCents: 2400, costCents: 780, allergens: ["latte", "solfiti", "sedano"] },
        { name: "Branzino in crosta di sale", description: "Per due persone, sfilettato al tavolo.", priceCents: 3800, allergens: ["pesce"], dietary: ["senza_glutine"] },
        // Un piatto finito: nel menu del cliente non compare, e nella carta
        // interna si legge barrato. È il caso che vale la pena vedere.
        { name: "Costata di scottona", description: "Un chilo, frollatura 40 giorni.", priceCents: 5200, costCents: 2600, available: false },
      ],
    },
    {
      categoria: "Contorni",
      piatti: [
        { name: "Patate al forno al rosmarino", priceCents: 600, costCents: 120, dietary: ["vegano", "senza_glutine"] },
        { name: "Cicoria ripassata", description: "Aglio, olio, peperoncino.", priceCents: 600, dietary: ["vegano", "senza_glutine", "piccante"] },
        { name: "Purè di patate alla vaniglia", priceCents: 700, costCents: 150, allergens: ["latte"], dietary: ["vegetariano", "senza_glutine"] },
      ],
    },
    {
      categoria: "Dolci",
      piatti: [
        { name: "Tiramisù del giorno", priceCents: 800, costCents: 180, allergens: ["glutine", "uova", "latte"] },
        { name: "Sorbetto al limone", priceCents: 600, costCents: 120, dietary: ["vegano", "senza_glutine", "senza_lattosio"] },
        { name: "Bonet piemontese", description: "Cacao, amaretti, rum.", priceCents: 800, allergens: ["uova", "latte", "frutta_a_guscio", "solfiti"] },
      ],
    },
  ];

  let quantiPiatti = 0;
  for (const [i, sezione] of carta.entries()) {
    const categoria = await db.menuCategory.create({
      data: { venueId, name: sezione.categoria, ordering: i, menuKey: "main" },
    });
    for (const [j, piatto] of sezione.piatti.entries()) {
      const creato = await db.menuItem.create({
        data: {
          venueId,
          categoryId: categoria.id,
          name: piatto.name,
          description: piatto.description ?? null,
          priceCents: piatto.priceCents,
          available: piatto.available ?? true,
          allergens: piatto.allergens ?? [],
          dietary: piatto.dietary ?? [],
          ordering: j,
        },
      });
      if (piatto.costCents != null) {
        await db.menuItemCost.create({
          data: { venueId, menuItemId: creato.id, costCents: piatto.costCents },
        });
      }
      quantiPiatti++;
    }
  }
  console.log(`→ Creato il menu demo: ${carta.length} categorie, ${quantiPiatti} piatti.`);
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
    // Anche il menu: chi ha la demo già installata deve vedere la carta senza
    // dover ricreare tutto da zero.
    for (const id of venueIds) await creaMenuDemo(id);
    // E la raccolta punti: chi ha la demo già installata deve vedere anche
    // questa senza ricreare niente.
    for (const id of venueIds) await creaFedeltaDemo(id);
    for (const id of venueIds) await creaWifiDemo(id);
    // I contatori degli ospiti: chi ha la demo installata da prima ha in
    // archivio livelli e visite scritti a caso dal vecchio seed — «Ambassador»
    // accanto a «1 visita». Qui si riallineano alle prenotazioni vere.
    for (const id of venueIds) await allineaContatoriOspiti(id);
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
        /*
          Niente contatori qui. Il seed scriveva un `totalVisits` casuale e ne
          derivava il livello fedeltà, poi creava un numero **diverso** di
          prenotazioni: nell'elenco ospiti si leggeva «Ambassador» accanto a
          «1 visita», e la demo si contraddiceva da sola in una riga.
          Visite, assenze, ultima visita e livello si ricalcolano dalle righe
          quando le prenotazioni esistono — vedi `allineaContatoriOspiti`.
        */
        return db.guest.create({
          data: {
            venueId: venue.id,
            firstName: first,
            lastName: last,
            email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s/g, "")}${i}@example.com`,
            phone: `+39 3${Math.floor(Math.random() * 90 + 10)} ${Math.floor(Math.random() * 9000000 + 1000000)}`,
            tags: [],
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

    await allineaContatoriOspiti(venue.id);

    await creaCamerieriDemo(venue.id);

    await creaMenuDemo(venue.id);

    await creaFedeltaDemo(venue.id);

    await creaWifiDemo(venue.id);

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
