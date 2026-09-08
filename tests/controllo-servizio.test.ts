import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MINIMO_CENE_STASERA,
  NO_SHOW_RISK_MIN,
  PEAK_COVERS,
  SCOSTAMENTO_ROTAZIONE_MIN,
  getServiceInsights,
  getTopServiceInsights,
} from "@/server/service-intelligence";

import { zonedDayAndMinute } from "@/server/availability";

/**
 * Il centro controllo: le regole che dicono **cosa sta per andare storto**.
 *
 * Sono deterministiche di proposito, e questi test sono il posto dove le
 * soglie stanno scritte. Se un ristoratore dice «questo per me non è un
 * problema», si cambia una costante e un test — non si indovina cosa faceva
 * un modello.
 *
 * La cosa più importante che verificano è il **silenzio**: un motore che
 * avvisa sempre non avvisa mai, perché chi legge quindici righe non ne legge
 * nessuna.
 */

const db = new PrismaClient();
const PREFISSO = "test-ctrl-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";
let assenteId = "";
let t2 = "";
let t6 = "";

/**
 * L'orologio delle prove, fermo a mezzogiorno.
 *
 * Il centro controllo guarda **la giornata di oggi**. Girando questi test
 * all'una e mezza di notte, «fra trenta minuti» cadeva nel giorno dopo e
 * spariva dal quadro: passavano di giorno e fallivano la notte, che è il
 * difetto peggiore di un test. Le prove riguardano le regole, non l'ora in
 * cui girano.
 */
const ADESSO = (() => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
})();

/**
 * Qualcuno in coda, entrato dieci minuti prima dell'orologio della prova.
 *
 * `addToWaitlist` scrive `createdAt` con l'ora vera: con l'orologio fermo a
 * mezzogiorno, una riga creata alle due di notte risultava in attesa da dodici
 * ore — cioè «dimenticata», e le righe dimenticate non entrano negli
 * abbinamenti (è una regola voluta, vedi ATTESA_DIMENTICATA_MIN).
 */
async function inCoda(guestName: string, partySize: number) {
  return db.waitlistEntry.create({
    data: {
      venueId,
      guestName,
      partySize,
      status: "WAITING",
      createdAt: new Date(ADESSO.getTime() - 10 * 60_000),
    },
  });
}

async function prenota(opts: {
  minutiDaAdesso: number;
  partySize?: number;
  status?: "CONFIRMED" | "PENDING" | "SEATED" | "ARRIVED";
  tableId?: string | null;
  durationMin?: number;
  guest?: string;
}) {
  return db.booking.create({
    data: {
      venueId,
      guestId: opts.guest ?? guestId,
      partySize: opts.partySize ?? 2,
      startsAt: new Date(ADESSO.getTime() + opts.minutiDaAdesso * 60_000),
      durationMin: opts.durationMin ?? 105,
      status: opts.status ?? "CONFIRMED",
      source: "PHONE",
      tableId: opts.tableId ?? null,
    },
  });
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
  });
  venueId = venue.id;
  guestId = (await db.guest.create({ data: { venueId, firstName: "Carla", lastName: "Neri" } })).id;
  assenteId = (
    await db.guest.create({
      data: { venueId, firstName: "Sergio", lastName: "Vago", noShowCount: 2 },
    })
  ).id;
  t2 = (await db.table.create({ data: { venueId, label: "C2", seats: 2 } })).id;
  t6 = (await db.table.create({ data: { venueId, label: "C6", seats: 6 } })).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

async function svuota() {
  await db.booking.deleteMany({ where: { venueId } });
  await db.waitlistEntry.deleteMany({ where: { venueId } });
  await db.shift.deleteMany({ where: { venueId } });
}

describe("silenzio quando va tutto bene", () => {
  it("una sala vuota non produce nessun avviso", async () => {
    await svuota();
    expect(await getServiceInsights(venueId, { now: ADESSO })).toEqual([]);
  });

  it("due arrivi distribuiti e un tavolo assegnato non allarmano nessuno", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: 30, partySize: 2, tableId: t2 });
    await prenota({ minutiDaAdesso: 75, partySize: 2, tableId: t6 });
    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.filter((a) => a.severity === "warning")).toEqual([]);
  });
});

