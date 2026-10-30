import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * L'accesso di una persona non è di un locale.
 *
 * Password ed email stanno sull'`User`, che è uno per persona in tutta
 * Tavolo. Fino al 30 ottobre 2026 un manager poteva invitare il titolare di
 * un altro locale (o un amministratore di piattaforma), accettare il link al
 * posto suo, collegarlo a una scheda dell'organico e da lì sceglierne la
 * password. Questi test difendono **i passi di quella catena** dal lato della
 * scheda, e le due porte che una revoca delle sessioni non chiudeva.
 */

// La sessione la decide il test: NextAuth fuori da Next non gira.
const sessione = vi.hoisted(() => ({ attuale: null as unknown }));
vi.mock("@/lib/auth", () => ({ auth: async () => sessione.attuale, authOptions: {} }));

const {
  AccountError,
  cambiaEmailAccesso,
  creaAccesso,
  generaLinkReset,
  impostaPassword,
} = await import("@/server/staff-account");
const { superAdminCorrente } = await import("@/lib/super-admin");
const { sessioneRevocata, utenteDiSessione } = await import("@/lib/sessione");
const { origineFidata } = await import("@/lib/origine");

const db = new PrismaClient();
const PREFISSO = "test-altrui-";
const BASE = "https://prova.tavolo.test";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const email = (chi: string) => `${PREFISSO}${chi}@test.local`;
const superAdminOriginale = process.env.SUPER_ADMIN_EMAILS;

let venueId = "";
let altroVenueId = "";

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
  await db.waiter.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.venueInvite.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.venueMembership.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.user.deleteMany({ where: { email: { contains: PREFISSO } } });
  sessione.attuale = null;
});

afterEach(() => {
  process.env.SUPER_ADMIN_EMAILS = superAdminOriginale;
});

/** Una persona in organico qui, collegata a un `User` che è membro qui. */
async function schedaCollegata(chi: string, ancheAltrove: boolean) {
  const utente = await db.user.create({ data: { email: email(chi), passwordHash: "hash-suo" } });
  await db.venueMembership.create({ data: { userId: utente.id, venueId, role: "WAITER" } });
  if (ancheAltrove) {
    await db.venueMembership.create({ data: { userId: utente.id, venueId: altroVenueId, role: "MANAGER" } });
  }
  const scheda = await db.waiter.create({
    data: {
      venueId,
      firstName: "Prova",
      lastName: chi,
      birthday: new Date("1990-01-01"),
      phone: "000",
      email: email(chi),
      role: "Sala",
      userId: utente.id,
    },
  });
  return { utente, scheda };
}

describe("password ed email di chi entra anche altrove", () => {
  it("la password non la sceglie il responsabile", async () => {
    const { utente, scheda } = await schedaCollegata("titolare", true);
    await expect(
      impostaPassword(venueId, scheda.id, { password: "scelta-dal-manager" }),
    ).rejects.toMatchObject({ code: "gestito_altrove" });
    expect((await db.user.findUniqueOrThrow({ where: { id: utente.id } })).passwordHash).toBe("hash-suo");
  });

  it("niente link di reimpostazione da consegnare a mano", async () => {
    const { utente, scheda } = await schedaCollegata("titolare", true);
    await expect(generaLinkReset(venueId, scheda.id, BASE)).rejects.toMatchObject({ code: "gestito_altrove" });
    expect((await db.user.findUniqueOrThrow({ where: { id: utente.id } })).passwordResetHash).toBeNull();
  });

  it("l'email non si cambia", async () => {
    const { utente, scheda } = await schedaCollegata("titolare", true);
    await expect(
      cambiaEmailAccesso(venueId, scheda.id, { email: email("nuova") }),
    ).rejects.toMatchObject({ code: "gestito_altrove" });
    expect((await db.user.findUniqueOrThrow({ where: { id: utente.id } })).email).toBe(email("titolare"));
  });

  it("vale anche se l'accesso altrove è disattivato: si riattiva", async () => {
    const { utente, scheda } = await schedaCollegata("sospeso", true);
    await db.venueMembership.updateMany({
      where: { userId: utente.id, venueId: altroVenueId },
      data: { disabledAt: new Date() },
    });
    await expect(
      impostaPassword(venueId, scheda.id, { password: "scelta-dal-manager" }),
    ).rejects.toBeInstanceOf(AccountError);
  });

  it("un amministratore di piattaforma non si tocca, anche se entra solo qui", async () => {
    const { scheda } = await schedaCollegata("capo", false);
    process.env.SUPER_ADMIN_EMAILS = email("capo");
    await expect(
      impostaPassword(venueId, scheda.id, { password: "scelta-dal-manager" }),
    ).rejects.toMatchObject({ code: "gestito_altrove" });
    await expect(generaLinkReset(venueId, scheda.id, BASE)).rejects.toMatchObject({ code: "gestito_altrove" });
  });

  it("chi entra solo qui resta gestibile come prima", async () => {
    const { utente, scheda } = await schedaCollegata("cameriere", false);
    await impostaPassword(venueId, scheda.id, { password: "scelta-dal-manager" });
    const dopo = await db.user.findUniqueOrThrow({ where: { id: utente.id } });
    expect(dopo.passwordHash).not.toBe("hash-suo");
    expect(dopo.sessionsRevokedAt).not.toBeNull();

    const { link } = await generaLinkReset(venueId, scheda.id, BASE);
    expect(link).toContain(`${BASE}/reimposta-password/`);

    await cambiaEmailAccesso(venueId, scheda.id, { email: email("cameriere-nuova") });
    expect((await db.user.findUniqueOrThrow({ where: { id: utente.id } })).email).toBe(email("cameriere-nuova"));
  });
});

