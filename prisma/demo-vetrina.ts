/* eslint-disable no-console */
import type { PrismaClient, Prisma, StaffCapability } from "@prisma/client";
import { dateKeyInVenue, todayInVenue } from "../src/lib/venue-time";
import { bookingEnd, overlaps } from "../src/server/availability";

/**
 * La vetrina della demo: le **righe** che mancavano.
 *
 * Il seed creava prenotazioni, ospiti, menu e camerieri, e si fermava lì.
 * Risultato: metà dell'area operativa mostrava caselle vuote non perché il
 * prodotto non sappia misurare, ma perché non c'era niente da contare — nessun
 * conto chiuso, quindi nessun incasso e nessun costo del cibo; nessun orario di
 * arrivo, quindi nessuna durata delle cene; nessun sondaggio, quindi nessun
 * voto; nessuna riga chiusa in lista d'attesa, quindi nessuna conversione.
 *
 * Qui si creano quelle righe. La regola che tiene in piedi tutto il file è
 * quella del progetto: **un contatore è il conteggio di righe che esistono**.
 * Quindi non si scrive un incasso: si chiudono dei conti, e l'incasso viene da
 * sé. Non si scrive `Guest.totalSpend`: si sommano i conti di quell'ospite.
 * Non si scrivono punti fedeltà: si applica ai conti chiusi la stessa formula
 * che usa `accreditaPuntiConto` quando il cameriere chiude il tavolo.
 *
 * Tre proprietà valgono per ogni funzione di questo file:
 *
 * - **è ripetibile.** Girare il seed due volte non raddoppia niente: ogni
 *   passo guarda prima se il suo lavoro è già stato fatto;
 * - **è deterministica.** Il caso viene da un generatore seminato con
 *   l'identificativo della riga, non da `Math.random()`: la stessa demo,
 *   rifatta, racconta la stessa storia;
 * - **non inventa numeri.** Dove il prodotto dice onestamente «non lo so»
 *   (i pagamenti con carta, i biglietti delle esperienze) qui non si scrive
 *   niente: vedi le note in fondo al file.
 */

/* -------------------------------------------------------------------------- */
/*  Il caso, ma sempre lo stesso                                              */
/* -------------------------------------------------------------------------- */

/**
 * Un generatore di numeri casuali seminato da una stringa.
 *
 * Serve a una cosa precisa: la demo rifatta domani deve raccontare la stessa
 * storia di oggi. Con `Math.random()` ogni esecuzione sposta di qualche euro
 * ogni cifra di ogni schermata, e diventa impossibile dire se una differenza
 * vista in una prova viene da una modifica o dal caso.
 */
function caso(seme: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seme.length; i++) {
    h ^= seme.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h >>>= 0;
    return h / 4294967296;
  };
}

/** Un elemento a caso, con il caso seminato. */
function scegli<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Un intero fra min e max compresi. */
function fra(r: () => number, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}

/** Esegue a blocchi: mille aggiornamenti in parallelo aprono mille connessioni. */
async function aBlocchi<T>(righe: T[], quanti: number, lavoro: (riga: T) => Promise<unknown>) {
  for (let i = 0; i < righe.length; i += quanti) {
    await Promise.all(righe.slice(i, i + quanti).map(lavoro));
  }
}

const MINUTO = 60_000;
const ORA = 3_600_000;
const GIORNO = 86_400_000;

/* -------------------------------------------------------------------------- */
/*  1. Quando è stata prenotata, questa cena                                  */
/* -------------------------------------------------------------------------- */

/**
 * `createdAt` delle prenotazioni: un anticipo plausibile invece dell'istante
 * in cui è girato il seed.
 *
 * Non è un dettaglio estetico. La previsione dei prossimi giorni
 * (`server/forecast.ts`) risponde a «quanto era già prenotato a questa
 * distanza dal servizio» confrontando `createdAt` con `startsAt`: se tutte le
 * prenotazioni risultano create nello stesso istante — quello del seed — la
 * risposta è sempre «il libro è già completo», e la spiegazione che la
 * schermata mostra («da te si prenota con anticipo») è un ragionamento fatto
 * su un dato falso.
 *
 * I walk-in restano fuori: chi entra senza prenotare **è** prenotato
 * nell'istante in cui si siede, e per loro `createdAt ≈ startsAt` è la verità.
 */
export async function sistemaAnticipoPrenotazioni(db: PrismaClient, venueId: string) {
  /*
    Un aggiornamento di massa in SQL, con l'anticipo ricavato dall'md5
    dell'identificativo: nessuna riga cambia da un'esecuzione all'altra, e non
    servono mille viaggi al database. `LEAST(now(), …)` impedisce l'assurdo di
    una prenotazione creata nel futuro, che è quello che succederebbe a una
    prenotazione fra due settimane con venti giorni di anticipo.
  */
  const cambiate = await db.$executeRawUnsafe(
    `UPDATE "Booking" SET "createdAt" = LEAST(
        now(),
        "startsAt"
          - ((get_byte(decode(md5(id), 'hex'), 0) % 20 + 1) || ' days')::interval
          - ((get_byte(decode(md5(id), 'hex'), 1) % 10) || ' hours')::interval
      )
      WHERE "venueId" = $1
        AND "deletedAt" IS NULL
        AND "source" <> 'WALK_IN'
        AND "createdAt" > "startsAt" - interval '1 hour'`,
    venueId,
  );
  if (cambiate > 0) console.log(`   ${cambiate} prenotazioni: anticipo di prenotazione plausibile.`);
}

/* -------------------------------------------------------------------------- */
/*  2. Le cene già finite                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Le prenotazioni il cui servizio è finito e che nessuno ha chiuso.
 *
 * Il seed generava la giornata di oggi tutta «confermata», e ci restava: alle
 * quattro del pomeriggio la Panoramica mostrava sette pranzi ancora da
 * arrivare, e l'incasso della giornata restava senza conti perché nessuna cena
 * di oggi era mai finita. Non era un numero mancante: era una giornata che non
 * scorreva.
 *
 * Si chiude solo ciò che è **finito davvero**: orario più durata prevista, più
 * mezz'ora di margine. Una prenotazione di venti minuti fa non si tocca — è la
 * sala di adesso, e la gestisce `apparecchiaServizioDiOggi`.
 */
export async function chiudiLeCeneFinite(db: PrismaClient, venueId: string, adesso = new Date()) {
  const aperte = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: { in: ["CONFIRMED", "ARRIVED", "SEATED"] },
      startsAt: { lt: new Date(adesso.getTime() - 30 * MINUTO) },
    },
    select: { id: true, startsAt: true, durationMin: true, status: true },
  });

  const finite = aperte.filter(
    (b) => b.startsAt.getTime() + (b.durationMin + 30) * MINUTO < adesso.getTime(),
  );
  if (finite.length === 0) return;

  let completate = 0;
  let assenze = 0;
  for (const b of finite) {
    const r = caso(`finita-${b.id}`);
    // Chi era già seduto ha per definizione cenato; per gli altri resta la
    // quota di assenze del locale.
    const assente = b.status === "CONFIRMED" && r() < 0.08;
    await db.booking.update({
      where: { id: b.id },
      data: assente ? { status: "NO_SHOW" } : { status: "COMPLETED" },
    });
    if (assente) assenze++;
    else completate++;
  }

  console.log(`   ${completate} servizi finiti chiusi, ${assenze} segnati come assenza.`);
}

/* -------------------------------------------------------------------------- */
/*  3. Gli orari della serata                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Arrivo, accomodamento e chiusura sulle cene già avvenute.
 *
 * Sono i tre orari da cui il prodotto misura **quanto si sta a tavola**
 * (`server/rotazione.ts`), e senza di essi Analytics dice — correttamente —
 * «ancora presto per dirlo» su un archivio di trecento cene. Non è un numero
 * inventato che mancava: erano tre colonne vuote.
 *
 * Le durate non sono tutte uguali e non sono simmetriche: qualche tavolo resta
 * molto più del previsto (è la serata che si allunga), e la mediana che il
 * prodotto usa al posto della media serve esattamente a non farsi trascinare da
 * quelli.
 */