describe("picco di arrivi", () => {
  it("segnala quando troppe persone arrivano nella stessa ventina di minuti", async () => {
    await svuota();
    // Tre prenotazioni ravvicinate che insieme superano la soglia.
    await prenota({ minutiDaAdesso: 30, partySize: 6, tableId: t6 });
    await prenota({ minutiDaAdesso: 35, partySize: 6, tableId: t6 });
    await prenota({ minutiDaAdesso: 40, partySize: 4, tableId: t2 });

    const picco = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "arrival_peak");
    expect(picco).toBeDefined();
    expect(picco!.severity).toBe("warning");
    expect(picco!.motivo).toContain("16 persone");
    expect(picco!.action?.href).toBe("/service");
  });

  it("le stesse persone distribuite nell'ora non sono un picco", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: 20, partySize: 6, tableId: t6 });
    await prenota({ minutiDaAdesso: 50, partySize: 6, tableId: t6 });
    await prenota({ minutiDaAdesso: 80, partySize: 4, tableId: t2 });

    const picco = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "arrival_peak");
    expect(picco).toBeUndefined();
  });

  it("la soglia è quella dichiarata", () => {
    // Il numero sta qui perché è una decisione di prodotto, non un dettaglio.
    expect(PEAK_COVERS).toBe(12);
  });
});

describe("collisione sul tavolo", () => {
  it("avvisa quando il tavolo non si libera in tempo per il prossimo", async () => {
    await svuota();
    // Seduti da 100 minuti con durata 150: finiscono fra 50 minuti.
    await prenota({ minutiDaAdesso: -100, durationMin: 150, status: "SEATED", tableId: t6, partySize: 4 });
    // Il prossimo arriva sullo stesso tavolo fra 20 minuti.
    await prenota({ minutiDaAdesso: 20, tableId: t6, partySize: 4 });

    const collisione = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "table_collision");
    expect(collisione).toBeDefined();
    expect(collisione!.severity).toBe("warning");
    expect(collisione!.title).toContain("C6");
    expect(collisione!.action?.href).toBe("/service/room");
  });

  it("non avvisa se il tavolo si libera prima", async () => {
    await svuota();
    // Finiscono fra 5 minuti, il prossimo arriva fra 60.
    await prenota({ minutiDaAdesso: -100, durationMin: 105, status: "SEATED", tableId: t6 });
    await prenota({ minutiDaAdesso: 60, tableId: t6 });

    const collisione = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "table_collision");
    expect(collisione).toBeUndefined();
  });
});

describe("rischio no-show", () => {
  it("avvisa dopo la soglia di ritardo", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -(NO_SHOW_RISK_MIN + 10), tableId: t2 });
    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "no_show_risk");
    expect(avviso).toBeDefined();
    expect(avviso!.title).toContain("in ritardo di");
  });

  it("non avvisa per un ritardo breve", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -(NO_SHOW_RISK_MIN - 10), tableId: t2 });
    expect((await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "no_show_risk")).toBeUndefined();
  });

  it("usa lo storico del cliente per dire cosa fare", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -(NO_SHOW_RISK_MIN + 5), tableId: t2, guest: assenteId });
    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "no_show_risk");
    // Chi ha già due assenze merita una telefonata prima di liberare il tavolo:
    // il consiglio cambia in base al dato, non è una frase fissa.
    expect(avviso!.motivo).toContain("2 assenze");
    expect(avviso!.impatto).toContain("telefonata");
  });

  it("chi è già arrivato non è a rischio, anche se in ritardo", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -60, status: "ARRIVED", tableId: t2 });
    expect((await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "no_show_risk")).toBeUndefined();
  });
});