describe("gli indirizzi degli amministratori di piattaforma", () => {
  it("non si mettono su un account del locale", async () => {
    const { scheda } = await schedaCollegata("furbo", false);
    process.env.SUPER_ADMIN_EMAILS = email("capo");
    await expect(
      cambiaEmailAccesso(venueId, scheda.id, { email: email("capo") }),
    ).rejects.toMatchObject({ code: "indirizzo_riservato" });
  });

  it("non diventano un accesso dalla scheda", async () => {
    process.env.SUPER_ADMIN_EMAILS = email("capo");
    const scheda = await db.waiter.create({
      data: {
        venueId,
        firstName: "Prova",
        lastName: "Capo",
        birthday: new Date("1990-01-01"),
        phone: "000",
        role: "Sala",
      },
    });
    await expect(
      creaAccesso(venueId, scheda.id, { email: email("capo"), role: "WAITER" }, BASE),
    ).rejects.toMatchObject({ code: "indirizzo_riservato" });
    expect(await db.venueInvite.count({ where: { venueId } })).toBe(0);
  });
});

describe("le porte che non passano da un locale rispettano la revoca", () => {
  it("la regola: nata prima della revoca non vale, senza data nemmeno", () => {
    const revoca = new Date("2026-10-30T10:00:00Z");
    expect(sessioneRevocata(undefined, null)).toBe(false);
    expect(sessioneRevocata(revoca.getTime() - 1, revoca)).toBe(true);
    expect(sessioneRevocata(undefined, revoca)).toBe(true);
    expect(sessioneRevocata(revoca.getTime(), revoca)).toBe(false);
  });

  it("il pannello di piattaforma chiude fuori una sessione revocata", async () => {
    process.env.SUPER_ADMIN_EMAILS = email("capo");
    const capo = await db.user.create({ data: { email: email("capo"), passwordHash: "x" } });
    const nata = Date.now() - 60_000;
    sessione.attuale = { user: { id: capo.id, email: email("capo") }, sessioneDa: nata };

    expect(await superAdminCorrente()).toEqual({ ok: true, email: email("capo") });

    // «Esci da tutti», o una password reimpostata.
    await db.user.update({ where: { id: capo.id }, data: { sessionsRevokedAt: new Date() } });
    expect(await superAdminCorrente()).toEqual({ ok: false });
    expect(await utenteDiSessione()).toBeNull();

    // Chi rientra dopo la revoca torna dentro.
    sessione.attuale = { user: { id: capo.id, email: email("capo") }, sessioneDa: Date.now() + 1000 };
    expect((await superAdminCorrente()).ok).toBe(true);
  });

  it("conta l'email dell'account, non quella congelata nel token", async () => {
    process.env.SUPER_ADMIN_EMAILS = email("capo");
    const altro = await db.user.create({ data: { email: email("ex-capo"), passwordHash: "x" } });
    sessione.attuale = { user: { id: altro.id, email: email("capo") }, sessioneDa: Date.now() };
    expect(await superAdminCorrente()).toEqual({ ok: false });
  });
});

describe("l'indirizzo dei link che portano un segreto", () => {
  const originale = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originale;
  });
  const intestazioni = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

  it("vince la variabile d'ambiente, non l'intestazione di chi chiede", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.tavolo.it/";
    expect(origineFidata(intestazioni({ "x-forwarded-host": "sito-mio.it", host: "sito-mio.it" }))).toBe(
      "https://app.tavolo.it",
    );
  });

  it("senza variabile, ripiega sulla richiesta", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(origineFidata(intestazioni({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });
});