export async function segnaOrariDelleCene(db: PrismaClient, venueId: string, adesso = new Date()) {
  const cene = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: "COMPLETED",
      // Lo stesso istante che usa `chiudiLeCeneFinite`: le due funzioni
      // lavorano in coppia, e con due orologi diversi la seconda salterebbe
      // proprio le cene che la prima ha appena chiuso.
      startsAt: { lt: adesso },
      arrivedAt: null,
    },
    select: { id: true, startsAt: true, durationMin: true },
  });
  if (cene.length === 0) return;

  await aBlocchi(cene, 40, async (b) => {
    const r = caso(`orari-${b.id}`);
    // Chi arriva prima del previsto è una minoranza; il ritardo di dieci
    // minuti è la norma di qualunque sala.
    const ritardo = fra(r, -6, 18);
    const attesaInIngresso = fra(r, 0, 7);
    const oraLocale = Number(
      new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(
        b.startsAt,
      ),
    );
    const pranzo = oraLocale < 17;
    // Una cena dura più di un pranzo, e una volta su dieci dura molto di più.
    const base = pranzo ? fra(r, 62, 108) : fra(r, 92, 158);
    const durataVera = r() < 0.1 ? base + fra(r, 25, 70) : base;

    const arrivedAt = new Date(b.startsAt.getTime() + ritardo * MINUTO);
    const seatedAt = new Date(arrivedAt.getTime() + attesaInIngresso * MINUTO);
    const closedAt = new Date(seatedAt.getTime() + durataVera * MINUTO);

    await db.booking.update({ where: { id: b.id }, data: { arrivedAt, seatedAt, closedAt } });
  });

  console.log(`   ${cene.length} cene passate: segnati arrivo, accomodamento e chiusura.`);
}

/* -------------------------------------------------------------------------- */
/*  4. I conti                                                               */
/* -------------------------------------------------------------------------- */

/** Le portate, con la probabilità che un tavolo le ordini. */
const PORTATE: { categoria: string; quota: number }[] = [
  { categoria: "Antipasti", quota: 0.55 },
  { categoria: "Primi", quota: 0.82 },
  { categoria: "Secondi", quota: 0.6 },
  { categoria: "Contorni", quota: 0.45 },
  { categoria: "Dolci", quota: 0.42 },
];

/**
 * Il fuori carta: righe scritte a mano, che un costo non possono averlo.
 *
 * Servono a far vedere la cosa giusta in Analytics: il rendiconto del cibo
 * tiene il fuori carta in una voce a parte invece di ignorarlo, e senza
 * nemmeno una riga così quella voce non si vede mai.
 */
const FUORI_CARTA: { name: string; priceCents: number }[] = [
  { name: "Barolo 2019 (cantina)", priceCents: 5200 },
  { name: "Bollicine al bicchiere", priceCents: 900 },
  { name: "Acqua e caffè", priceCents: 600 },
  { name: "Amari della casa", priceCents: 1400 },
];

type PiattoDelMenu = { id: string; name: string; priceCents: number; categoria: string };

/** Il prossimo numero libero del giorno, come lo calcola il prodotto. */
async function prossimoRiferimento(
  db: PrismaClient,
  venueId: string,
  prefissi: Map<string, number>,
  giorno: string,
): Promise<string> {
  const prefisso = giorno.replace(/-/g, "");
  let prossimo = prefissi.get(prefisso) ?? 0;
  if (prossimo === 0) {
    /*
      Il massimo già usato più uno, non il conteggio: è la regola di
      `riferimentoDelGiorno` in server/orders.ts, e vale anche qui perché
      `Order.reference` è unico su tutta l'installazione — i due locali della
      demo chiudono conti nello stesso giorno e non devono collidere.
    */
    const delGiorno = await db.order.findMany({
      where: { reference: { startsWith: `${prefisso}-` } },
      select: { reference: true },
    });
    prossimo =
      delGiorno.reduce((m, o) => {
        const n = Number.parseInt(o.reference.slice(prefisso.length + 1), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
      }, 0) + 1;
  }
  prefissi.set(prefisso, prossimo + 1);
  return `${prefisso}-${String(prossimo).padStart(3, "0")}`;
}

/** Le righe di un conto: quello che un tavolo di `coperti` persone ordina. */
function componiConto(
  piatti: PiattoDelMenu[],
  coperti: number,
  r: () => number,
): { menuItemId: string | null; name: string; priceCents: number; quantity: number }[] {
  const righe: { menuItemId: string | null; name: string; priceCents: number; quantity: number }[] = [];

  for (const portata of PORTATE) {
    if (r() >= portata.quota) continue;
    const disponibili = piatti.filter((p) => p.categoria === portata.categoria);
    if (disponibili.length === 0) continue;
    const piatto = scegli(disponibili, r);
    // Non tutti prendono tutto: fra un terzo e tutto il tavolo.
    const quantita = Math.max(1, Math.min(coperti, Math.round(coperti * (0.35 + r() * 0.65))));
    righe.push({ menuItemId: piatto.id, name: piatto.name, priceCents: piatto.priceCents, quantity: quantita });
  }

  if (r() < 0.22) {
    const extra = scegli(FUORI_CARTA, r);
    righe.push({ menuItemId: null, name: extra.name, priceCents: extra.priceCents, quantity: 1 });
  }

  if (righe.length === 0) {
    const piatto = scegli(piatti, r);
    righe.push({ menuItemId: piatto.id, name: piatto.name, priceCents: piatto.priceCents, quantity: coperti });
  }
  return righe;
}

async function piattiDelMenu(db: PrismaClient, venueId: string): Promise<PiattoDelMenu[]> {
  const [categorie, items] = await Promise.all([
    db.menuCategory.findMany({ where: { venueId }, select: { id: true, name: true } }),
    // Un piatto segnato finito non si ordina: `addLine` lo rifiuta, e un conto
    // che lo contiene sarebbe un conto che il prodotto non avrebbe accettato.
    db.menuItem.findMany({
      where: { venueId, available: true },
      select: { id: true, name: true, priceCents: true, categoryId: true },
    }),
  ]);
  const nomeDi = new Map(categorie.map((c) => [c.id, c.name]));
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    priceCents: i.priceCents,
    categoria: i.categoryId ? nomeDi.get(i.categoryId) ?? "" : "",
  }));
}

/**
 * I conti chiusi delle cene passate.
 *
 * È il passo da cui dipendono quasi tutte le caselle vuote: l'incasso in
 * Panoramica, il costo del cibo e il margine per piatto in Analytics, il valore
 * di un coperto usato per dire quanto costano le assenze, la spesa totale nella
 * scheda dell'ospite, i punti della raccolta fedeltà. Nessuno di quei numeri è
 * scritto a mano da nessuna parte: sono tutti la somma di queste righe.
 *
 * Non tutte le cene hanno un conto, e di proposito: un locale che ha appena
 * cominciato a battere i conti su Tavolo ne ha una parte. Le percentuali che
 * Analytics mostra dicono sempre su quanta parte sono misurate, e con il cento
 * per cento dei conti quella distinzione non si vedrebbe mai.
 */
export async function apriEChiudiIConti(db: PrismaClient, venueId: string, prefissi: Map<string, number>) {
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { currency: true, timezone: true },
  });
  const piatti = await piattiDelMenu(db, venueId);
  if (piatti.length === 0) return;

  const cene = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: "COMPLETED",
      seatedAt: { not: null },
      closedAt: { not: null },
      // Chi ha già un conto non ne riceve un altro: chiudere due volte lo
      // stesso tavolo raddoppierebbe l'incasso della serata.
      orders: { none: {} },
    },
    select: {
      id: true,
      guestId: true,
      partySize: true,
      seatedAt: true,
      closedAt: true,
      table: { select: { label: true } },
    },
    orderBy: { startsAt: "asc" },
  });

  let creati = 0;
  for (const b of cene) {
    const r = caso(`conto-${b.id}`);
    // Circa tre cene su quattro passano dalla cassa di Tavolo.
    if (r() > 0.74) continue;

    const righe = componiConto(piatti, b.partySize, r);
    const totale = righe.reduce((s, x) => s + x.priceCents * x.quantity, 0);
    const seatedAt = b.seatedAt!;
    const closedAt = b.closedAt!;
    const riferimento = await prossimoRiferimento(db, venueId, prefissi, dateKeyInVenue(closedAt, venue.timezone));

    await db.order.create({
      data: {
        venueId,
        bookingId: b.id,
        guestId: b.guestId,
        kind: "TABLE",
        status: "COMPLETED",
        reference: riferimento,
        // Il conto si apre quando si ordina, non quando si entra.
        createdAt: new Date(seatedAt.getTime() + fra(r, 6, 22) * MINUTO),
        scheduledAt: seatedAt,
        completedAt: closedAt,
        tableLabel: b.table?.label ?? null,
        currency: venue.currency,
        totalCents: totale,
        /*
          `paymentStatus` resta in attesa: `closeOrder` non lo tocca, perché in
          sala si paga in cassa e Tavolo non vede il pagamento. Scrivere
          «riscosso» qui vorrebbe dire raccontare un incasso registrato che non
          esiste — vedi la nota sui pagamenti in fondo al file.
        */
        OrderItem: { create: righe },
      },
    });
    creati++;
  }

  if (creati > 0) console.log(`   ${creati} conti chiusi sulle cene passate.`);
}

