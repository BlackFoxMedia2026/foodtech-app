import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { classifyIntent } from "@/server/ai/intent-router";
import { toolRegistry } from "@/server/ai/tool-registry";
import { MINIMO_GIORNI_MISURATI } from "@/server/ai/tools/domande-operative";
import type { AgentContext } from "@/server/ai/types";

/**
 * Le cinque domande operative dentro l'agente.
 *
 * Due cose vanno verificate, e la prima conta più della seconda:
 *
 * 1. **che la domanda arrivi allo strumento giusto.** «chi rischia di non
 *    presentarsi» contiene la parola «prenotazione» in molte formulazioni, e
 *    finire sull'elenco di oggi darebbe una risposta plausibile alla domanda
 *    sbagliata — che è il modo peggiore di sbagliare, perché nessuno se ne
 *    accorge;
 * 2. **che quando la misura non basta, la risposta lo dica.** Un agente che
 *    inventa un numero insegna a fidarsi di lui invece che dei fatti.
 */

const db = new PrismaClient();
const PREFISSO = "test-agente-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let ctx: AgentContext;
let venueId = "";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: "Europe/Rome" },
  });
  venueId = venue.id;
  ctx = {
    venueId,
    venueName: venue.name,
    venueTimezone: "Europe/Rome",
    role: "MANAGER",
    userId: "test",
  };
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("ogni domanda arriva al suo strumento", () => {
  const casi: [string, string][] = [
    ["chi rischia di non presentarsi stasera?", "chi_rischia_assenza"],
    ["chi mi salta oggi", "chi_rischia_assenza"],
    ["c'è rischio di no show?", "chi_rischia_assenza"],
    ["quali tavoli stanno andando lunghi?", "tavoli_lunghi"],
    ["che tavoli sono oltre?", "tavoli_lunghi"],
    ["quali tavoli non si liberano", "tavoli_lunghi"],
    ["chi non torna più?", "chi_non_torna"],
    ["quanti clienti inattivi ho", "chi_non_torna"],
    ["quali clienti sono spariti", "chi_non_torna"],
    ["quali piatti rendono meno?", "piatti_che_rendono_meno"],
    ["che margine hanno i piatti", "piatti_che_rendono_meno"],
    ["qual è il giorno peggiore?", "giorno_peggiore"],
    ["qual è il giorno più vuoto della settimana", "giorno_peggiore"],
  ];

  for (const [domanda, atteso] of casi) {
    it(`«${domanda}» → ${atteso}`, () => {
      const esito = classifyIntent(domanda);
      expect(esito.kind).toBe("internal");
      expect(esito.kind === "internal" && esito.intent).toBe(atteso);
    });
  }

  it("le domande vecchie continuano a rispondere come prima", () => {
    // La regola nuova non deve rubare le domande già coperte: «quanti
    // coperti» resta sui coperti.
    const coperti = classifyIntent("quanti coperti abbiamo oggi?");
    expect(coperti.kind === "internal" && coperti.intent).toBe("get_service_covers");

    const liberi = classifyIntent("quali tavoli sono liberi?");
    expect(liberi.kind === "internal" && liberi.intent).toBe("get_available_tables");

    const prenotazioni = classifyIntent("mostra le prenotazioni di oggi");
    expect(prenotazioni.kind === "internal" && prenotazioni.intent).toBe("get_today_reservations");
  });

  it("ogni intento nuovo ha uno strumento registrato", () => {
    // Un intento senza strumento cadrebbe nella quota esterna in silenzio.
    for (const intento of [
      "chi_rischia_assenza",
      "tavoli_lunghi",
      "chi_non_torna",
      "piatti_che_rendono_meno",
      "giorno_peggiore",
    ]) {
      expect(toolRegistry[intento], `${intento} non è nel registro`).toBeTruthy();
    }
  });

  it("una domanda che non c'entra niente resta fuori", () => {
    expect(classifyIntent("che tempo fa domani a Milano?").kind).toBe("external");
  });
});

describe("quando la misura non basta, la risposta lo dice", () => {
  it("i piatti: senza costi dichiarati non si parla di margine", async () => {
    const esito = await toolRegistry.piatti_che_rendono_meno.run(ctx, {});
    expect(esito.text).toMatch(/non lo so ancora|Servono almeno/i);
    // E non compare nessun numero spacciato per margine.
    expect(esito.text).not.toMatch(/€ a piatto/);
  });

  it("il giorno peggiore: senza serate misurate non si confrontano i giorni", async () => {
    const esito = await toolRegistry.giorno_peggiore.run(ctx, {});
    expect(esito.text).toContain(`almeno ${MINIMO_GIORNI_MISURATI} giorni`);
    expect(esito.structured).toBeUndefined();
  });

  it("i tavoli lunghi: in una sala vuota lo dice, e dice su cosa poggia la previsione", async () => {
    const esito = await toolRegistry.tavoli_lunghi.run(ctx, {});
    expect(esito.text).toContain("Nessun tavolo è oltre");
    expect(esito.text).toMatch(/durata misurata qui|durata scritta sulle prenotazioni/);
  });

  it("chi rischia di mancare: senza nessuno a rischio non si inventa un elenco", async () => {
    const esito = await toolRegistry.chi_rischia_assenza.run(ctx, {});
    expect(esito.text).toContain("Nessuno rischia di mancare");
    expect(esito.structured).toBeUndefined();
  });

  it("chi non torna: con l'archivio vuoto lo dice", async () => {
    const esito = await toolRegistry.chi_non_torna.run(ctx, {});
    expect(esito.text).toContain("Nessun cliente risulta inattivo");
  });
});