describe("opportunità", () => {
  it("un tavolo libero e qualcuno in attesa: lo dice", async () => {
    await svuota();
    await inCoda("Coppia Attesa", 2);

    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "waitlist_match");
    expect(avviso).toBeDefined();
    expect(avviso!.severity).toBe("opportunity");
    expect(avviso!.motivo).toContain("in attesa");
  });

  it("propone un solo abbinamento per volta, non uno per persona in coda", async () => {
    await svuota();
    for (const nome of ["Primo", "Secondo", "Terzo"]) {
      await inCoda(nome, 2);
    }
    const abbinamenti = (await getServiceInsights(venueId, { now: ADESSO })).filter((a) => a.kind === "waitlist_match");
    // Proporre lo stesso tavolo a tre gruppi trasformerebbe un aiuto in rumore.
    expect(abbinamenti).toHaveLength(1);
  });

  it("un sei posti con due persone, mentre una tavolata aspetta", async () => {
    await svuota();
    // Il sei posti è occupato da due persone…
    await prenota({ minutiDaAdesso: -20, status: "SEATED", tableId: t6, partySize: 2 });
    // …e in coda c'è un gruppo da sei, che ci starebbe.
    await inCoda("Tavolata", 6);

    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "oversized_table");
    expect(avviso).toBeDefined();
    expect(avviso!.severity).toBe("opportunity");
    expect(avviso!.title).toContain("C6");
  });

  it("senza nessuno in attesa, un tavolo grande mezzo vuoto non è un problema", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -20, status: "SEATED", tableId: t6, partySize: 2 });
    expect((await getServiceInsights(venueId, { now: ADESSO })).find((a) => a.kind === "oversized_table")).toBeUndefined();
  });
});