/* -------------------------------------------------------------------------- */
/*  5. La sala di oggi                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Il servizio di adesso: chi è a tavola, chi è in ritardo, chi sta arrivando.
 *
 * La modalità Servizio non ha uno stato suo: deduce tutto dall'ora corrente e
 * dallo stato delle prenotazioni di oggi (`lib/table-status.ts`). Quindi
 * «riempirla» significa una cosa sola: **segnare come sedute le prenotazioni di
 * oggi il cui orario è già passato**, che è quello che farebbe un maître.
 *
 * Il turno lo decide il locale, e questa funzione non lo scavalca: se l'ora
 * corrente non cade in nessun turno — alle nove del mattino, per un bistrot che
 * apre a mezzogiorno — non c'è nessuno da far sedere, e la sala resta vuota
 * perché **è** vuota. Inventare tre tavoli occupati alle 9:05 vorrebbe dire
 * mettere clienti in un locale chiuso.
 */
export async function apparecchiaServizioDiOggi(db: PrismaClient, venueId: string, adesso = new Date()) {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } });
  const giorno = todayInVenue(venue.timezone, adesso);

  const minutiLocali = (() => {
    const parti = new Intl.DateTimeFormat("it-IT", {
      timeZone: venue.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(adesso);
    const [h, m] = parti.split(":").map(Number);
    return h * 60 + m;
  })();

  const turni = await db.shift.findMany({
    where: { venueId, active: true, weekday: adesso.getDay() },
    select: { name: true, startMinute: true, endMinute: true },
  });
  const turnoAperto = turni.find((t) => minutiLocali >= t.startMinute && minutiLocali <= t.endMinute);
  if (!turnoAperto) {
    console.log(`   Sala di oggi: nessun turno aperto adesso (${giorno}), niente da far sedere.`);
    return;
  }

  const inizioGiornata = new Date(adesso.getTime() - (minutiLocali + 1) * MINUTO);
  const prenotazioni = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: "CONFIRMED",
      startsAt: { gte: inizioGiornata, lte: adesso },
    },
    select: { id: true, startsAt: true, guestId: true, partySize: true, table: { select: { label: true } } },
    orderBy: { startsAt: "asc" },
  });
  if (prenotazioni.length === 0) return;

  const giaSedute = await db.booking.count({
    where: { venueId, deletedAt: null, status: "SEATED", startsAt: { gte: inizioGiornata } },
  });
  if (giaSedute >= 3) {
    console.log("   Sala di oggi: già apparecchiata.");
    return;
  }

  const piatti = await piattiDelMenu(db, venueId);
  const prefissi = new Map<string, number>();
  let seduti = 0;
  let inRitardo = 0;

  /*
    Due tavoli restano da segnare, e sono gli ultimi due dell'ora: «in
    ritardo» non è «non arriverà», e il prodotto tiene i due casi separati —
    ma per farlo vedere serve che in sala ci sia qualcuno effettivamente in
    ritardo. Sono gli ultimi due di proposito: un ritardo di dieci minuti è la
    norma, uno di due ore è una riga che nessuno ha chiuso, e la seconda cosa
    la demo la mostra già altrove.
  */
  const daSegnare = new Set(
    prenotazioni
      .filter((b) => adesso.getTime() - b.startsAt.getTime() <= 40 * MINUTO)
      .slice(-2)
      .map((b) => b.id),
  );

  for (const b of prenotazioni) {
    const r = caso(`sala-${b.id}-${giorno}`);

    if (daSegnare.has(b.id) && prenotazioni.length > daSegnare.size) {
      inRitardo++;
      continue;
    }

    const arrivedAt = new Date(b.startsAt.getTime() + fra(r, -5, 12) * MINUTO);
    const seatedAt = new Date(Math.min(adesso.getTime() - MINUTO, arrivedAt.getTime() + fra(r, 0, 6) * MINUTO));
    await db.booking.update({
      where: { id: b.id },
      data: { status: "SEATED", arrivedAt, seatedAt },
    });
    seduti++;

    // Un tavolo seduto da un po' ha già ordinato: il conto è aperto, non chiuso.
    if (piatti.length > 0 && adesso.getTime() - seatedAt.getTime() > 12 * MINUTO) {
      const righe = componiConto(piatti, b.partySize, r).slice(0, 3);
      const totale = righe.reduce((s, x) => s + x.priceCents * x.quantity, 0);
      await db.order.create({
        data: {
          venueId,
          bookingId: b.id,
          guestId: b.guestId,
          kind: "TABLE",
          status: "RECEIVED",
          reference: await prossimoRiferimento(db, venueId, prefissi, giorno),
          createdAt: new Date(seatedAt.getTime() + 8 * MINUTO),
          scheduledAt: seatedAt,
          tableLabel: b.table?.label ?? null,
          totalCents: totale,
          OrderItem: { create: righe },
        },
      });
    }
  }

  console.log(
    `   Sala di oggi (${turnoAperto.name}): ${seduti} tavoli seduti, ${inRitardo} in ritardo da segnare.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  6. La raccolta punti                                                      */
/* -------------------------------------------------------------------------- */

/**
 * I punti dei conti chiusi, con la formula del prodotto.
 *
 * `accreditaPuntiConto` accredita gli **euro interi** del conto moltiplicati
 * per i punti dichiarati dal locale, una volta sola per conto. Qui si fa la
 * stessa cosa sui conti che il seed ha appena chiuso: se la formula cambia,
 * cambia in un posto solo e questa resta l'unica copia da allineare.
 */
export async function accreditaPuntiDaiConti(db: PrismaClient, venueId: string) {
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { loyaltyPointsPerEuro: true, loyaltyPointValueCents: true },
  });
  if (!venue.loyaltyPointsPerEuro || !venue.loyaltyPointValueCents) return;

  const [conti, giaFatti] = await Promise.all([
    db.order.findMany({
      where: { venueId, status: "COMPLETED", guestId: { not: null } },
      select: { id: true, guestId: true, totalCents: true, completedAt: true },
    }),
    db.loyaltyTransaction.findMany({
      where: { venueId, kind: "EARNED", orderId: { not: null } },
      select: { orderId: true },
    }),
  ]);
  const fatti = new Set(giaFatti.map((g) => g.orderId));

  const nuovi: Prisma.LoyaltyTransactionCreateManyInput[] = [];
  for (const o of conti) {
    if (fatti.has(o.id) || !o.guestId) continue;
    const punti = Math.floor(o.totalCents / 100) * venue.loyaltyPointsPerEuro;
    if (punti <= 0) continue;
    nuovi.push({
      venueId,
      guestId: o.guestId,
      orderId: o.id,
      kind: "EARNED",
      points: punti,
      reason: `Conto da ${(o.totalCents / 100).toFixed(2).replace(".", ",")} €`,
      createdAt: o.completedAt ?? new Date(),
    });
  }
  if (nuovi.length === 0) return;

  await db.loyaltyTransaction.createMany({ data: nuovi });
  console.log(`   ${nuovi.length} accrediti punti dai conti chiusi.`);
}

/**
 * Qualche punto speso, perché una raccolta senza riscatti non si capisce.
 *
 * Il controllo che conta è lo stesso di `riscattaPunti`: **il saldo prima del
 * riscatto deve bastare**. Un movimento che porta il saldo sotto zero sarebbe
 * uno sconto regalato da noi, e la scheda dell'ospite mostrerebbe un numero
 * negativo che nessuna schermata sa spiegare.
 */
export async function riscattaQualchePunto(db: PrismaClient, venueId: string) {
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { loyaltyPointValueCents: true },
  });
  const valore = venue.loyaltyPointValueCents;
  if (!valore) return;

  const giaRiscattati = await db.loyaltyTransaction.count({ where: { venueId, kind: "REDEEMED" } });
  if (giaRiscattati > 0) return;

  const saldi = await db.loyaltyTransaction.groupBy({
    by: ["guestId"],
    where: { venueId },
    _sum: { points: true },
  });
  const ricchi = saldi
    .filter((s) => (s._sum.points ?? 0) >= 400)
    .sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0))
    .slice(0, 5);

  let fatti = 0;
  for (const s of ricchi) {
    const conto = await db.order.findFirst({
      where: { venueId, guestId: s.guestId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { id: true, bookingId: true, completedAt: true, totalCents: true },
    });
    if (!conto) continue;

    const r = caso(`punti-${s.guestId}`);
    const punti = fra(r, 2, 4) * 100;
    const scontoCents = punti * valore;
    // Uno sconto più grande del conto non è uno sconto: è un credito.
    if (scontoCents > conto.totalCents) continue;

    await db.loyaltyTransaction.create({
      data: {
        venueId,
        guestId: s.guestId,
        orderId: conto.id,
        bookingId: conto.bookingId,
        kind: "REDEEMED",
        points: -punti,
        amountCents: scontoCents,
        reason: `Sconto di ${(scontoCents / 100).toFixed(2).replace(".", ",")} €`,
        createdAt: conto.completedAt ?? new Date(),
      },
    });
    fatti++;
  }
  if (fatti > 0) console.log(`   ${fatti} riscatti di punti su conti chiusi.`);
}

/** `Guest.loyaltyPoints` è una copia: si riscrive dalla somma delle righe. */
export async function allineaSaldiPunti(db: PrismaClient, venueId: string) {
  const saldi = await db.loyaltyTransaction.groupBy({
    by: ["guestId"],
    where: { venueId },
    _sum: { points: true },
  });
  const conPunti = new Set(saldi.map((s) => s.guestId));

  await aBlocchi(saldi, 40, (s) =>
    db.guest.update({ where: { id: s.guestId }, data: { loyaltyPoints: s._sum.points ?? 0 } }),
  );
  // Chi non ha movimenti ha zero punti, non quello che c'era scritto prima.
  await db.guest.updateMany({
    where: { venueId, id: { notIn: [...conPunti] }, loyaltyPoints: { not: 0 } },
    data: { loyaltyPoints: 0 },
  });
}

/* -------------------------------------------------------------------------- */
/*  7. Le gift card                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Una gift card scalata da un conto vero.
 *
 * Serve a far vedere la distinzione su cui la pagina insiste: i soldi di una
 * gift card sono **già** incassati, e scalarla da un conto non aggiunge
 * incasso — sposta il momento in cui quel denaro è entrato. Con zero utilizzi
 * quella frase resta una spiegazione teorica.
 */
export async function scalaUnaGiftCard(db: PrismaClient, venueId: string) {
  /*
    Una volta e basta. Il controllo è sul locale, non sulla singola carta:
    guardando solo la carta, ogni esecuzione del seed ne consumava una nuova
    finché non finivano — e «ripetibile» significa che la seconda esecuzione
    non deve cambiare niente.
  */
  const giaUsate = await db.giftCardRedemption.count({ where: { GiftCard: { venueId } } });
  if (giaUsate > 0) return;

  const carta = await db.giftCard.findFirst({
    where: {
      venueId,
      status: "ACTIVE",
      balanceCents: { gte: 5000 },
      code: { startsWith: "REGALO-DEMO" },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!carta) return;

  const conto = await db.order.findFirst({
    where: { venueId, status: "COMPLETED", totalCents: { gte: 5000 } },
    orderBy: { completedAt: "desc" },
    select: { id: true, bookingId: true, completedAt: true, totalCents: true },
  });
  if (!conto) return;

  const scalato = Math.min(carta.balanceCents, Math.round(conto.totalCents * 0.6 / 100) * 100);
  if (scalato <= 0) return;

  await db.$transaction([
    db.giftCardRedemption.create({
      data: {
        giftCardId: carta.id,
        orderId: conto.id,
        bookingId: conto.bookingId,
        amountCents: scalato,
        reason: "Scalata dal conto al tavolo",
        createdAt: conto.completedAt ?? new Date(),
      },
    }),
    db.giftCard.update({
      where: { id: carta.id },
      data: {
        balanceCents: carta.balanceCents - scalato,
        ...(carta.balanceCents - scalato === 0 ? { status: "EXHAUSTED" as const } : {}),
      },
    }),
  ]);
  console.log(`   Gift card ${carta.code}: ${(scalato / 100).toFixed(2)} € scalati da un conto.`);
}

/* -------------------------------------------------------------------------- */
/*  8. I coupon                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Tre coupon che raccontano tre casi diversi, e qualche utilizzo vero.
 *
 * Un coupon senza utilizzi mostra «usato 0 volte» su ogni riga, e il modulo
 * sembra una cosa che nessuno ha mai provato. Gli utilizzi qui rispettano le
 * regole del coupon — la spesa minima, il giorno della settimana, il tetto per
 * cliente — perché un utilizzo che il prodotto avrebbe rifiutato è un dato
 * corrotto, non un dato di prova.
 */
export async function creaCouponDemo(db: PrismaClient, venueId: string) {
  const coda = venueId.slice(-4).toUpperCase();
  const catalogo = [
    {
      code: `BENVENUTO-${coda}`,
      name: "Benvenuto",
      description: "Il 10% per chi viene la prima volta.",
      kind: "PERCENT" as const,
      value: 10,
      category: "NEW_CUSTOMER" as const,
      minSpendCents: null as number | null,
      validWeekdays: [] as number[],
    },
    {
      code: `MARTEDI-${coda}`,
      name: "Martedì da noi",
      description: "Il 15% il martedì, da 40 € di conto.",
      kind: "PERCENT" as const,
      value: 15,
      category: "GENERIC" as const,
      minSpendCents: 4000,
      validWeekdays: [2],
    },
    {
      code: `COMPLEANNO-${coda}`,
      name: "Dolce di compleanno",
      description: "Il dolce lo offriamo noi.",
      kind: "FREE_ITEM" as const,
      value: 0,
      category: "BIRTHDAY" as const,
      minSpendCents: null,
      validWeekdays: [],
    },
  ];

  for (const c of catalogo) {
    const gia = await db.coupon.findUnique({ where: { code: c.code }, select: { id: true } });
    if (gia) continue;
    await db.coupon.create({
      data: {
        venueId,
        code: c.code,
        name: c.name,
        description: c.description,
        kind: c.kind,
        value: c.value,
        category: c.category,
        status: "ACTIVE",
        minSpendCents: c.minSpendCents,
        validWeekdays: c.validWeekdays,
        freeItem: c.kind === "FREE_ITEM" ? "Un dolce a scelta" : null,
        maxPerGuest: 1,
      },
    });
  }
}

/**
 * Gli utilizzi: un coupon si segna al tavolo, sul conto di quella serata.
 *
 * `Coupon.redemptionCount` è una copia del conteggio delle righe, e qui si
 * riscrive dalle righe — non si incrementa a mano, che è il modo in cui una
 * copia comincia a mentire.
 */
export async function segnaCouponUsati(db: PrismaClient, venueId: string) {
  const coupon = await db.coupon.findMany({
    /*
      Solo i coupon **aperti a tutti**. Quelli con un `guestId` sono
      personali — il codice che il portale Wi-Fi manda a una persona sola — e
      farli usare da un altro cliente è un utilizzo che `redeemCoupon`
      rifiuterebbe: `couponUsability` controlla proprio quel vincolo. Un
      utilizzo che il prodotto non avrebbe accettato non è un dato di prova, è
      un dato corrotto.

      La categoria Wi-Fi resta fuori comunque: quei codici nascono intestati a
      chi si è collegato, e li usa lui.
    */
    where: { venueId, status: "ACTIVE", guestId: null, category: { not: "WIFI" } },
    select: {
      id: true,
      code: true,
      kind: true,
      value: true,
      minSpendCents: true,
      validWeekdays: true,
      maxRedemptions: true,
      validFrom: true,
      validUntil: true,
    },
  });
  if (coupon.length === 0) return;

  const conti = await db.order.findMany({
    where: { venueId, status: "COMPLETED", guestId: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 120,
    select: { id: true, bookingId: true, guestId: true, totalCents: true, completedAt: true },
  });

  let scritti = 0;
  for (const c of coupon) {
    const gia = await db.couponRedemption.count({ where: { couponId: c.id } });
    if (gia > 0) continue;

    const r = caso(`coupon-${c.id}`);
    const tetto = Math.min(c.maxRedemptions ?? 5, fra(caso(`quanti-${c.id}`), 2, 5));
    const usatiDa = new Set<string>();
    for (const conto of conti) {
      if (usatiDa.size >= tetto) break;
      if (!conto.guestId || usatiDa.has(conto.guestId)) continue;
      if (c.minSpendCents != null && conto.totalCents < c.minSpendCents) continue;
      const quando = conto.completedAt;
      if (!quando) continue;
      // Le stesse tre condizioni che il prodotto verifica prima di accettare:
      // finestra di validità, giorno della settimana, spesa minima.
      if (c.validFrom && quando < c.validFrom) continue;
      if (c.validUntil && quando > c.validUntil) continue;
      if (c.validWeekdays.length > 0 && !c.validWeekdays.includes(quando.getDay())) continue;
      if (r() < 0.5) continue;

      await db.couponRedemption.create({
        data: {
          couponId: c.id,
          venueId,
          guestId: conto.guestId,
          bookingId: conto.bookingId,
          // Quanto è valso lo sconto su quel conto: per il piatto omaggio non
          // si può sapere senza sapere quale piatto, e resta nullo.
          amountCents: c.kind === "PERCENT" ? Math.round((conto.totalCents * c.value) / 100) : null,
          redeemedAt: quando,
        },
      });
      usatiDa.add(conto.guestId);
      scritti++;
    }
  }

  // I contatori, riscritti dal conteggio delle righe — su **tutti** i coupon
  // del locale, personali compresi: una copia si riallinea per intero o non
  // si riallinea.
  const tutti = await db.coupon.findMany({ where: { venueId }, select: { id: true, redemptionCount: true } });
  for (const c of tutti) {
    const quanti = await db.couponRedemption.count({ where: { couponId: c.id, deletedAt: null } });
    if (quanti !== c.redemptionCount) {
      await db.coupon.update({ where: { id: c.id }, data: { redemptionCount: quanti } });
    }
  }
  if (scritti > 0) console.log(`   ${scritti} coupon usati al tavolo.`);
}

/* -------------------------------------------------------------------------- */
/*  9. La spesa degli ospiti                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `Guest.totalSpend`: la somma dei conti chiusi di quell'ospite.
 *
 * Era il caso più grave trovato aprendo le schermate: l'elenco ospiti mostrava
 * «1.118,00 €» accanto a un nome, e quella cifra era un numero scritto a caso
 * da una vecchia versione del seed. La spesa media in Analytics ci si appoggia
 * (`server/analytics.ts`), quindi anche quella era inventata.
 *
 * Da qui in poi è un conteggio: chi non ha conti chiusi ha speso zero, e nella
 * colonna si legge una lineetta — che è la verità.
 */
export async function allineaSpesaOspiti(db: PrismaClient, venueId: string) {
  const somme = await db.order.groupBy({
    by: ["guestId"],
    where: { venueId, status: "COMPLETED", guestId: { not: null } },
    _sum: { totalCents: true },
  });

  await aBlocchi(somme, 40, (s) =>
    db.guest.update({
      where: { id: s.guestId! },
      data: { totalSpend: ((s._sum.totalCents ?? 0) / 100).toFixed(2) },
    }),
  );

  const conConti = somme.map((s) => s.guestId!).filter(Boolean);
  const azzerati = await db.guest.updateMany({
    where: { venueId, id: { notIn: conConti }, totalSpend: { not: 0 } },
    data: { totalSpend: 0 },
  });

  console.log(
    `   Spesa totale ricalcolata: ${somme.length} ospiti dai conti chiusi, ${azzerati.count} riportati a zero.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  10. I sondaggi                                                             */
/* -------------------------------------------------------------------------- */

const COMMENTI_PROMOTORI = [
  "Serata perfetta, la guancia al Barolo era da ricordare.",
  "Accoglienza impeccabile e vini consigliati bene.",
  "Ci siamo sentiti a casa. Torniamo con i miei genitori.",
  "Il servizio ha ritmo giusto: mai fretta, mai attese.",
  "Cucina precisa e conto onesto. Rara combinazione a Milano.",
];
const COMMENTI_PASSIVI = [
  "Bene ma un po' rumoroso al piano di sopra.",
  "Buono tutto, l'attesa fra primo e secondo un po' lunga.",
  "Piatti giusti, sala un filo fredda.",
];
const COMMENTI_DETRATTORI = [
  "Prenotato per le 20:30, seduti alle 21:00 senza una parola.",
  "Il secondo è arrivato tiepido e nessuno se n'è accorto.",
];

/**
 * Il sondaggio del giorno dopo, con le risposte.
 *
 * Il prodotto lo manda da solo alle prenotazioni chiuse (`sendDueSurveyRequests`
 * gira dal cron), ma su un database di prova quel cron non è mai girato: la
 * scheda «Cosa pensano gli ospiti» diceva «2 risposte» su trecento cene.
 *
 * I voti non sono distribuiti a caso: la maggioranza sono nove e dieci, come in
 * un locale che funziona, con una coda di voti bassi che serve a far vedere che
 * il prodotto sa mostrare anche quelli — un NPS di +100 su tre risposte non
 * racconta nulla di utile a nessuno.
 */
export async function creaSondaggiDemo(db: PrismaClient, venueId: string) {
  const cene = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      status: "COMPLETED",
      closedAt: { not: null, gte: new Date(Date.now() - 60 * GIORNO) },
      guestId: { not: null },
      guest: { email: { not: null } },
      Survey: null,
    },
    select: { id: true, guestId: true, closedAt: true },
    orderBy: { closedAt: "desc" },
    take: 260,
  });
  if (cene.length === 0) return;

  let inviati = 0;
  let risposti = 0;
  for (const b of cene) {
    const r = caso(`sondaggio-${b.id}`);
    // Non a tutti: chi non ha lasciato l'indirizzo, o chi è passato prima che
    // il locale accendesse la funzione, non ha ricevuto niente.
    if (r() > 0.62) continue;

    const sentAt = new Date(b.closedAt!.getTime() + fra(r, 14, 22) * ORA);
    if (sentAt.getTime() > Date.now()) continue;

    const rispondera = r() < 0.58;
    const dado = r();
    const voto = dado < 0.5 ? 10 : dado < 0.72 ? 9 : dado < 0.84 ? 8 : dado < 0.91 ? 7 : dado < 0.96 ? 6 : fra(r, 2, 5);
    const sentimento = voto >= 9 ? "PROMOTER" : voto >= 7 ? "PASSIVE" : "DETRACTOR";
    const listaCommenti =
      sentimento === "PROMOTER" ? COMMENTI_PROMOTORI : sentimento === "PASSIVE" ? COMMENTI_PASSIVI : COMMENTI_DETRATTORI;
    const conCommento = r() < 0.45;
    const respondedAt = new Date(sentAt.getTime() + fra(r, 20, 700) * MINUTO);

    await db.survey.create({
      data: {
        venueId,
        bookingId: b.id,
        guestId: b.guestId,
        token: `demo-${b.id}`,
        sentAt,
        respondedAt: rispondera ? respondedAt : null,
        ...(rispondera
          ? {
              SurveyResponse: {
                create: {
                  npsScore: voto,
                  sentiment: sentimento,
                  comment: conCommento ? scegli(listaCommenti, r) : null,
                  recommend: voto >= 7,
                  createdAt: respondedAt,
                },
              },
            }
          : {}),
      },
    });
    inviati++;
    if (rispondera) risposti++;
  }

  if (inviati > 0) console.log(`   ${inviati} sondaggi inviati, ${risposti} con risposta.`);
}

