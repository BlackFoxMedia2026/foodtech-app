import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { ERRORE_TROPPI_TENTATIVI, messaggioAccesso } from "@/lib/errori-accesso";

/**
 * Rientrare da soli quando si è perso l'accesso.
 *
 * In Tavolo non si poteva: «Password dimenticata?» sotto il modulo era uno
 * `<span>` — sembrava un collegamento e non portava da nessuna parte — e le
 * due strade per reimpostare una password passavano entrambe da qualcun
 * altro. Per un cameriere va bene; per chi gestisce il locale non c'è nessuno
 * sopra a cui chiedere.
 *
 * Quello che questi test difendono non è l'email: è **quello che non deve
 * succedere**.
 *
 * - il modulo che risponde in modo diverso a un'email registrata e a una
 *   sconosciuta, cioè che regala a chiunque l'elenco di chi lavora qui;
 * - una persona disattivata che rientra dalla porta di servizio;
 * - un link che vale due volte, o che sopravvive alla scadenza;
 * - due link vivi insieme (il secondo deve annullare il primo);
 * - «credenziali non valide» detto a chi ha la password giusta ed è solo
 *   arrivato al limite dei tentativi.
 */

const db = new PrismaClient();
const PREFISSO = "test-recupero-";
const ORIGINE = "https://prova.tavolo.test";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/** Le email intercettate: `sendTransactionalEmail` non deve uscire dal processo. */
const spedite: { to: string; subject: string; html: string }[] = [];
let rifiuta = false;

vi.mock("@/server/marketing/brevo-adapter", () => ({
  brevoAdapter: {
    async sendTransactionalEmail(payload: { to: string; subject: string; html: string }) {
      if (rifiuta) throw new Error("brevo_ha_detto_no");
      spedite.push(payload);
    },
  },
}));

const { chiediRecuperoPassword } = await import("@/server/recupero-password");
const { completaReset, leggiReset, AccountError } = await import("@/server/staff-account");

function tokenDalLink(link: string) {
  return link.split("/").pop() ?? "";
}

/** Il token si estrae dall'email, come farebbe chi la riceve. */
function tokenDallaEmail(html: string) {
  const m = html.match(/reimposta-password\/([a-f0-9]{64})/);
  if (!m) throw new Error("nell'email non c'è nessun link di reimpostazione");
  return m[1];
}

let venueId = "";
let emailAttivo = "";
let emailDisattivato = "";
let emailSenzaPassword = "";
let emailSuperAdmin = "";
let idAttivo = "";