describe("una disdetta libera un posto", () => {
  /**
   * Orologio fissato a mezzogiorno.
   *
   * Un posto liberato è per definizione «più tardi, oggi»: girando questi
   * test alle 23:40, «fra quaranta minuti» cadrebbe domani e l'avviso —
   * giustamente — non comparirebbe. La prova riguarda la regola, non l'ora in
   * cui gira.
   */
  function mezzogiorno() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }

  /** Una prenotazione disdetta oggi, per un orario che deve ancora arrivare. */
  async function disdetta(adesso: Date, minutiDopo: number, partySize = 4) {
    return db.booking.create({
      data: {
        venueId,
        guestId,
        partySize,
        startsAt: new Date(adesso.getTime() + minutiDopo * 60_000),
        durationMin: 105,
        status: "CANCELLED",
        source: "PHONE",
        closedAt: adesso,
      },
    });
  }

  /** Qualcuno in lista da dieci minuti rispetto all'orologio della prova. */
  async function inLista(adesso: Date, opts: { partySize: number; desiredAt?: Date; flexibilityMin?: number }) {
    return db.waitlistEntry.create({
      data: {
        venueId,
        guestName: "Bianchi",
        partySize: opts.partySize,
        desiredAt: opts.desiredAt ?? null,
        flexibilityMin: opts.flexibilityMin ?? 0,
        createdAt: new Date(adesso.getTime() - 10 * 60_000),
      },
    });
  }

  it("lo dice, con l'ora e chi la aspetta", async () => {
    await svuota();
    const adesso = mezzogiorno();
    await disdetta(adesso, 45, 4);
    await inLista(adesso, { partySize: 3 });

    const avviso = (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot");
    expect(avviso).toBeDefined();
    expect(avviso!.severity).toBe("opportunity");
    // L'ora si legge nel fuso del **locale**: i test girano con TZ=UTC, e
    // scrivere qui «12:45» sarebbe l'ora del processo, non quella della sala.
    const oraSala = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(adesso.getTime() + 45 * 60_000));
    expect(avviso!.title).toContain(oraSala);
    expect(avviso!.impatto).toContain("Bianchi");
    expect(avviso!.action?.href).toBe("/waitlist");
  });

  it("a chi aspetta in piedi non si offre un tavolo fra tre ore", async () => {
    await svuota();
    const adesso = mezzogiorno();
    await disdetta(adesso, 180, 4);
    await inLista(adesso, { partySize: 3 });

    expect(
      (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot"),
    ).toBeUndefined();
  });

  it("ma a chi aveva chiesto proprio quell'ora, sì", async () => {
    await svuota();
    const adesso = mezzogiorno();
    const posto = await disdetta(adesso, 180, 4);
    await inLista(adesso, { partySize: 3, desiredAt: posto.startsAt });

    expect(
      (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot"),
    ).toBeDefined();
  });

  it("chi aveva chiesto un'altra ora resta fuori: non è quello che aveva chiesto", async () => {
    await svuota();
    const adesso = mezzogiorno();
    const posto = await disdetta(adesso, 60, 4);
    await inLista(adesso, { partySize: 3, desiredAt: new Date(posto.startsAt.getTime() + 120 * 60_000) });

    expect(
      (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot"),
    ).toBeUndefined();
  });

  it("un gruppo più grande del posto liberato non ci sta", async () => {
    await svuota();
    const adesso = mezzogiorno();
    await disdetta(adesso, 45, 2);
    await inLista(adesso, { partySize: 6 });

    expect(
      (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot"),
    ).toBeUndefined();
  });

  it("due disdette sono una proposta sola: l'elenco delle disdette non serve a nessuno", async () => {
    await svuota();
    const adesso = mezzogiorno();
    await disdetta(adesso, 30, 4);
    await disdetta(adesso, 60, 4);
    await inLista(adesso, { partySize: 3 });

    expect(
      (await getServiceInsights(venueId, { now: adesso })).filter((a) => a.kind === "freed_slot"),
    ).toHaveLength(1);
  });

  it("senza nessuno in lista, una disdetta è solo una disdetta", async () => {
    await svuota();
    const adesso = mezzogiorno();
    await disdetta(adesso, 45, 4);

    expect(
      (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot"),
    ).toBeUndefined();
  });

  it("se il turno nel frattempo si è riempito, il posto non è più libero", async () => {
    await svuota();
    const adesso = mezzogiorno();
    const { weekday, minuteOfDay } = zonedDayAndMinute(adesso, "Europe/Rome");
    await db.shift.create({
      data: {
        venueId,
        name: "Pranzo pieno",
        weekday,
        startMinute: minuteOfDay - 60,
        endMinute: minuteOfDay + 180,
        capacity: 4,
      },
    });
    await disdetta(adesso, 45, 4);
    // La capienza è già impegnata da altri: la disdetta non ha liberato niente.
    await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 4,
        startsAt: new Date(adesso.getTime() + 45 * 60_000),
        durationMin: 105,
        status: "CONFIRMED",
        source: "PHONE",
        tableId: t6,
      },
    });
    await inLista(adesso, { partySize: 3 });

    expect(
      (await getServiceInsights(venueId, { now: adesso })).find((a) => a.kind === "freed_slot"),
    ).toBeUndefined();
  });
});

describe("turno oltre la capienza", () => {
  it("lo segnala, senza dire che è un errore", async () => {
    await svuota();
    // Il turno va creato nel fuso del **locale**, non in quello del processo:
    // i test girano con TZ=UTC di proposito, e usare getHours() qui creava un
    // turno spostato di due ore che non conteneva "adesso". Il motore usa il
    // fuso del ristorante, ed è giusto così.
    // Orologio fissato a mezzogiorno, non «adesso»: eseguito alle 23:50, la
    // fine del turno si schiacciava sulle 23:59 e la prenotazione di venti
    // minuti dopo cadeva nel giorno seguente — il test passava di giorno e
    // falliva la notte. La prova riguarda un turno pieno, non l'ora in cui gira.
    const adesso = new Date();
    adesso.setHours(12, 0, 0, 0);
    const { weekday, minuteOfDay } = zonedDayAndMinute(adesso, "Europe/Rome");
    await db.shift.create({
      data: {
        venueId,
        name: "Prova",
        weekday,
        startMinute: minuteOfDay - 60,
        endMinute: minuteOfDay + 120,
        capacity: 4,
      },
    });
    await db.booking.create({
      data: {
        venueId,
        guestId,
        partySize: 6,
        startsAt: new Date(adesso.getTime() + 20 * 60_000),
        durationMin: 105,
        status: "CONFIRMED",
        source: "PHONE",
        tableId: t6,
      },
    });

    const avviso = (await getServiceInsights(venueId, { now: adesso })).find(
      (a) => a.kind === "shift_over_capacity",
    );
    expect(avviso).toBeDefined();
    // Può essere voluto — qualcuno ha forzato — e il testo lo riconosce.
    expect(avviso!.motivo).toContain("Può essere voluto");
  });
});

describe("ordine e quantità", () => {
  it("i problemi vengono prima delle opportunità", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -(NO_SHOW_RISK_MIN + 5), tableId: t2 });
    await inCoda("Attesa", 2);

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    const primoOpportunity = avvisi.findIndex((a) => a.severity === "opportunity");
    const ultimoWarning = avvisi.map((a) => a.severity).lastIndexOf("warning");
    expect(ultimoWarning).toBeLessThan(primoOpportunity);
  });

  it("la Panoramica ne riceve solo tre", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: 30, partySize: 6, tableId: t6 });
    await prenota({ minutiDaAdesso: 35, partySize: 6, tableId: t6 });
    await prenota({ minutiDaAdesso: -(NO_SHOW_RISK_MIN + 5), tableId: t2 });
    await inCoda("Attesa", 2);

    const tre = await getTopServiceInsights(venueId, { now: ADESSO });
    expect(tre.length).toBeLessThanOrEqual(3);
  });

  it("ogni avviso ha un identificativo stabile e un posto dove andare", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -(NO_SHOW_RISK_MIN + 5), tableId: t2 });

    const primo = await getServiceInsights(venueId, { now: ADESSO });
    const secondo = await getServiceInsights(venueId, { now: ADESSO });
    // Stabile fra due letture: senza questo la lista ballerebbe a ogni
    // aggiornamento automatico.
    expect(primo.map((a) => a.id)).toEqual(secondo.map((a) => a.id));
    for (const a of primo) expect(a.action?.href).toBeTruthy();
  });

  it("non mescola i ristoranti", async () => {
    await svuota();
    const org = await db.organization.create({
      data: { name: `${PREFISSO}altro`, slug: `${PREFISSO}altro-${Date.now()}` },
    });
    const altro = await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    const suoTavolo = await db.table.create({ data: { venueId: altro.id, label: "Z1", seats: 2 } });
    await db.booking.create({
      data: {
        venueId: altro.id,
        partySize: 2,
        startsAt: new Date(ADESSO.getTime() - 90 * 60_000),
        status: "CONFIRMED",
        source: "PHONE",
        tableId: suoTavolo.id,
      },
    });

    expect(await getServiceInsights(venueId, { now: ADESSO })).toEqual([]);
  });
});