/* -------------------------------------------------------------------------- */
/*  11. La lista d'attesa                                                     */
/* -------------------------------------------------------------------------- */

const NOMI_CODA = [
  "Famiglia Bertoldi",
  "Gruppo Sartori",
  "Sig. Maggi",
  "Coppia Neri",
  "Famiglia Pozzi",
  "Gruppo Landi",
  "Sig.ra Ravelli",
  "Tavolo Fumagalli",
  "Famiglia Corti",
  "Gruppo Zanetti",
  "Sig. Battaglia",
  "Coppia Verdi",
];

/**
 * La coda di adesso e la coda di ieri.
 *
 * Due cose diverse, e servono entrambe. Le righe **aperte** riempiono la
 * schermata Attesa e la colonna in Servizio; le righe **chiuse** sono l'unica
 * base su cui Analytics può dire se tenere una lista serve a qualcosa: chi sta
 * aspettando adesso non è né un successo né una perdita.
 *
 * Prima cosa: le righe rimaste aperte per giorni si chiudono. Erano il residuo
 * di qualche prova a mano, e la schermata giustamente le segnalava — «due
 * persone in lista da più di quattro ore» — ma su una demo quel richiamo è la
 * prima cosa che si legge, e parla di un problema che non è del prodotto.
 */
export async function rinfrescaListaAttesa(db: PrismaClient, venueId: string, adesso = new Date()) {
  const scadute = await db.waitlistEntry.findMany({
    where: {
      venueId,
      status: { in: ["WAITING", "NOTIFIED", "CONFIRMED"] },
      createdAt: { lt: new Date(adesso.getTime() - 4 * ORA) },
    },
    select: { id: true, createdAt: true },
  });
  for (const e of scadute) {
    // Se n'è andata: la riga resta nello storico, come farebbe la sala
    // chiudendola a fine serata.
    const uscita = new Date(e.createdAt.getTime() + fra(caso(`uscita-${e.id}`), 25, 70) * MINUTO);
    await db.waitlistEntry.update({
      where: { id: e.id },
      data: { status: "LEFT", cancelledAt: uscita },
    });
  }
  if (scadute.length > 0) console.log(`   ${scadute.length} righe di attesa dimenticate: chiuse.`);

  const ospiti = await db.guest.findMany({ where: { venueId }, select: { id: true, firstName: true, lastName: true }, take: 40 });

  /* Lo storico: due settimane di code, così la conversione si può calcolare. */
  const storiche = await db.waitlistEntry.count({
    where: { venueId, status: { in: ["SEATED", "LEFT", "NO_SHOW"] } },
  });
  if (storiche < 8) {
    for (let g = 1; g <= 12; g++) {
      const r = caso(`coda-${venueId}-${g}`);
      const quante = fra(r, 1, 2);
      for (let k = 0; k < quante; k++) {
        const giorno = new Date(adesso.getTime() - g * GIORNO);
        giorno.setHours(20, fra(r, 0, 55), 0, 0);
        const partySize = fra(r, 2, 6);
        const attesa = fra(r, 9, 42);
        const dado = r();
        const ospite = r() < 0.5 ? scegli(ospiti, r) : null;

        const stato = dado < 0.66 ? "SEATED" : dado < 0.88 ? "LEFT" : "NO_SHOW";
        const creata = await db.waitlistEntry.create({
          data: {
            venueId,
            guestId: ospite?.id ?? null,
            guestName: ospite ? `${ospite.firstName} ${ospite.lastName ?? ""}`.trim() : scegli(NOMI_CODA, r),
            partySize,
            expectedWaitMin: fra(r, 15, 40),
            status: stato,
            position: k + 1,
            createdAt: giorno,
            ...(stato === "SEATED"
              ? { seatedAt: new Date(giorno.getTime() + attesa * MINUTO) }
              : { cancelledAt: new Date(giorno.getTime() + (attesa + fra(r, 5, 25)) * MINUTO) }),
          },
          select: { id: true, seatedAt: true, cancelledAt: true },
        });
        /*
          `updatedAt` lo scrive Prisma da sé, e Analytics filtra le righe
          chiuse proprio su quello: senza questa correzione una coda di dieci
          giorni fa risulterebbe chiusa oggi, e il conto del periodo sarebbe
          sbagliato. Va fatto in SQL perché `@updatedAt` sovrascrive.
        */
        await db.$executeRawUnsafe(
          `UPDATE "WaitlistEntry" SET "updatedAt" = COALESCE("seatedAt", "cancelledAt", "createdAt") WHERE id = $1`,
          creata.id,
        );
      }
    }
    console.log("   Storico della lista d'attesa: due settimane di code chiuse.");
  }

  /*
    La coda di adesso: quattro righe nei quattro stati che la sala vede.

    Una per una, e ognuna solo se non c'è già: la riga avvisata **scade da
    sola** dopo dieci minuti (`OFFER_TTL_MIN`, il tavolo non si tiene per
    sempre), quindi una guardia sul totale delle righe attive impedirebbe per
    sempre di rimetterla. Con la guardia per nome, rilanciare il seed
    ricostruisce solo quello che manca.
  */
  const r = caso(`coda-adesso-${venueId}-${todayInVenue("Europe/Rome", adesso)}`);
  const adessoMeno = (min: number) => new Date(adesso.getTime() - min * MINUTO);

  const inCoda: Prisma.WaitlistEntryUncheckedCreateInput[] = [
    {
      venueId,
      guestName: "Famiglia Bertoldi",
      phone: "+39 335 8842910",
      partySize: 4,
      expectedWaitMin: 25,
      status: "WAITING",
      position: 1,
      notes: "Un seggiolone",
      createdAt: adessoMeno(9),
    },
    {
      venueId,
      guestName: "Gruppo Sartori",
      phone: "+39 348 2210554",
      partySize: 6,
      expectedWaitMin: 40,
      status: "WAITING",
      position: 2,
      createdAt: adessoMeno(21),
    },
    {
      venueId,
      guestName: "Sig.ra Ravelli",
      phone: "+39 366 7741002",
      partySize: 2,
      expectedWaitMin: 20,
      status: "NOTIFIED",
      position: 3,
      createdAt: adessoMeno(26),
      notifiedAt: adessoMeno(2),
      // Dieci minuti dall'avviso: la finestra che usa il prodotto.
      offerExpiresAt: new Date(adesso.getTime() + 8 * MINUTO),
      offerSentVia: "SMS",
      offerToken: `demo-${venueId.slice(-6)}-${fra(r, 100000, 999999)}`,
    },
    {
      venueId,
      guestName: "Coppia Neri",
      phone: "+39 320 5519876",
      partySize: 2,
      expectedWaitMin: 15,
      status: "CONFIRMED",
      position: 4,
      createdAt: adessoMeno(34),
      notifiedAt: adessoMeno(7),
      confirmedAt: adessoMeno(3),
    },
  ];

  let messe = 0;
  for (const riga of inCoda) {
    const gia = await db.waitlistEntry.count({
      where: {
        venueId,
        guestName: riga.guestName,
        status: { in: ["WAITING", "NOTIFIED", "CONFIRMED"] },
      },
    });
    if (gia > 0) continue;
    await db.waitlistEntry.create({ data: riga });
    messe++;
  }
  if (messe === 0) return;

  console.log(`   Coda di adesso: ${messe} ${messe === 1 ? "riga rimessa" : "righe rimesse"} in lista.`);
}

