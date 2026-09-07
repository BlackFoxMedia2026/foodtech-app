import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { OSPITI_PER_PAGINA, listDistinctTags, listGuests } from "@/server/guests";

/**
 * Le liste lunghe.
 *
 * `listGuests` aveva `take: 200` e nient'altro: un locale con cinquecento
 * clienti ne vedeva duecento e **non lo sapeva**. Nessun messaggio, nessun
 * pulsante — i trecento restanti semplicemente non esistevano, e chi cercava
 * qualcuno che era in archivio concludeva che la ricerca fosse rotta.
 *
 * Lo stesso valeva per le etichette: si leggevano quelle dei primi
 * cinquecento ospiti, quindi un'etichetta usata solo dai clienti più vecchi
 * spariva dal filtro.
 */

const db = new PrismaClient();
const PREFISSO = "test-pag-";
const QUANTI = 120;

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
  altroVenueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` } })
  ).id;

  // Centoventi ospiti: più di due pagine, e più del vecchio tetto se lo si
  // dimezzasse. Uno solo si chiama «Introvabile», ed è l'ultimo in ordine.
  await db.guest.createMany({
    data: Array.from({ length: QUANTI }, (_, i) => ({
      venueId,
      firstName: `Ospite${String(i).padStart(3, "0")}`,
      email: `${PREFISSO}${i}@test.local`,
      // Un'etichetta diversa ogni venti, più una rarissima sull'ultimo: serve
      // a dimostrare che l'elenco delle etichette non si ferma a una soglia.
      tags: i === QUANTI - 1 ? [`${PREFISSO}rarissima`] : [`${PREFISSO}gruppo${i % 6}`],
    })),
  });
  await db.guest.create({
    data: { venueId: altroVenueId, firstName: "Altrui", tags: [`${PREFISSO}altrui`] },
  });
}, 120_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("gli ospiti a pagine", () => {
  it("la prima pagina dice quanti sono in tutto, non quanti ne mostra", async () => {
    const p1 = await listGuests(venueId, {});
    expect(p1.items).toHaveLength(OSPITI_PER_PAGINA);
    // È il numero che prima non c'era: senza, «50 risultati» su 120 clienti
    // è una bugia per omissione.
    expect(p1.totale).toBe(QUANTI);
    expect(p1.pagine).toBe(Math.ceil(QUANTI / OSPITI_PER_PAGINA));
    expect(p1.pagina).toBe(1);
  });

  it("le pagine successive contengono gente diversa, e l'ultima il resto", async () => {
    const p1 = await listGuests(venueId, { pagina: 1 });
    const p2 = await listGuests(venueId, { pagina: 2 });
    const p3 = await listGuests(venueId, { pagina: 3 });

    expect(p2.items).toHaveLength(OSPITI_PER_PAGINA);
    expect(p3.items).toHaveLength(QUANTI - 2 * OSPITI_PER_PAGINA);

    const id = (p: typeof p1) => p.items.map((g) => g.id);
    const tutti = new Set([...id(p1), ...id(p2), ...id(p3)]);
    // Nessuno perso e nessuno contato due volte: è il punto della paginazione.
    expect(tutti.size).toBe(QUANTI);
  });

  it("una pagina oltre l'ultima non è vuota: si torna sull'ultima", async () => {
    // Un numero di pagina scritto a mano nell'indirizzo non deve produrre una
    // schermata vuota che sembra un archivio svuotato.
    const fuori = await listGuests(venueId, { pagina: 99 });
    expect(fuori.pagina).toBe(fuori.pagine);
    expect(fuori.items.length).toBeGreaterThan(0);
  });

  it("una pagina zero o negativa è la prima", async () => {
    expect((await listGuests(venueId, { pagina: 0 })).pagina).toBe(1);
    expect((await listGuests(venueId, { pagina: -5 })).pagina).toBe(1);
  });

  it("la ricerca riduce il totale, non solo la pagina", async () => {
    const esito = await listGuests(venueId, { q: "Ospite01" });
    // Ospite010…Ospite019: dieci, e il totale lo dice.
    expect(esito.totale).toBe(10);
    expect(esito.pagine).toBe(1);
    expect(esito.items).toHaveLength(10);
  });

  it("il filtro per etichetta conta solo chi ce l'ha", async () => {
    const esito = await listGuests(venueId, { tag: `${PREFISSO}rarissima` });
    expect(esito.totale).toBe(1);
    expect(esito.items[0].firstName).toBe(`Ospite${String(QUANTI - 1).padStart(3, "0")}`);
  });

  it("gli ospiti di un altro locale non entrano nel conto", async () => {
    const esito = await listGuests(venueId, {});
    expect(esito.totale).toBe(QUANTI);
    expect(esito.items.some((g) => g.firstName === "Altrui")).toBe(false);
  });

  it("il numero per pagina resta dentro limiti sensati", async () => {
    // Nessuno deve poter chiedere diecimila righe in una schermata.
    expect((await listGuests(venueId, { perPagina: 100_000 })).perPagina).toBe(200);
    expect((await listGuests(venueId, { perPagina: 1 })).perPagina).toBe(10);
  });
});

describe("le etichette", () => {
  it("ci sono tutte, anche quella di un solo cliente in fondo all'archivio", async () => {
    const tags = await listDistinctTags(venueId);
    // È la regressione: con la lettura dei primi N ospiti, un'etichetta usata
    // da uno solo — e in coda all'ordinamento — sparirebbe dal filtro.
    expect(tags).toContain(`${PREFISSO}rarissima`);
    expect(tags).toContain(`${PREFISSO}gruppo0`);
  });

  it("sono distinte e in ordine", async () => {
    const tags = await listDistinctTags(venueId);
    expect(new Set(tags).size).toBe(tags.length);
    expect([...tags].sort()).toEqual(tags);
  });

  it("non arrivano dagli altri locali", async () => {
    expect(await listDistinctTags(venueId)).not.toContain(`${PREFISSO}altrui`);
    expect(await listDistinctTags(altroVenueId)).toEqual([`${PREFISSO}altrui`]);
  });
});