describe("il centro controllo non si autoaffoga", () => {
  it("dice il tempo in ore, non in minuti illeggibili", async () => {
    const { durataUmana } = await import("@/server/service-intelligence");
    expect(durataUmana(35)).toBe("35 minuti");
    expect(durataUmana(1)).toBe("1 minuto");
    expect(durataUmana(60)).toBe("1 ora");
    expect(durataUmana(90)).toBe("1 ora e mezza");
    expect(durataUmana(142)).toBe("2 ore e 22");
    // Il numero che ha fatto nascere questa correzione.
    expect(durataUmana(577)).toBe("9 ore e 37");
  });

  it("raggruppa le prenotazioni mai arrivate invece di gridare otto volte", async () => {
    await svuota();
    // Otto prenotazioni di pranzo, lette a cena: nessuna è «in ritardo».
    for (let i = 0; i < 8; i++) {
      await prenota({ minutiDaAdesso: -(300 + i * 20), partySize: 2 });
    }
    // E una in ritardo vero, di mezz'ora: questa si recupera con una telefonata.
    await prenota({ minutiDaAdesso: -30, partySize: 4 });

    const insights = await getServiceInsights(venueId, { now: ADESSO });
    const ritardi = insights.filter((i) => i.kind === "no_show_risk");
    const mancate = insights.filter((i) => i.kind === "missed_bookings");

    // Un solo avviso per le otto mai arrivate…
    expect(mancate).toHaveLength(1);
    expect(mancate[0].title).toContain("8 prenotazioni");
    expect(mancate[0].motivo).toContain("16 coperti");
    // …e il ritardo vero resta singolo e leggibile.
    expect(ritardi).toHaveLength(1);
    expect(ritardi[0].title).toContain("30 minuti");
  });

  it("mette per primo il ritardo più recente, non il più vecchio", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -120 });
    await prenota({ minutiDaAdesso: -40 });

    const insights = await getServiceInsights(venueId, { now: ADESSO });
    const ritardi = insights.filter((i) => i.kind === "no_show_risk");
    expect(ritardi).toHaveLength(2);
    // Su quello di quaranta minuti la telefonata funziona ancora.
    expect(ritardi[0].urgenza).toBeLessThan(ritardi[1].urgenza);
    expect(ritardi[0].title).toContain("40 minuti");
  });

  it("non chiama «ritardo» un'assenza di nove ore", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -577 });

    const insights = await getServiceInsights(venueId, { now: ADESSO });
    expect(insights.filter((i) => i.kind === "no_show_risk")).toHaveLength(0);
    const mancate = insights.find((i) => i.kind === "missed_bookings");
    expect(mancate?.title).toContain("Una prenotazione");
    // E non è urgente: nessuno sta più arrivando.
    expect(mancate?.severity).not.toBe("warning");
  });
});