describe("con dati veri, le risposte portano i numeri", () => {
  it("chi rischia di mancare distingue il ritardo dalla storia di assenze", async () => {
    const adesso = new Date();
    const ospiteConStoria = await db.guest.create({
      data: { venueId, firstName: "Sergio", lastName: "Vago", noShowCount: 3, totalVisits: 2 },
    });
    const ospitePuntuale = await db.guest.create({
      data: { venueId, firstName: "Carla", lastName: "Neri" },
    });

    // In ritardo di quaranta minuti, senza storia.
    await db.booking.create({
      data: {
        venueId,
        guestId: ospitePuntuale.id,
        partySize: 2,
        startsAt: new Date(adesso.getTime() - 40 * 60_000),
        status: "CONFIRMED",
        source: "PHONE",
      },
    });
    // Deve ancora arrivare, ma ha tre assenze.
    await db.booking.create({
      data: {
        venueId,
        guestId: ospiteConStoria.id,
        partySize: 4,
        startsAt: new Date(adesso.getTime() + 90 * 60_000),
        status: "CONFIRMED",
        source: "PHONE",
      },
    });

    const esito = await toolRegistry.chi_rischia_assenza.run(ctx, {});
    expect(esito.text).toContain("in ritardo");
    expect(esito.text).toContain("assenze sulla scheda");
    const elenco = esito.structured as { type: "list"; items: { title: string }[] };
    expect(elenco.type).toBe("list");
    expect(elenco.items.map((i) => i.title).join(" | ")).toContain("Carla Neri");
    expect(elenco.items.map((i) => i.title).join(" | ")).toContain("Sergio Vago");
    // Il primo è chi è in ritardo adesso: è quello su cui la telefonata
    // funziona ancora.
    expect(elenco.items[0].title).toContain("in ritardo");

    await db.booking.deleteMany({ where: { venueId } });
    await db.guest.deleteMany({ where: { venueId } });
  });

  it("il giorno peggiore confronta solo i giorni misurati abbastanza", async () => {
    /**
     * Due giorni della settimana con la capienza dichiarata, quattro serate
     * ciascuno: il resto della settimana **non ha turni**, e un giorno di
     * chiusura non è un giorno vuoto — se entrasse nella media a zero
     * coperti, la risposta sarebbe «il giorno peggiore è quello in cui siamo
     * chiusi», che è vero e inutile.
     */
    const oggiWeekday = new Date().getDay();
    const ieriWeekday = (oggiWeekday + 6) % 7;
    for (const weekday of [oggiWeekday, ieriWeekday]) {
      await db.shift.create({
        data: { venueId, name: "Cena", weekday, startMinute: 19 * 60, endMinute: 23 * 60, capacity: 40 },
      });
    }
    const ospite = await db.guest.create({ data: { venueId, firstName: "Storia" } });
    const oggi = new Date();
    for (let settimana = 1; settimana <= 4; settimana++) {
      for (const [giorniIndietro, coperti] of [
        [settimana * 7, 30],
        [settimana * 7 + 1, 6],
      ] as const) {
        const quando = new Date(oggi.getTime() - giorniIndietro * 86_400_000);
        quando.setHours(20, 0, 0, 0);
        await db.booking.create({
          data: {
            venueId,
            guestId: ospite.id,
            partySize: coperti,
            startsAt: quando,
            status: "COMPLETED",
            source: "PHONE",
          },
        });
      }
    }

    const esito = await toolRegistry.giorno_peggiore.run(ctx, {});
    expect(esito.text).toContain("Il giorno più vuoto è");
    expect(esito.text).toMatch(/serate misurate/);

    /**
     * Il giorno con sei coperti è più vuoto di quello con trenta — ed è
     * l'unica cosa da verificare: la **media** non è sei, perché nella
     * finestra misurata cade anche la serata di ieri, che è vuota. È giusto
     * che la abbassi: una serata dentro il periodo in cui il locale registra
     * è un dato, anche quando non è venuto nessuno.
     */
    const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
    const metrica = esito.structured as { type: "metric"; value: string; hint?: string };
    expect(metrica.value.toLowerCase()).toBe(GIORNI[ieriWeekday]);
    expect(metrica.hint).toMatch(/serate/);

    await db.booking.deleteMany({ where: { venueId } });
    await db.guest.deleteMany({ where: { venueId } });
    await db.shift.deleteMany({ where: { venueId } });
  });
});
