import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  WifiError,
  getPortale,
  getWifiStats,
  listWifiLeads,
  registraLead,
  setPortale,
} from "@/server/wifi";
import { normalizzaTelefono, trovaOCreaOspite, trovaOspite } from "@/server/guest-match";

/**
 * Il portale Wi-Fi.
 *
 * Le prove guardano le cose che, sbagliate, fanno danno a una persona vera:
 *
 * - **il portale chiuso non esiste**: nessun modulo che raccoglie email senza
 *   dare niente in cambio;
 * - **la password non arriva prima del contatto**, altrimenti bastava aprire
 *   gli strumenti da sviluppatore;
 * - **chi c'è già non diventa un doppione**: tre copie della stessa persona
 *   sono tre saldi punti che non si sommano;
 * - **il consenso si registra sempre**, anche quando manca — un rifiuto è
 *   un'informazione;
 * - **un rifiuto qui non disiscrive** chi si era iscritto altrove;
 * - **niente due sconti per la stessa promessa**.
 */

const db = new PrismaClient();
const PREFISSO = "test-wifi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let slug = "";
const TZ = "Europe/Rome";

const CONFIG_COMPLETA = {
  networkName: "Aurora-Ospiti",
  password: "buonacena2026",
  welcome: "Benvenuto da noi.",
  legal: "I dati servono a offrirti la rete e, se lo vuoi, a scriverti.",
  couponEnabled: false,
};

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  orgId = org.id;
  slug = `${PREFISSO}v${Date.now()}`;
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug, timezone: TZ } })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.consentLog.deleteMany({ where: { venueId } });
  await db.wifiSession.deleteMany({ where: { venueId } });
  await db.wifiLead.deleteMany({ where: { venueId } });
  await db.couponRedemption.deleteMany({ where: { venueId } });
  await db.coupon.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.venue.update({
    where: { id: venueId },
    data: {
      wifiNetworkName: null,
      wifiPassword: null,
      wifiSetupAt: null,
      wifiAutoCouponEnabled: false,
      wifiAutoCouponPercent: 10,
      wifiAutoCouponDays: 30,
    },
  });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
});

const iscrizione = (extra: Record<string, unknown> = {}) => ({
  name: "Marco Bianchi",
  email: "marco@test.local",
  consentPrivacy: true as const,
  consentMarketing: false,
  ...extra,
});

describe("il portale chiuso", () => {
  it("non esiste finché mancano rete e password", async () => {
    expect(await getPortale(slug)).toBeNull();

    // Metà configurazione non lo apre: senza password non c'è niente da dare.
    await setPortale(venueId, { networkName: "Aurora-Ospiti" });
    expect(await getPortale(slug)).toBeNull();
    await expect(registraLead(slug, iscrizione())).rejects.toMatchObject({ code: "not_configured" });
  });

  it("si apre quando la configurazione è completa, e si richiude se la svuoti", async () => {
    await setPortale(venueId, CONFIG_COMPLETA);
    const aperto = await getPortale(slug);
    expect(aperto?.networkName).toBe("Aurora-Ospiti");

    const primaVolta = (await db.venue.findUniqueOrThrow({ where: { id: venueId } })).wifiSetupAt;
    expect(primaVolta).not.toBeNull();

    // Risalvare non riscrive la data di accensione.
    await setPortale(venueId, { ...CONFIG_COMPLETA, welcome: "Altro testo" });
    const dopo = (await db.venue.findUniqueOrThrow({ where: { id: venueId } })).wifiSetupAt;
    expect(dopo?.getTime()).toBe(primaVolta?.getTime());

    await setPortale(venueId, { networkName: null, password: null });
    expect(await getPortale(slug)).toBeNull();
  });

  it("non manda la password al browser prima del contatto", async () => {
    await setPortale(venueId, CONFIG_COMPLETA);
    const config = await getPortale(slug);
    // Se la password fosse qui, bastava aprire gli strumenti da sviluppatore.
    expect(JSON.stringify(config)).not.toContain("buonacena2026");
  });
});