/* -------------------------------------------------------------------------- */
/*  Le quattro parti di un avviso (§4)                                        */
/* -------------------------------------------------------------------------- */

describe("ogni avviso dice problema, motivo, impatto e azione", () => {
  it("nessuna regola può uscire senza impatto: è la parte su cui si decide", async () => {
    /**
     * Il test strutturale, e il più importante di questo file: mette la sala
     * in uno stato che accende **più regole diverse** insieme, e pretende che
     * ognuna abbia tutte e quattro le parti piene. Serve a impedire che una
     * regola nuova venga scritta senza impatto — che è come nasceva prima
     * ogni avviso: un titolo e una spiegazione, e chi legge che si arrangia.
     */
    await svuota();
    // un picco
    await prenota({ minutiDaAdesso: 30, partySize: 8 });
    await prenota({ minutiDaAdesso: 35, partySize: 6 });
    // un ritardo con storico
    await prenota({ minutiDaAdesso: -40, guest: assenteId, tableId: t2 });
    // un sei posti con due persone e qualcuno in coda
    await prenota({ minutiDaAdesso: -30, status: "SEATED", tableId: t6, partySize: 2 });
    await inCoda("Famiglia Sarti", 5);

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.length).toBeGreaterThan(2);

    for (const a of avvisi) {
      expect(a.title.trim().length, `titolo vuoto su ${a.kind}`).toBeGreaterThan(0);
      expect(a.motivo.trim().length, `motivo vuoto su ${a.kind}`).toBeGreaterThan(10);
      expect(a.impatto.trim().length, `impatto vuoto su ${a.kind}`).toBeGreaterThan(10);
      expect(a.action?.href, `azione mancante su ${a.kind}`).toBeTruthy();
      // Il motivo è un fatto, non un consiglio: i consigli stanno
      // nell'impatto e nell'azione.
      expect(a.motivo).not.toMatch(/^Prepara|^Sposta|^Assegna/);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Un tavolo che sta per liberarsi                                           */
/* -------------------------------------------------------------------------- */

describe("un tavolo sta per liberarsi", () => {
  it("lo dice prima, se c'è qualcuno che ci starebbe", async () => {
    await svuota();
    // Seduto da 95 minuti su 105 previsti: si libera fra 10.
    await prenota({ minutiDaAdesso: -95, status: "SEATED", tableId: t6, partySize: 4 });
    await inCoda("Coppia Rizzo", 2);

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    const avviso = avvisi.find((a) => a.kind === "table_freeing_soon");
    expect(avviso).toBeTruthy();
    expect(avviso!.title).toContain("C6");
    expect(avviso!.impatto).toContain("Coppia Rizzo");
    // Il motivo dice anche su cosa poggia la previsione: senza cene misurate
    // è la durata prevista, e va dichiarato.
    expect(avviso!.motivo).toContain("Durata prevista");
  });

  it("senza nessuno in attesa, un tavolo che si libera è la normalità", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -95, status: "SEATED", tableId: t6, partySize: 4 });
    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "table_freeing_soon")).toBeUndefined();
  });

  it("un tavolo già promesso a una prenotazione non è un'opportunità", async () => {
    // È una collisione, e la dice l'altra regola: due avvisi sullo stesso
    // tavolo con due consigli opposti sarebbero peggio di nessun avviso.
    await svuota();
    await prenota({ minutiDaAdesso: -95, status: "SEATED", tableId: t6, partySize: 4 });
    await prenota({ minutiDaAdesso: 40, tableId: t6, partySize: 4 });
    await inCoda("Coppia Rizzo", 2);

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "table_freeing_soon")).toBeUndefined();
  });

  it("un tavolo che si libera fra un'ora non sta per liberarsi", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -45, status: "SEATED", tableId: t6, partySize: 4 });
    await inCoda("Coppia Rizzo", 2);
    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "table_freeing_soon")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  Un tavolo oltre la durata                                                 */