/* -------------------------------------------------------------------------- */
/*  11-bis. Un tavolo a chi non ce l'ha                                       */
/* -------------------------------------------------------------------------- */

/**
 * Dà un tavolo alle prenotazioni che non ne hanno uno.
 *
 * «Tavolo da assegnare» è uno stato legittimo del prodotto: una prenotazione
 * presa al telefono può restare senza tavolo finché chi accoglie non decide.
 * Ma in produzione **tutte** le prenotazioni di Aurora Bistrot erano senza —
 * erano nate quando quel locale non aveva un solo tavolo — e la pianta della
 * sala mostrava diciassette tavoli tutti liberi mentre la giornata era piena.
 * Una demo che mostra il contrario di quello che dice non serve a nessuno.
 *
 * Due cose che questa funzione **non** fa, di proposito:
 *
 * - **non riscrive un tavolo già scelto.** Se qualcuno l'ha assegnato a mano
 *   durante una dimostrazione, resta suo;
 * - **non mette due prenotazioni sullo stesso tavolo alla stessa ora.** La
 *   sovrapposizione la calcola `overlaps` del motore di disponibilità, la
 *   stessa che usa il prodotto per rifiutare una prenotazione: due formule per
 *   la stessa domanda sono due risposte diverse che aspettano di divergere.
 *
 * Sceglie il tavolo **più piccolo che basta**, come farebbe un maître: mettere
 * due persone al tavolo da sei significa non poterci più mettere sei.
 */
