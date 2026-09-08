import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  INVITO_GIORNI,
  TeamError,
  accettaInvito,
  cambiaRuolo,
  invitaAlTeam,
  leggiInvito,
  listInviti,
  listTeam,
  revocaInvito,
  togliDalTeam,
} from "@/server/team";

/**
 * Dare accesso a una persona, e non chiudersi fuori da soli.
 *
 * Fino a ieri `VenueMembership` la scriveva solo il seed: i cinque ruoli
 * funzionavano e non c'era modo di assegnarli. Adesso si può, e la parte che
 * questi test difendono non è l'invito — è **tutto quello che non deve
 * succedere**:
 *
 * - un link che vale due volte;
 * - un invito che sopravvive alla scadenza;
 * - due accessi allo stesso locale per la stessa persona;
 * - un manager che si toglie l'accesso da solo;
 * - l'ultimo manager degradato, che rende il locale inaccessibile per sempre.
 *
 * L'ultimo è quello che fa più danno e non si vede: senza manager nessuno può
 * più invitare nessuno.
 */

const db = new PrismaClient();
const PREFISSO = "test-team-";
const BASE = "https://prova.tavolo.test";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let managerId = "";
let managerMembershipId = "";

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.user.deleteMany({ where: { email: { contains: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

beforeEach(async () => {
  await db.venueInvite.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.venueMembership.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.user.deleteMany({ where: { email: { contains: PREFISSO } } });

  const manager = await db.user.create({
    data: { email: `${PREFISSO}manager@test.local`, name: "Manager", passwordHash: "x" },
  });
  managerId = manager.id;
  managerMembershipId = (
    await db.venueMembership.create({ data: { userId: manager.id, venueId, role: "MANAGER" } })
  ).id;
});

const email = (chi: string) => `${PREFISSO}${chi}@test.local`;

describe("invitare", () => {
  it("crea un link che porta al locale, col ruolo scelto", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("sara"), role: "RECEPTION" }, BASE);

    expect(invito.link).toContain(`${BASE}/invito/`);
    expect(invito.role).toBe("RECEPTION");
    // Una settimana: il tempo di vedere il messaggio.
    const giorni = Math.round((invito.scadeIl.getTime() - Date.now()) / 86_400_000);
    expect(giorni).toBe(INVITO_GIORNI);

    const aperti = await listInviti(venueId, BASE);
    expect(aperti.map((i) => i.email)).toEqual([email("sara")]);
  });

  it("chi è già nel team non si invita", async () => {
    const u = await db.user.create({ data: { email: email("dentro"), passwordHash: "x" } });
    await db.venueMembership.create({ data: { userId: u.id, venueId, role: "WAITER" } });

    await expect(invitaAlTeam(venueId, { email: email("dentro"), role: "WAITER" }, BASE)).rejects.toThrow(
      TeamError,
    );
  });

  it("un secondo invito per la stessa persona sostituisce il primo", async () => {
    const primo = await invitaAlTeam(venueId, { email: email("bis"), role: "WAITER" }, BASE);
    const secondo = await invitaAlTeam(venueId, { email: email("bis"), role: "MANAGER" }, BASE);

    // Due link validi per la stessa persona sono due modi di entrare, e uno
    // dei due nessuno lo ricorda.
    const aperti = await listInviti(venueId, BASE);
    expect(aperti).toHaveLength(1);
    expect(aperti[0].role).toBe("MANAGER");
    expect(await leggiInvito(primo.link.split("/invito/")[1])).toBeNull();
    expect(await leggiInvito(secondo.link.split("/invito/")[1])).not.toBeNull();
  });

  it("un indirizzo che non è un indirizzo viene rifiutato", async () => {
    await expect(invitaAlTeam(venueId, { email: "chiamami", role: "WAITER" }, BASE)).rejects.toThrow();
  });
});

describe("il link, dal lato di chi lo riceve", () => {
  it("dice dove sta entrando e con che ruolo, e niente di più", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("nuova"), role: "MARKETING" }, BASE);
    const token = invito.link.split("/invito/")[1];

    const letto = await leggiInvito(token);
    expect(letto?.venueName).toContain(PREFISSO);
    expect(letto?.email).toBe(email("nuova"));
    expect(letto?.ruolo).toBe("MARKETING");
    expect(letto?.haGiaUnAccount).toBe(false);
  });

  it("riconosce chi ha già un accesso a Tavolo", async () => {
    await db.user.create({ data: { email: email("veterana"), passwordHash: "x" } });
    const invito = await invitaAlTeam(venueId, { email: email("veterana"), role: "RECEPTION" }, BASE);
    const letto = await leggiInvito(invito.link.split("/invito/")[1]);
    expect(letto?.haGiaUnAccount).toBe(true);
  });

  it("un token inventato non esiste, e non dice perché", async () => {
    expect(await leggiInvito("non-esiste-proprio")).toBeNull();
  });

  it("scaduto non vale più", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("tardi"), role: "WAITER" }, BASE);
    const token = invito.link.split("/invito/")[1];
    await db.venueInvite.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    expect(await leggiInvito(token)).toBeNull();
    await expect(accettaInvito({ token, nome: "Tardi", password: "unapasswordlunga" })).rejects.toThrow(
      TeamError,
    );
  });

  it("revocato non vale più", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("revocata"), role: "WAITER" }, BASE);
    await revocaInvito(venueId, invito.id);
    expect(await leggiInvito(invito.link.split("/invito/")[1])).toBeNull();
  });
});