/* -------------------------------------------------------------------------- */

describe("un tavolo oltre la durata", () => {
  it("non è un problema se nessuno lo aspetta", async () => {
    /**
     * La regola più importante di questa coppia: gente che resta a tavola,
     * con la sala mezza vuota, è una serata che va bene. Un prodotto che
     * consiglia di alzarli darebbe il consiglio peggiore che può dare.
     */
    await svuota();
    await prenota({ minutiDaAdesso: -180, status: "SEATED", tableId: t6, partySize: 4 });
    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "table_overdue")).toBeUndefined();
  });

  it("lo diventa quando qualcuno arriva su quel tavolo", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -180, status: "SEATED", tableId: t6, partySize: 4 });
    await prenota({ minutiDaAdesso: 20, tableId: t6, partySize: 4, guest: guestId });

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    const avviso = avvisi.find((a) => a.kind === "table_overdue");
    expect(avviso).toBeTruthy();
    expect(avviso!.severity).toBe("warning");
    expect(avviso!.title).toContain("oltre di");
    expect(avviso!.impatto).toContain("proprio su questo tavolo");
  });

  it("lo diventa anche quando c'è qualcuno in lista che ci starebbe", async () => {
    await svuota();
    await prenota({ minutiDaAdesso: -180, status: "SEATED", tableId: t6, partySize: 4 });
    await inCoda("Gruppo Alberti", 5);

    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find(
      (a) => a.kind === "table_overdue",
    );
    expect(avviso).toBeTruthy();
    expect(avviso!.impatto).toContain("Gruppo Alberti");
  });

  it("il motivo dice a che punto è il conto: cambia cosa si fa", async () => {
    await svuota();
    const seduto = await prenota({ minutiDaAdesso: -180, status: "SEATED", tableId: t6, partySize: 4 });
    await prenota({ minutiDaAdesso: 20, tableId: t6, partySize: 4 });
    await db.order.create({
      data: {
        venueId,
        bookingId: seduto.id,
        kind: "TABLE",
        status: "PREPARING",
        reference: `${PREFISSO}${Date.now()}`,
        scheduledAt: ADESSO,
        totalCents: 8400,
        OrderItem: { create: [{ name: "Menu", priceCents: 4200, quantity: 2 }] },
      },
    });

    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find(
      (a) => a.kind === "table_overdue",
    );
    expect(avviso!.motivo).toContain("il conto è aperto con 1 riga");
    await db.order.deleteMany({ where: { venueId } });
  });

  it("venti minuti oltre è la soglia: un tavolo che sfora di dieci non allarma", async () => {
    await svuota();
    // 110 minuti su 105 previsti: cinque oltre.
    await prenota({ minutiDaAdesso: -110, status: "SEATED", tableId: t6, partySize: 4 });
    await inCoda("Gruppo Alberti", 5);
    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "table_overdue")).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/*  La rotazione che slitta                                                   */
/* -------------------------------------------------------------------------- */