export async function daiUnTavoloAChiNonCeLHa(db: PrismaClient, venueId: string, adesso = new Date()) {
  const inizio = new Date(adesso);
  inizio.setHours(0, 0, 0, 0);

  const [tavoli, prenotazioni] = await Promise.all([
    db.table.findMany({
      where: { venueId, active: true },
      orderBy: [{ seats: "asc" }, { label: "asc" }],
      select: { id: true, seats: true },
    }),
    db.booking.findMany({
      where: {
        venueId,
        deletedAt: null,
        startsAt: { gte: inizio },
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, durationMin: true, partySize: true, tableId: true },
    }),
  ]);
  if (tavoli.length === 0) return;

  // Quello che è già occupato, tavolo per tavolo. Si parte dalle assegnazioni
  // esistenti, e ogni scelta nuova entra qui: così la seconda prenotazione
  // delle 20:00 non finisce sullo stesso tavolo della prima.
  const occupato = new Map<string, { startsAt: Date; durationMin: number }[]>();
  for (const b of prenotazioni) {
    if (!b.tableId) continue;
    const righe = occupato.get(b.tableId) ?? [];
    righe.push({ startsAt: b.startsAt, durationMin: b.durationMin });
    occupato.set(b.tableId, righe);
  }

  let dati = 0;
  for (const b of prenotazioni) {
    if (b.tableId) continue;

    const scelto = tavoli.find((t) => {
      if (t.seats < b.partySize) return false;
      const righe = occupato.get(t.id) ?? [];
      return !righe.some((r) => overlaps(b.startsAt, b.durationMin, r.startsAt, r.durationMin));
    });
    // Nessun tavolo che regga: resta «da assegnare», che è la verità. Una
    // tavolata da dodici su tavoli da sei si unisce a mano, e il prodotto ha
    // una funzione sua per farlo.
    if (!scelto) continue;

    await db.booking.update({ where: { id: b.id }, data: { tableId: scelto.id } });
    const righe = occupato.get(scelto.id) ?? [];
    righe.push({ startsAt: b.startsAt, durationMin: b.durationMin });
    occupato.set(scelto.id, righe);
    dati++;
  }

  if (dati > 0) console.log(`   ${dati} prenotazioni senza tavolo: assegnate.`);
}

/* -------------------------------------------------------------------------- */
/*  12. Chi c'è in sala stasera                                               */
/* -------------------------------------------------------------------------- */

/**
 * I tavoli assegnati al personale, per la giornata di oggi.
 *
 * La pianta della sala diceva «0 di 17 tavoli assegnati»: non manca una
 * funzione, mancava la riga. L'assegnazione rispetta le capacità dichiarate su
 * ogni persona — il sommelier non diventa responsabile di tavolo perché serviva
 * un nome — e si ferma dove si fermerebbe un maître: un responsabile per
 * tavolo, un aiuto sui tavoli grandi.
 */