beforeAll(async () => {
  process.env.BREVO_API_KEY ||= "prova";

  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` },
    })
  ).id;

  const marca = Date.now();
  emailAttivo = `${PREFISSO}attivo${marca}@tavolo.test`;
  emailDisattivato = `${PREFISSO}spento${marca}@tavolo.test`;
  emailSenzaPassword = `${PREFISSO}senza${marca}@tavolo.test`;

  const attivo = await db.user.create({
    data: { email: emailAttivo, name: "Chi Rientra", passwordHash: "$2a$10$non-serve-che-sia-vera" },
  });
  idAttivo = attivo.id;
  await db.venueMembership.create({ data: { venueId, userId: attivo.id, role: "MANAGER" } });

  const spento = await db.user.create({
    data: { email: emailDisattivato, passwordHash: "$2a$10$non-serve-che-sia-vera" },
  });
  await db.venueMembership.create({
    data: { venueId, userId: spento.id, role: "WAITER", disabledAt: new Date() },
  });

  const senza = await db.user.create({ data: { email: emailSenzaPassword } });
  await db.venueMembership.create({ data: { venueId, userId: senza.id, role: "WAITER" } });

  /* Un amministratore di piattaforma: riconosciuto dalla sola email, **senza
     nessun locale**. È il caso che il primo controllo escludeva in silenzio. */
  emailSuperAdmin = `${PREFISSO}capo${marca}@tavolo.test`;
  await db.user.create({
    data: { email: emailSuperAdmin, passwordHash: "$2a$10$non-serve-che-sia-vera" },
  });
});

afterAll(async () => {
  await db.venueMembership.deleteMany({ where: { venueId } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
  const venue = await db.venue.findUnique({ where: { id: venueId }, select: { orgId: true } });
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  if (venue) await db.organization.delete({ where: { id: venue.orgId } }).catch(() => {});
  await db.$disconnect();
});

beforeEach(() => {
  spedite.length = 0;
  rifiuta = false;
});

describe("chi chiede il link", () => {
  it("manda l'email a chi ha un accesso attivo", async () => {
    const esito = await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    expect(esito).toEqual({ stato: "presa_in_carico" });
    expect(spedite).toHaveLength(1);
    expect(spedite[0].to).toBe(emailAttivo);
    expect(spedite[0].html).toContain(`${ORIGINE}/reimposta-password/`);
    // Il nome, se c'è, apre l'email; e il link è quello dell'origine chiesta.
    expect(spedite[0].html).toContain("Chi Rientra");
  });

  it("scrive nel database l'hash del token, non il token", async () => {
    await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    const token = tokenDallaEmail(spedite[0].html);
    const riga = await db.user.findUniqueOrThrow({
      where: { id: idAttivo },
      select: { passwordResetHash: true, passwordResetExpiresAt: true },
    });
    expect(riga.passwordResetHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(riga.passwordResetHash).not.toBe(token);
    expect(riga.passwordResetExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("risponde allo stesso modo a un indirizzo che non esiste, e non manda niente", async () => {
    const esito = await chiediRecuperoPassword(
      { email: `${PREFISSO}mai-visto@tavolo.test` },
      ORIGINE,
    );
    expect(esito).toEqual({ stato: "presa_in_carico" });
    expect(spedite).toHaveLength(0);
  });

  it("risponde allo stesso modo a chi è stato disattivato, e non riapre la porta", async () => {
    const esito = await chiediRecuperoPassword({ email: emailDisattivato }, ORIGINE);
    expect(esito).toEqual({ stato: "presa_in_carico" });
    expect(spedite).toHaveLength(0);
    const riga = await db.user.findFirstOrThrow({ where: { email: emailDisattivato } });
    expect(riga.passwordResetHash).toBeNull();
  });

  it("non manda niente a chi non ha ancora un account con password", async () => {
    const esito = await chiediRecuperoPassword({ email: emailSenzaPassword }, ORIGINE);
    expect(esito).toEqual({ stato: "presa_in_carico" });
    expect(spedite).toHaveLength(0);
  });

  it("manda l'email a un amministratore di piattaforma anche se non ha nessun locale", async () => {
    const prima = process.env.SUPER_ADMIN_EMAILS;
    process.env.SUPER_ADMIN_EMAILS = `qualcun.altro@tavolo.test, ${emailSuperAdmin}`;
    try {
      const esito = await chiediRecuperoPassword({ email: emailSuperAdmin }, ORIGINE);
      expect(esito).toEqual({ stato: "presa_in_carico" });
      // La prova che poteva diventare rossa: col solo controllo
      // sull'appartenenza a un locale, qui non partiva niente e la pagina
      // diceva «controlla la posta» a chi non avrebbe ricevuto mai nulla.
      expect(spedite).toHaveLength(1);
      expect(spedite[0].to).toBe(emailSuperAdmin);
    } finally {
      if (prima === undefined) delete process.env.SUPER_ADMIN_EMAILS;
      else process.env.SUPER_ADMIN_EMAILS = prima;
    }
  });

  it("chi non è nell'elenco degli amministratori e non ha locali resta fuori", async () => {
    const prima = process.env.SUPER_ADMIN_EMAILS;
    delete process.env.SUPER_ADMIN_EMAILS;
    try {
      const esito = await chiediRecuperoPassword({ email: emailSuperAdmin }, ORIGINE);
      expect(esito).toEqual({ stato: "presa_in_carico" });
      expect(spedite).toHaveLength(0);
    } finally {
      if (prima !== undefined) process.env.SUPER_ADMIN_EMAILS = prima;
    }
  });

  it("non guarda le maiuscole dell'indirizzo", async () => {
    await chiediRecuperoPassword({ email: emailAttivo.toUpperCase() }, ORIGINE);
    expect(spedite).toHaveLength(1);
  });

  it("dice che l'email non è partita invece di far aspettare un messaggio che non arriva", async () => {
    rifiuta = true;
    const esito = await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    expect(esito).toEqual({ stato: "invio_non_riuscito" });
  });

  it("senza fornitore di posta lo dice, e non dipende dall'indirizzo", async () => {
    const prima = process.env.BREVO_API_KEY;
    delete process.env.BREVO_API_KEY;
    try {
      const noto = await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
      const ignoto = await chiediRecuperoPassword({ email: "nessuno@tavolo.test" }, ORIGINE);
      expect(noto).toEqual({ stato: "posta_non_configurata" });
      expect(ignoto).toEqual(noto);
      expect(spedite).toHaveLength(0);
    } finally {
      process.env.BREVO_API_KEY = prima;
    }
  });
});

describe("il link che arriva", () => {
  it("vale una volta sola", async () => {
    await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    const token = tokenDallaEmail(spedite[0].html);

    await completaReset({ token, password: "unaPasswordLunga1" });
    await expect(
      completaReset({ token, password: "altraPasswordLunga1" }),
    ).rejects.toThrow(AccountError);
  });

  it("il secondo annulla il primo", async () => {
    await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    const primo = tokenDallaEmail(spedite[0].html);
    await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    const secondo = tokenDallaEmail(spedite[1].html);

    expect(secondo).not.toBe(primo);
    expect(await leggiReset(primo)).toBeNull();
    expect(await leggiReset(secondo)).not.toBeNull();
  });

  it("scaduto non vale più", async () => {
    await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    const token = tokenDallaEmail(spedite[0].html);
    await db.user.update({
      where: { id: idAttivo },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await leggiReset(token)).toBeNull();
    await expect(
      completaReset({ token, password: "unaPasswordLunga1" }),
    ).rejects.toThrow(AccountError);
  });

  it("apre la reimpostazione e la consuma: chi entra sceglie la password e le altre sessioni escono", async () => {
    await db.user.update({ where: { id: idAttivo }, data: { sessionsRevokedAt: null } });
    await chiediRecuperoPassword({ email: emailAttivo }, ORIGINE);
    const token = tokenDallaEmail(spedite[0].html);

    await completaReset({ token, password: "passwordNuova2026" });

    const riga = await db.user.findUniqueOrThrow({ where: { id: idAttivo } });
    expect(riga.passwordResetHash).toBeNull();
    expect(riga.passwordResetExpiresAt).toBeNull();
    expect(riga.sessionsRevokedAt).not.toBeNull();
    const bcrypt = (await import("bcryptjs")).default;
    expect(await bcrypt.compare("passwordNuova2026", riga.passwordHash!)).toBe(true);
  });

  it("un token inventato non dice se ha indovinato", async () => {
    expect(await leggiReset("f".repeat(64))).toBeNull();
    expect(await leggiReset("non-e-un-token")).toBeNull();
  });
});

describe("cosa scrive la schermata d'accesso", () => {
  it("il limite dei tentativi non si spaccia per una password sbagliata", () => {
    expect(messaggioAccesso(ERRORE_TROPPI_TENTATIVI)).toContain("Troppi tentativi");
    expect(messaggioAccesso("CredentialsSignin", 429)).toContain("Troppi tentativi");
    // La prova che potrebbe diventare rossa: senza la correzione, qui c'era
    // «Credenziali non valide» anche con la password giusta.
    expect(messaggioAccesso(ERRORE_TROPPI_TENTATIVI)).not.toContain("Credenziali non valide");
  });

  it("una password davvero sbagliata resta «credenziali non valide»", () => {
    expect(messaggioAccesso("CredentialsSignin", 401)).toBe("Credenziali non valide.");
  });
});