describe("accettare", () => {
  it("chi non ha un accesso lo crea, e entra col ruolo dell'invito", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("prima"), role: "RECEPTION" }, BASE);
    const esito = await accettaInvito({
      token: invito.link.split("/invito/")[1],
      nome: "Prima Volta",
      password: "unapasswordlunga",
    });

    expect(esito.nuovoAccesso).toBe(true);
    const team = await listTeam(venueId, managerId);
    expect(team.find((m) => m.email === email("prima"))?.role).toBe("RECEPTION");

    const utente = await db.user.findUniqueOrThrow({ where: { email: email("prima") } });
    // La password si salva cifrata, mai in chiaro.
    expect(utente.passwordHash).not.toBe("unapasswordlunga");
    expect(utente.passwordHash?.startsWith("$2")).toBe(true);
  });

  it("una password corta non basta: dieci caratteri, e lo dice in italiano", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("corta"), role: "WAITER" }, BASE);
    await expect(
      accettaInvito({ token: invito.link.split("/invito/")[1], nome: "Corta", password: "breve" }),
    ).rejects.toThrow(/dieci caratteri/);
  });

  it("chi non ha un accesso deve scegliere una password: senza, non entra", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("senzapw"), role: "WAITER" }, BASE);
    await expect(
      accettaInvito({ token: invito.link.split("/invito/")[1], nome: "Senza" }),
    ).rejects.toMatchObject({ code: "password_richiesta" });
  });

  it("chi ha già un accesso non ne crea un secondo: gli si aggiunge il locale", async () => {
    const gia = await db.user.create({
      data: { email: email("gruppo"), name: "Del Gruppo", passwordHash: "hash-esistente" },
    });
    await db.venueMembership.create({ data: { userId: gia.id, venueId: altroVenueId, role: "MANAGER" } });

    const invito = await invitaAlTeam(venueId, { email: email("gruppo"), role: "WAITER" }, BASE);
    const esito = await accettaInvito({ token: invito.link.split("/invito/")[1] });

    expect(esito.nuovoAccesso).toBe(false);
    // La password di prima resta la sua: l'invito non la cambia.
    const utente = await db.user.findUniqueOrThrow({ where: { id: gia.id } });
    expect(utente.passwordHash).toBe("hash-esistente");
    expect(await db.venueMembership.count({ where: { userId: gia.id } })).toBe(2);
  });

  it("vale una volta sola", async () => {
    const invito = await invitaAlTeam(venueId, { email: email("unavolta"), role: "WAITER" }, BASE);
    const token = invito.link.split("/invito/")[1];
    await accettaInvito({ token, nome: "Una Volta", password: "unapasswordlunga" });

    // Un link che resta valido dopo l'uso è un accesso in più che nessuno sa
    // di avere.
    await expect(accettaInvito({ token })).rejects.toThrow(TeamError);
    expect(await leggiInvito(token)).toBeNull();
  });
});

describe("non chiudersi fuori da soli", () => {
  it("su di sé non si agisce: né togliersi, né abbassarsi il ruolo", async () => {
    await expect(togliDalTeam(venueId, managerMembershipId, managerId)).rejects.toMatchObject({
      code: "non_su_di_te",
    });
    await expect(
      cambiaRuolo(venueId, managerMembershipId, "READ_ONLY", managerId),
    ).rejects.toMatchObject({ code: "non_su_di_te" });
  });

  it("l'ultimo manager non si tocca: senza manager il locale è inaccessibile per sempre", async () => {
    const altro = await db.user.create({ data: { email: email("secondo"), passwordHash: "x" } });
    const suo = await db.venueMembership.create({
      data: { userId: altro.id, venueId, role: "MANAGER" },
    });

    // Con due manager si può degradare uno dei due…
    await cambiaRuolo(venueId, suo.id, "RECEPTION", managerId);
    // …ma adesso quello che resta è l'ultimo, e nessuno può toccarlo.
    const terzo = await db.user.create({ data: { email: email("terzo"), passwordHash: "x" } });
    await db.venueMembership.create({ data: { userId: terzo.id, venueId, role: "MANAGER" } });
    await db.venueMembership.delete({ where: { id: managerMembershipId } });

    const rimasti = await db.venueMembership.findMany({ where: { venueId, role: "MANAGER" } });
    expect(rimasti).toHaveLength(1);
    await expect(
      cambiaRuolo(venueId, rimasti[0].id, "WAITER", terzo.id === rimasti[0].userId ? "altro" : terzo.id),
    ).rejects.toMatchObject({ code: "ultimo_manager" });
    await expect(
      togliDalTeam(venueId, rimasti[0].id, "qualcun-altro"),
    ).rejects.toMatchObject({ code: "ultimo_manager" });
  });

  it("chi non è manager si può togliere, e sparisce dal team", async () => {
    const u = await db.user.create({ data: { email: email("via"), passwordHash: "x" } });
    const suo = await db.venueMembership.create({ data: { userId: u.id, venueId, role: "WAITER" } });

    await togliDalTeam(venueId, suo.id, managerId);
    const team = await listTeam(venueId, managerId);
    expect(team.map((m) => m.email)).not.toContain(email("via"));
  });

  it("il team di un altro locale non si tocca", async () => {
    const u = await db.user.create({ data: { email: email("altrove"), passwordHash: "x" } });
    const suo = await db.venueMembership.create({
      data: { userId: u.id, venueId: altroVenueId, role: "WAITER" },
    });
    await expect(togliDalTeam(venueId, suo.id, managerId)).rejects.toThrow(TeamError);
  });
});