export async function assegnaPersonaleDiOggi(db: PrismaClient, venueId: string, adesso = new Date()) {
  const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { timezone: true } });
  const giorno = todayInVenue(venue.timezone, adesso);
  // La stessa normalizzazione del prodotto: mezzanotte UTC del giorno.
  const data = new Date(`${giorno}T00:00:00.000Z`);

  const [turni, tavoli, squadra] = await Promise.all([
    db.shift.findMany({
      where: { venueId, active: true, weekday: adesso.getDay() },
      orderBy: { startMinute: "asc" },
      select: { name: true },
    }),
    db.table.findMany({ where: { venueId, active: true }, orderBy: { label: "asc" }, select: { id: true, seats: true } }),
    db.waiter.findMany({ where: { venueId, status: "ACTIVE" }, select: { id: true, capabilities: true } }),
  ]);
  if (tavoli.length === 0 || squadra.length === 0) return;

  const conCapacita = (c: StaffCapability) => squadra.filter((w) => w.capabilities.includes(c));
  const responsabili = conCapacita("TABLE_RESPONSIBLE");
  const aiuti = conCapacita("TABLE_SUPPORT");
  if (responsabili.length === 0) return;

  const nomiTurni = [...new Set(turni.map((t) => t.name))];
  const righe: Prisma.StaffAssignmentCreateManyInput[] = [];
  for (const servizio of nomiTurni.length > 0 ? nomiTurni : ["Cena"]) {
    tavoli.forEach((t, i) => {
      righe.push({
        venueId,
        waiterId: responsabili[i % responsabili.length].id,
        date: data,
        service: servizio,
        scope: "TABLE",
        tableId: t.id,
        assignmentType: "TABLE_RESPONSIBLE",
      });
      // L'aiuto solo dove serve: sui tavoli da sei in su.
      if (aiuti.length > 0 && t.seats >= 6) {
        righe.push({
          venueId,
          waiterId: aiuti[i % aiuti.length].id,
          date: data,
          service: servizio,
          scope: "TABLE",
          tableId: t.id,
          assignmentType: "TABLE_SUPPORT",
        });
      }
    });
  }

  const esito = await db.staffAssignment.createMany({ data: righe, skipDuplicates: true });
  if (esito.count > 0) console.log(`   ${esito.count} assegnazioni di tavolo per oggi.`);
}

/* -------------------------------------------------------------------------- */
/*  13. La campagna                                                           */
/* -------------------------------------------------------------------------- */

/**
 * La campagna già inviata: i messaggi che la compongono e le prenotazioni che
 * ha portato.
 *
 * Il seed scriveva `sentCount: 142` e `openedCount: 81` su un locale con
 * sessanta ospiti: due numeri inventati, e per di più impossibili. Qui i due
 * contatori diventano il conteggio dei `MessageLog` che esistono davvero, e le
 * aperture il conteggio di quelli con una data di apertura.
 *
 * L'attribuzione delle prenotazioni funziona come nel prodotto: si contano
 * quelle nate dal link della campagna entro trenta giorni dall'invio, quindi
 * servono `Booking.campaignId` **e** un `createdAt` dentro la finestra.
 */
export async function sistemaCampagnaDemo(db: PrismaClient, venueId: string) {
  const campagna = await db.campaign.findFirst({
    where: { venueId, status: "SENT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, subject: true, name: true },
  });
  if (!campagna) return;

  const giaInviati = await db.messageLog.count({ where: { campaignId: campagna.id } });
  const inviata = new Date(Date.now() - 12 * GIORNO);

  if (giaInviati === 0) {
    const destinatari = await db.guest.findMany({
      where: { venueId, marketingOptIn: true, email: { not: null } },
      select: { id: true, email: true },
    });
    if (destinatari.length === 0) return;

    const righe: Prisma.MessageLogCreateManyInput[] = destinatari.map((g, i) => {
      const r = caso(`invio-${campagna.id}-${g.id}`);
      const aperta = r() < 0.57;
      const createdAt = new Date(inviata.getTime() + i * MINUTO);
      return {
        venueId,
        campaignId: campagna.id,
        guestId: g.id,
        kind: "campaign",
        channel: "EMAIL" as const,
        toAddress: g.email!,
        subject: campagna.subject,
        status: "DELIVERED" as const,
        createdAt,
        sentAt: createdAt,
        deliveredAt: new Date(createdAt.getTime() + fra(r, 2, 40) * 1000),
        // L'apertura la registra il fornitore con un webhook: qui è la stessa
        // informazione, sulla riga a cui appartiene.
        ...(aperta ? { providerId: `demo-open-${g.id.slice(-8)}` } : {}),
      };
    });
    await db.messageLog.createMany({ data: righe });

    const aperte = righe.filter((x) => x.providerId).length;
    await db.campaign.update({
      where: { id: campagna.id },
      data: { sentCount: righe.length, openedCount: aperte },
    });
    console.log(`   Campagna «${campagna.name}»: ${righe.length} invii veri, ${aperte} aperture.`);
  }

  /* Le prenotazioni arrivate dal link, se non ce ne sono già. */
  const giaAttribuite = await db.booking.count({ where: { venueId, campaignId: campagna.id } });
  if (giaAttribuite > 0) return;

  const candidate = await db.booking.findMany({
    where: {
      venueId,
      deletedAt: null,
      campaignId: null,
      source: { in: ["WIDGET", "SOCIAL"] },
      startsAt: { gte: new Date() },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    orderBy: { startsAt: "asc" },
    take: 9,
    select: { id: true },
  });
  for (const [i, b] of candidate.entries()) {
    await db.booking.update({
      where: { id: b.id },
      data: {
        campaignId: campagna.id,
        // Nata dopo l'email, dentro la finestra di attribuzione.
        createdAt: new Date(inviata.getTime() + (i + 1) * 8 * ORA),
      },
    });
  }
  if (candidate.length > 0) console.log(`   ${candidate.length} prenotazioni attribuite alla campagna.`);
}

/* -------------------------------------------------------------------------- */
/*  14. Le esperienze                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Il programma delle serate: una passata, una in arrivo, col link ai biglietti.
 *
 * `Experience.ticketUrl` esisteva e nessuno lo compilava, quindi ogni serata
 * mostrava «nessun link ai biglietti» — che è il caso peggiore da far vedere,
 * perché è l'unico modo in cui questa funzione arriva a fare qualcosa.
 *
 * I **biglietti** invece restano zero, di proposito: vedi la nota in fondo.
 */
export async function arricchisciEsperienze(db: PrismaClient, venueId: string) {
  const esistenti = await db.experience.findMany({
    where: { venueId },
    select: { id: true, slug: true, ticketUrl: true, startsAt: true },
  });

  for (const e of esistenti) {
    if (e.ticketUrl) continue;
    await db.experience.update({
      where: { id: e.id },
      data: { ticketUrl: `https://biglietti.example.it/${e.slug}` },
    });
  }

  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { kind: true },
  });

  const passata = {
    title: venue.kind === "BEACH_CLUB" ? "Notte di San Lorenzo in spiaggia" : "Serata Piemonte: sei calici, sei piatti",
    slug: venue.kind === "BEACH_CLUB" ? "notte-san-lorenzo" : "serata-piemonte",
    description:
      venue.kind === "BEACH_CLUB"
        ? "Lettini rivolti al mare, cena leggera e stelle cadenti."
        : "Sei calici in abbinamento, raccontati dal produttore.",
    startsAt: new Date(Date.now() - 11 * GIORNO),
    durataOre: 3,
    capacity: venue.kind === "BEACH_CLUB" ? 90 : 30,
    priceCents: venue.kind === "BEACH_CLUB" ? 4500 : 7500,
  };

  if (!esistenti.some((e) => e.slug === passata.slug)) {
    const inizio = new Date(passata.startsAt);
    inizio.setHours(20, 0, 0, 0);
    await db.experience.create({
      data: {
        venueId,
        title: passata.title,
        slug: passata.slug,
        description: passata.description,
        startsAt: inizio,
        endsAt: new Date(inizio.getTime() + passata.durataOre * ORA),
        capacity: passata.capacity,
        priceCents: passata.priceCents,
        published: true,
        ticketUrl: `https://biglietti.example.it/${passata.slug}`,
      },
    });
    console.log(`   Esperienza passata aggiunta: «${passata.title}».`);
  }
}

/* -------------------------------------------------------------------------- */
/*  15. Il Wi-Fi                                                              */
/* -------------------------------------------------------------------------- */

/**
 * I contatti raccolti dal portale, con quello che il portale scrive insieme.
 *
 * Non basta la riga del contatto: `registraLead` scrive anche i due consensi
 * (privacy e marketing) e, se il locale ha acceso lo sconto automatico, il
 * coupon di quel contatto. Creare solo il primo pezzo darebbe una pagina Wi-Fi
 * con dieci contatti e zero sconti emessi, cioè un modulo a metà.
 *
 * Il numero che conta su quella pagina è «poi venuti a mangiare», e lo si
 * ottiene solo collegando alcuni contatti a un ospite che ha prenotazioni: per
 * questo una parte dei contatti sono persone già in archivio.
 */