describe("l'iscrizione", () => {
  beforeEach(async () => {
    await setPortale(venueId, CONFIG_COMPLETA);
  });

  it("restituisce la password e registra il contatto", async () => {
    const esito = await registraLead(slug, iscrizione(), { ip: "1.2.3.4", userAgent: "prova" });
    expect(esito.password).toBe("buonacena2026");
    expect(esito.networkName).toBe("Aurora-Ospiti");
    expect(esito.coupon).toBeNull();

    const lead = await db.wifiLead.findFirstOrThrow({ where: { venueId } });
    expect(lead.email).toBe("marco@test.local");
    expect(lead.consentPrivacy).toBe(true);
    expect(lead.guestId).not.toBeNull();
  });

  it("pretende un contatto e l'informativa accettata", async () => {
    await expect(registraLead(slug, iscrizione({ email: null, phone: null }))).rejects.toThrow();
    await expect(registraLead(slug, iscrizione({ consentPrivacy: false }))).rejects.toThrow();
    expect(await db.wifiLead.count({ where: { venueId } })).toBe(0);
  });

  it("registra il consenso anche quando manca: un rifiuto è un'informazione", async () => {
    await registraLead(slug, iscrizione({ consentMarketing: false }));

    const consensi = await db.consentLog.findMany({ where: { venueId }, orderBy: { channel: "asc" } });
    expect(consensi).toHaveLength(2);
    expect(consensi.find((c) => c.channel === "PRIVACY")?.granted).toBe(true);
    expect(consensi.find((c) => c.channel === "MARKETING_GENERAL")?.granted).toBe(false);
  });

  it("accende il consenso marketing sull'ospite quando c'è", async () => {
    await registraLead(slug, iscrizione({ consentMarketing: true }));
    const ospite = await db.guest.findFirstOrThrow({ where: { venueId } });
    expect(ospite.marketingOptIn).toBe(true);
  });

  it("non disiscrive chi si era iscritto altrove", async () => {
    const gia = await db.guest.create({
      data: { venueId, firstName: "Marco", email: "marco@test.local", marketingOptIn: true },
    });

    await registraLead(slug, iscrizione({ consentMarketing: false }));

    const dopo = await db.guest.findUniqueOrThrow({ where: { id: gia.id } });
    expect(dopo.marketingOptIn).toBe(true);
    // Il rifiuto resta scritto: non si perde, semplicemente non revoca.
    const consenso = await db.consentLog.findFirstOrThrow({
      where: { venueId, channel: "MARKETING_GENERAL" },
    });
    expect(consenso.granted).toBe(false);
  });

  it("non esiste per un locale che non c'è", async () => {
    await expect(registraLead("non-esiste-affatto", iscrizione())).rejects.toBeInstanceOf(WifiError);
  });
});