describe("stasera si sta a tavola più del solito", () => {
  /**
   * Serve una storia: dieci cene chiuse nelle settimane scorse da 100
   * minuti, che diventano «il solito» di questo locale.
   */
  async function storiaDelLocale(durataMin: number, quante = 12) {
    for (let i = 1; i <= quante; i++) {
      const inizio = new Date(ADESSO.getTime() - i * 2 * 86_400_000);
      await db.booking.create({
        data: {
          venueId,
          guestId,
          partySize: 2,
          startsAt: inizio,
          durationMin: 105,
          status: "COMPLETED",
          source: "PHONE",
          seatedAt: inizio,
          closedAt: new Date(inizio.getTime() + durataMin * 60_000),
        },
      });
    }
  }

  /** Cene chiuse **oggi**, quelle su cui si misura la serata. */
  async function ceneDiStasera(durataMin: number, quante: number) {
    for (let i = 0; i < quante; i++) {
      const inizio = new Date(ADESSO.getTime() - (300 + i * 10) * 60_000);
      await db.booking.create({
        data: {
          venueId,
          guestId,
          partySize: 2,
          startsAt: inizio,
          durationMin: 105,
          status: "COMPLETED",
          source: "PHONE",
          seatedAt: inizio,
          closedAt: new Date(inizio.getTime() + durataMin * 60_000),
        },
      });
    }
  }

  it("lo dice, col confronto e con chi lo pagherà", async () => {
    await svuota();
    await storiaDelLocale(100);
    await ceneDiStasera(150, 4);
    // Qualcuno che arriva: senza conseguenza non si dice niente.
    await prenota({ minutiDaAdesso: 45, partySize: 4 });

    const avviso = (await getServiceInsights(venueId, { now: ADESSO })).find(
      (a) => a.kind === "rotation_slipping",
    );
    expect(avviso).toBeTruthy();
    expect(avviso!.severity).toBe("warning");
    expect(avviso!.title).toContain("più del solito");
    // Il motivo porta i due numeri e su quante cene poggiano.
    expect(avviso!.motivo).toContain("4 cene già chiuse");
    /**
     * «Su quante cene» comprende anche quelle di stasera: la durata tipica
     * del locale è la mediana degli ultimi novanta giorni, e oggi è uno di
     * quei giorni. È giusto così — il confronto è fra stasera e l'abitudine,
     * e l'abitudine non si sospende quando si guarda.
     */
    expect(avviso!.motivo).toMatch(/contro .* misurati su \d+ cene di questo locale/);
    expect(avviso!.impatto).toContain("prenotazione arriva");
  });

  it("con la sala che si svuota non è un problema: è una serata tranquilla", async () => {
    // Nessuno in arrivo e nessuno in attesa: il servizio lento non fa male a
    // nessuno, e alzare la gente sarebbe il consiglio peggiore.
    await svuota();
    await storiaDelLocale(100);
    await ceneDiStasera(150, 4);

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "rotation_slipping")).toBeUndefined();
  });

  it("due cene chiuse non sono una serata", async () => {
    await svuota();
    await storiaDelLocale(100);
    await ceneDiStasera(180, MINIMO_CENE_STASERA - 1);
    await prenota({ minutiDaAdesso: 45 });

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "rotation_slipping")).toBeUndefined();
  });

  it("senza un «solito» misurato non si dice «più del solito»", async () => {
    // Il locale non ha ancora dieci cene misurate: non esiste un termine di
    // confronto, e inventarne uno sarebbe la cosa peggiore.
    await svuota();
    await storiaDelLocale(100, 4);
    await ceneDiStasera(180, 5);
    await prenota({ minutiDaAdesso: 45 });

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "rotation_slipping")).toBeUndefined();
  });

  it("un quarto d'ora in più è la differenza fra due martedì, non una notizia", async () => {
    await svuota();
    await storiaDelLocale(100);
    await ceneDiStasera(100 + SCOSTAMENTO_ROTAZIONE_MIN - 5, 5);
    await prenota({ minutiDaAdesso: 45 });

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "rotation_slipping")).toBeUndefined();
  });

  it("una serata più veloce del solito non è un avviso", async () => {
    await svuota();
    await storiaDelLocale(150);
    await ceneDiStasera(90, 5);
    await prenota({ minutiDaAdesso: 45 });

    const avvisi = await getServiceInsights(venueId, { now: ADESSO });
    expect(avvisi.find((a) => a.kind === "rotation_slipping")).toBeUndefined();
  });
});