export async function creaContattiWifiDemo(db: PrismaClient, venueId: string) {
  const venue = await db.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { wifiSetupAt: true, wifiAutoCouponEnabled: true, wifiAutoCouponPercent: true, wifiAutoCouponDays: true },
  });
  if (!venue.wifiSetupAt) return;

  // Metà dal proprio archivio: sono quelli che poi risultano «venuti».
  // In ordine, perché due esecuzioni scelgano le stesse persone.
  const ospiti = await db.guest.findMany({
    where: { venueId, email: { not: null }, bookings: { some: { deletedAt: null } } },
    orderBy: { email: "asc" },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    take: 6,
  });
  const nuovi = [
    { name: "Ilaria Bosisio", email: "ilaria.bosisio@example.it" },
    { name: "Paolo Restelli", email: "paolo.restelli@example.it" },
    { name: "Sara Dozio", email: "sara.dozio@example.it" },
    { name: "Nicola Bertone", email: "nicola.bertone@example.it" },
    { name: "Greta Marchesi", email: "greta.marchesi@example.it" },
  ];

  /*
    Ogni contatto ha un ospite. Non è una scelta di comodo: `registraLead`
    chiama `trovaOCreaOspite` prima di scrivere qualunque cosa, quindi nel
    prodotto un contatto Wi-Fi **è** un ospite in archivio — e il coupon che
    riceve è intestato a lui. Una riga senza ospite sarebbe uno stato che il
    portale non produce, e il suo coupon risulterebbe usabile da chiunque.
  */
  type Contatto = { guestId: string; name: string; email: string; phone: string | null };
  const contatti: Contatto[] = ospiti.map((g) => ({
    guestId: g.id,
    name: `${g.firstName} ${g.lastName ?? ""}`.trim(),
    email: g.email!,
    phone: g.phone,
  }));

  for (const n of nuovi) {
    const [firstName, ...resto] = n.name.split(/\s+/);
    const giaOspite = await db.guest.findFirst({ where: { venueId, email: n.email }, select: { id: true } });
    const ospite =
      giaOspite ??
      (await db.guest.create({
        data: {
          venueId,
          firstName,
          lastName: resto.join(" ") || null,
          email: n.email,
          // Il consenso arriva dopo, dalla casella del portale: si accende
          // qui sotto, insieme al registro dei consensi.
          marketingOptIn: false,
        },
        select: { id: true },
      }));
    contatti.push({ guestId: ospite.id, name: n.name, email: n.email, phone: null });
  }

  let creati = 0;
  for (const c of contatti) {
    /*
      Chi ha già lasciato il contatto non lo lascia due volte. Il conteggio
      complessivo non basta come guardia: cancellando una riga a mano — o
      cambiando l'elenco — la corsa successiva ricreava tutto e sbatteva sul
      codice del coupon, che è unico.
    */
    const giaContatto = await db.wifiLead.findFirst({
      where: { venueId, email: c.email },
      select: { id: true },
    });
    if (giaContatto) continue;

    const r = caso(`wifi-${venueId}-${c.email}`);
    const createdAt = new Date(Date.now() - fra(r, 1, 28) * GIORNO - fra(r, 0, 20) * ORA);
    const consenso = r() < 0.72;

    const lead = await db.wifiLead.create({
      data: {
        venueId,
        guestId: c.guestId,
        name: c.name,
        email: c.email,
        phone: c.phone,
        source: "PORTAL",
        consentPrivacy: true,
        consentMarketing: consenso,
        createdAt,
      },
      select: { id: true },
    });

    await db.consentLog.createMany({
      data: [
        {
          venueId,
          guestId: c.guestId,
          leadId: lead.id,
          channel: "PRIVACY",
          granted: true,
          source: "WIFI_PORTAL",
          createdAt,
        },
        {
          venueId,
          guestId: c.guestId,
          leadId: lead.id,
          channel: "MARKETING_GENERAL",
          granted: consenso,
          source: "WIFI_PORTAL",
          createdAt,
        },
      ],
    });

    // Il consenso si accende, non si spegne: è la regola di `registraLead`.
    if (consenso) {
      await db.guest.update({ where: { id: c.guestId }, data: { marketingOptIn: true } });
    }

    if (venue.wifiAutoCouponEnabled && venue.wifiAutoCouponPercent) {
      // Il codice viene dall'ospite, non dalla posizione nell'elenco: la
      // posizione cambia se l'elenco cambia, e `Coupon.code` è unico.
      const codice = `WIFI-${c.guestId.slice(-6).toUpperCase()}`;
      const giaCoupon = await db.coupon.findUnique({ where: { code: codice }, select: { id: true } });
      const coupon = giaCoupon ?? await db.coupon.create({
        data: {
          venueId,
          code: codice,
          name: `Sconto Wi-Fi ${venue.wifiAutoCouponPercent}%`,
          description: "Sconto per chi si è collegato alla rete del locale.",
          kind: "PERCENT",
          value: venue.wifiAutoCouponPercent,
          category: "WIFI",
          status: "ACTIVE",
          guestId: c.guestId,
          maxRedemptions: 1,
          maxPerGuest: 1,
          validFrom: createdAt,
          validUntil: new Date(createdAt.getTime() + (venue.wifiAutoCouponDays ?? 30) * GIORNO),
          createdAt,
        },
        select: { id: true },
      });

      // Qualcuno lo ha davvero usato: è il numero che dice se la cosa serve.
      if (c.guestId && r() < 0.35) {
        const conto = await db.order.findFirst({
          where: { venueId, guestId: c.guestId, status: "COMPLETED", completedAt: { gte: createdAt } },
          orderBy: { completedAt: "asc" },
          select: { id: true, bookingId: true, totalCents: true, completedAt: true },
        });
        if (conto) {
          await db.couponRedemption.create({
            data: {
              couponId: coupon.id,
              venueId,
              guestId: c.guestId,
              bookingId: conto.bookingId,
              amountCents: Math.round((conto.totalCents * venue.wifiAutoCouponPercent) / 100),
              redeemedAt: conto.completedAt ?? new Date(),
            },
          });
          await db.coupon.update({ where: { id: coupon.id }, data: { redemptionCount: 1 } });
        }
      }
    }
    creati++;
  }

  if (creati > 0) console.log(`   ${creati} contatti raccolti dal portale Wi-Fi.`);
}

/* -------------------------------------------------------------------------- */
/*  Tutto insieme                                                             */
/* -------------------------------------------------------------------------- */

/**
 * L'ordine conta.
 *
 * Gli orari vengono prima dei conti (un conto si apre quando ci si siede), i
 * conti prima dei punti e della spesa (sono la loro somma), i punti prima dei
 * saldi. Invertire due passi non rompe niente in modo visibile: lascia soltanto
 * dei contatori a zero, che è il difetto da cui siamo partiti.
 *
 * ## Cosa **non** si popola qui, e perché
 *
 * - **`Payment`** — la pagina Pagamenti legge questa tabella e nessuna riga di
 *   codice la scrive: non c'è integrazione con l'incasso elettronico. Riempirla
 *   farebbe sembrare vivo un modulo che nel prodotto non può produrre nemmeno
 *   una riga. Il vuoto lì è la verità, e la pagina lo dice già bene.
 * - **`Ticket`** — `ticketsSold` si legge nella pagina Esperienze, ma i
 *   biglietti non si vendono da Tavolo (la pagina lo scrive) e nessun codice
 *   crea quelle righe. «12 venduti» sarebbe una promessa che il prodotto non
 *   mantiene.
 * - **`Review`, `CostEntry`, `StaffShift`, `BookingEvent`, `FloorDecor`,
 *   `WifiSession`, `MissedCall`, `CallLog`, `MenuScan`, `BookingPreorder`** —
 *   nessuna schermata le legge. Popolarle sarebbe lavoro invisibile.
 * - **la piantina della sala** (`Room.floorPlanUrl`, `RoomLayout`) — è
 *   un'immagine che il locale carica; non si inventa con una riga.
 */
export async function arricchisciVetrina(db: PrismaClient, venueId: string, nome: string) {
  console.log(`→ Vetrina di ${nome}:`);
  const prefissi = new Map<string, number>();

  await sistemaAnticipoPrenotazioni(db, venueId);
  await chiudiLeCeneFinite(db, venueId);
  await segnaOrariDelleCene(db, venueId);
  await apriEChiudiIConti(db, venueId, prefissi);
  await apparecchiaServizioDiOggi(db, venueId);
  await accreditaPuntiDaiConti(db, venueId);
  await riscattaQualchePunto(db, venueId);
  await allineaSaldiPunti(db, venueId);
  await scalaUnaGiftCard(db, venueId);
  await creaCouponDemo(db, venueId);
  await segnaCouponUsati(db, venueId);
  await allineaSpesaOspiti(db, venueId);
  await creaSondaggiDemo(db, venueId);
  await rinfrescaListaAttesa(db, venueId);
  // Prima i tavoli alle prenotazioni, poi il personale ai tavoli: il secondo
  // passo ha senso solo se il primo ha lasciato una sala popolata.
  await daiUnTavoloAChiNonCeLHa(db, venueId);
  await assegnaPersonaleDiOggi(db, venueId);
  await sistemaCampagnaDemo(db, venueId);
  await arricchisciEsperienze(db, venueId);
  await creaContattiWifiDemo(db, venueId);
}
