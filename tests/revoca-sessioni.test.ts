import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { TeamError, chiudiLeMieSessioni, chiudiLeSessioni } from "@/server/team";

/**
 * La revoca delle sessioni.
 *
 * Una sessione, qui, è un token firmato: non una riga che si possa cancellare.
 * Quindi la revoca è un istante — «tutto quello che è stato emesso prima non
 * vale più» — e tutto dipende da tre cose:
 *
 * - **le sessioni vecchie muoiono.** È il punto: il tablet perso in sala e la
 *   persona che non lavora più qui;
 * - **le sessioni nuove vivono.** Chi rientra con la sua password deve
 *   restare dentro, altrimenti la revoca è un divieto e non un
 *   «ricominciamo»;
 * - **si può chiudere fuori anche l'ultimo manager.** È il caso in cui serve
 *   di più, e la difesa che protegge il locale da chi si toglie l'accesso non
 *   deve valere qui: chiudere una sessione non toglie l'accesso.
 */

const db = new PrismaClient();
const PREFISSO = "test-revoca-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";
let managerUserId = "";
let managerMembershipId = "";
let cameriereUserId = "";
let cameriereMembershipId = "";

/**
 * La stessa regola che applica `lib/tenant.ts` a ogni richiesta: una sessione
 * nata prima della revoca non vale più. Qui è una funzione di tre righe perché
 * il test deve verificare **la regola**, non il modo in cui NextAuth firma i
 * token.
 */
function sessioneValida(sessioneDa: number | undefined, revocaDa: Date | null): boolean {
  if (!revocaDa) return true;
  if (sessioneDa === undefined) return false;
  return sessioneDa >= revocaDa.getTime();
}

async function revocaDi(userId: string) {
  return (
    await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionsRevokedAt: true } })
  ).sessionsRevokedAt;
}

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;

  managerUserId = (
    await db.user.create({ data: { email: `${PREFISSO}manager@tavolo.test`, name: "Titolare" } })
  ).id;
  cameriereUserId = (
    await db.user.create({ data: { email: `${PREFISSO}cameriere@tavolo.test`, name: "Cameriere" } })
  ).id;

  managerMembershipId = (
    await db.venueMembership.create({ data: { venueId, userId: managerUserId, role: "MANAGER" } })
  ).id;
  cameriereMembershipId = (
    await db.venueMembership.create({ data: { venueId, userId: cameriereUserId, role: "WAITER" } })
  ).id;
}, 60_000);

afterEach(async () => {
  await db.user.updateMany({
    where: { id: { in: [managerUserId, cameriereUserId] } },
    data: { sessionsRevokedAt: null },
  });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("cosa muore e cosa vive", () => {
  it("una sessione aperta prima della revoca non vale più", async () => {
    const apertaPrima = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    await chiudiLeSessioni(venueId, cameriereMembershipId, managerUserId);
    expect(sessioneValida(apertaPrima, await revocaDi(cameriereUserId))).toBe(false);
  });

  it("una sessione aperta dopo la revoca vale", async () => {
    await chiudiLeSessioni(venueId, cameriereMembershipId, managerUserId);
    await new Promise((r) => setTimeout(r, 5));
    // Chi rientra con la sua password resta dentro: la revoca è un
    // «ricominciamo da capo», non un divieto.
    expect(sessioneValida(Date.now(), await revocaDi(cameriereUserId))).toBe(true);
  });

  it("senza revoca, ogni sessione vale — anche una vecchissima", () => {
    // La scadenza dei sette giorni è un'altra difesa, e la fa NextAuth: qui si
    // verifica solo che la revoca non inventi divieti dove nessuno ha chiesto
    // niente.
    expect(sessioneValida(new Date("2020-01-01").getTime(), null)).toBe(true);
  });

  it("un token senza data di nascita, con una revoca in corso, non vale", async () => {
    /*
      Sono i token emessi prima che questa funzione esistesse: non sappiamo
      quando quella sessione è nata. Chiedere di rientrare è il male minore;
      il male maggiore è lasciare dentro il tablet che si voleva chiudere
      fuori.
    */
    await chiudiLeSessioni(venueId, cameriereMembershipId, managerUserId);
    expect(sessioneValida(undefined, await revocaDi(cameriereUserId))).toBe(false);
  });

  it("la revoca di una persona non tocca le sessioni delle altre", async () => {
    const sessioneDelManager = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    await chiudiLeSessioni(venueId, cameriereMembershipId, managerUserId);
    expect(sessioneValida(sessioneDelManager, await revocaDi(managerUserId))).toBe(true);
  });
});

describe("le difese", () => {
  it("si possono chiudere le sessioni dell'ultimo manager", async () => {
    /*
      È il caso in cui la revoca serve di più: il tablet perso è del titolare,
      e il titolare è l'unico manager. La difesa che impedisce di togliere
      l'accesso all'ultimo manager — senza manager il locale diventa
      inaccessibile per sempre — **non vale qui**: chiudere una sessione non
      toglie l'accesso, la persona rientra con la sua password.
    */
    const manager = await db.venueMembership.count({ where: { venueId, role: "MANAGER" } });
    expect(manager).toBe(1);
    await expect(
      chiudiLeSessioni(venueId, managerMembershipId, cameriereUserId),
    ).resolves.toBeInstanceOf(Date);
  });

  it("su di sé non si agisce da qui", async () => {
    await expect(
      chiudiLeSessioni(venueId, managerMembershipId, managerUserId),
    ).rejects.toThrow(TeamError);
  });

  it("chiudere le proprie sessioni è sempre lecito, e non serve essere manager", async () => {
    await chiudiLeMieSessioni(cameriereUserId);
    expect(await revocaDi(cameriereUserId)).toBeInstanceOf(Date);
  });

  it("una persona di un altro locale non si tocca", async () => {
    const altraOrg = await db.organization.create({
      data: { name: `${PREFISSO}altra`, slug: `${PREFISSO}alt${Date.now()}` },
    });
    const altroVenue = await db.venue.create({
      data: { orgId: altraOrg.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` },
    });
    const estraneo = await db.user.create({
      data: { email: `${PREFISSO}estraneo@tavolo.test` },
    });
    const suaAppartenenza = await db.venueMembership.create({
      data: { venueId: altroVenue.id, userId: estraneo.id, role: "MANAGER" },
    });

    // L'appartenenza esiste, ma non in **questo** locale: il guardiano deve
    // dire no, altrimenti un manager potrebbe chiudere fuori il personale di
    // un ristorante che non è suo.
    await expect(
      chiudiLeSessioni(venueId, suaAppartenenza.id, managerUserId),
    ).rejects.toThrow(TeamError);
    expect(await revocaDi(estraneo.id)).toBeNull();
  });
});

describe("il registro", () => {
  it("chiudere le sessioni di qualcuno lascia una riga con chi, su chi e quando", async () => {
    await chiudiLeSessioni(venueId, cameriereMembershipId, managerUserId, {
      userId: managerUserId,
      orgId,
      venueId,
    });
    const riga = await db.auditLog.findFirst({
      where: { venueId, action: "team.revoke_sessions" },
      orderBy: { createdAt: "desc" },
    });
    expect(riga).not.toBeNull();
    expect((riga?.diff as { utente?: string })?.utente).toBe(cameriereUserId);
  });
});