describe("l'ospite che c'è già", () => {
  beforeEach(async () => {
    await setPortale(venueId, CONFIG_COMPLETA);
  });

  it("si riconosce per email, senza creare un doppione", async () => {
    const gia = await db.guest.create({
      data: { venueId, firstName: "Marco", lastName: "Bianchi", email: "Marco@Test.Local" },
    });

    const esito = await registraLead(slug, iscrizione());
    expect(esito.giaConosciuto).toBe(true);

    const ospiti = await db.guest.findMany({ where: { venueId } });
    expect(ospiti).toHaveLength(1);
    expect(ospiti[0].id).toBe(gia.id);
  });

  it("si riconosce per telefono anche scritto in un altro modo", async () => {
    const gia = await db.guest.create({
      data: { venueId, firstName: "Marco", phone: "+39 340 123 45 67" },
    });

    const esito = await registraLead(slug, iscrizione({ email: null, phone: "3401234567" }));
    // Senza prefisso non è lo stesso numero per certo: qui il confronto è
    // esatto sulla forma normalizzata, quindi nasce un contatto nuovo.
    expect(esito.giaConosciuto).toBe(false);

    const esito2 = await registraLead(slug, iscrizione({ email: null, phone: "+39-340-1234567" }));
    expect(esito2.giaConosciuto).toBe(true);
    expect(await db.guest.count({ where: { venueId, id: gia.id } })).toBe(1);
  });

  it("riempie i buchi ma non sovrascrive niente", async () => {
    const gia = await db.guest.create({
      data: {
        venueId,
        firstName: "Marco",
        lastName: "Bianchi",
        email: "marco@test.local",
        privateNotes: "Preferisce il tavolo in fondo",
      },
    });

    await registraLead(slug, iscrizione({ name: "Marco Rossi", phone: "3401234567" }));

    const dopo = await db.guest.findUniqueOrThrow({ where: { id: gia.id } });
    // Il telefono mancava: si riempie. Il cognome c'era: non si tocca, e le
    // note riservate nemmeno.
    expect(dopo.phone).toBe("3401234567");
    expect(dopo.lastName).toBe("Bianchi");
    expect(dopo.privateNotes).toBe("Preferisce il tavolo in fondo");
  });

  it("non riconosce l'ospite di un altro locale", async () => {
    const altro = await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}x${Date.now()}`, timezone: TZ },
    });
    await db.guest.create({ data: { venueId: altro.id, firstName: "Marco", email: "marco@test.local" } });

    expect(await trovaOspite(venueId, { email: "marco@test.local" })).toBeNull();
    await db.guest.deleteMany({ where: { venueId: altro.id } });
    await db.venue.delete({ where: { id: altro.id } });
  });

  it("non riconosce nessuno senza email né telefono", async () => {
    await db.guest.create({ data: { venueId, firstName: "Marco" } });
    const esito = await trovaOCreaOspite(venueId, { firstName: "Marco" });
    expect(esito.giaConosciuto).toBe(false);
  });
});

describe("normalizzare il telefono", () => {
  it("toglie quello che cambia fra due modi di scriverlo", () => {
    expect(normalizzaTelefono("+39 340 123 45 67")).toBe("+393401234567");
    expect(normalizzaTelefono("340-123.4567")).toBe("3401234567");
    expect(normalizzaTelefono("(340) 1234567")).toBe("3401234567");
  });

  it("scarta quello che non è un numero", () => {
    expect(normalizzaTelefono("")).toBeNull();
    expect(normalizzaTelefono("chiedi al bancone")).toBeNull();
    expect(normalizzaTelefono("123")).toBeNull();
  });
});

describe("lo sconto per chi si collega", () => {
  beforeEach(async () => {
    await setPortale(venueId, { ...CONFIG_COMPLETA, couponEnabled: true, couponPercent: 15, couponDays: 45 });
  });

  it("è personale, vale una volta e ha una scadenza", async () => {
    const esito = await registraLead(slug, iscrizione());
    expect(esito.coupon?.percent).toBe(15);
    expect(esito.coupon?.code).toMatch(/^WIFI-[A-Z0-9]{6}$/);

    const coupon = await db.coupon.findFirstOrThrow({ where: { venueId, category: "WIFI" } });
    expect(coupon.guestId).not.toBeNull();
    expect(coupon.maxRedemptions).toBe(1);
    expect(coupon.maxPerGuest).toBe(1);
    const giorni = Math.round((coupon.validUntil!.getTime() - Date.now()) / 86_400_000);
    expect(giorni).toBe(45);
  });

  it("non ne dà due alla stessa persona per la stessa promessa", async () => {
    const primo = await registraLead(slug, iscrizione());
    const secondo = await registraLead(slug, iscrizione());

    expect(secondo.coupon?.code).toBe(primo.coupon?.code);
    expect(await db.coupon.count({ where: { venueId, category: "WIFI" } })).toBe(1);
  });
});

describe("chi si è collegato", () => {
  beforeEach(async () => {
    await setPortale(venueId, CONFIG_COMPLETA);
  });

  it("torna con il totale e le pagine, non tagliato in silenzio", async () => {
    for (let i = 0; i < 3; i++) {
      await registraLead(slug, iscrizione({ name: `Persona ${i}`, email: `p${i}@test.local` }));
    }
    const elenco = await listWifiLeads(venueId);
    expect(elenco.totale).toBe(3);
    expect(elenco.pagine).toBe(1);
    expect(elenco.items[0].name).toBe("Persona 2");
  });

  it("conta quanti sono poi venuti a mangiare, che è il numero onesto", async () => {
    await registraLead(slug, iscrizione({ consentMarketing: true }));
    await registraLead(slug, iscrizione({ name: "Altra Persona", email: "altra@test.local" }));

    let stats = await getWifiStats(venueId);
    expect(stats.contatti).toBe(2);
    expect(stats.conMarketing).toBe(1);
    expect(stats.conPrenotazione).toBe(0);

    const ospite = await db.guest.findFirstOrThrow({ where: { venueId, email: "marco@test.local" } });
    await db.booking.create({
      data: { venueId, guestId: ospite.id, partySize: 2, startsAt: new Date(), status: "CONFIRMED", source: "PHONE" },
    });

    stats = await getWifiStats(venueId);
    expect(stats.conPrenotazione).toBe(1);
  });
});
