import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  codiceCasuale,
  couponUsability,
  createCoupon,
  descriviCoupon,
  listCoupons,
  prefissoDaNome,
  redeemCoupon,
  setCouponStatus,
  undoRedemption,
} from "@/server/coupons";

/**
 * I coupon.
 *
 * La parte difficile non è crearli: è il momento in cui vengono usati, con il
 * cliente al tavolo. Queste prove guardano quello: **nessun uso in più di
 * quelli previsti** (nemmeno con due camerieri contemporanei), il motivo
 * scritto quando un codice non vale, e l'annullamento — perché lo sbaglio più
 * comune non è la frode, è il tocco di troppo.
 */

const db = new PrismaClient();
const PREFISSO = "test-coup-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
let ospiteA = "";
let ospiteB = "";

const base = (extra: Record<string, unknown> = {}) => ({
  name: `${PREFISSO}Benvenuto`,
  kind: "PERCENT" as const,
  value: 10,
  maxPerGuest: 1,
  ...extra,
});

const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  orgId = org.id;
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}` } })
  ).id;
  altroVenueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` } })
  ).id;
  ospiteA = (await db.guest.create({ data: { venueId, firstName: "Anna" } })).id;
  ospiteB = (await db.guest.create({ data: { venueId, firstName: "Bruno" } })).id;
}, 60_000);

beforeEach(async () => {
  await db.couponRedemption.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.coupon.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("il codice", () => {
  it("non contiene lettere e cifre che si confondono a voce", () => {
    // O/0, I/1/L, S/5: un coupon si detta al telefono.
    const codice = Array.from({ length: 40 }, () => codiceCasuale(8)).join("");
    expect(codice).not.toMatch(/[OIL01S5]/);
  });

  it("il prefisso si ricava dal nome, senza accenti né spazi", () => {
    expect(prefissoDaNome("Benvenuto d'estate")).toBe("BENVENUT");
    expect(prefissoDaNome("!!!")).toBe("COUPON");
  });

  it("si genera da sé, e chi vuole può scriverlo", async () => {
    const generato = await createCoupon(venueId, base());
    expect(generato.code).toMatch(/^[A-Z0-9]+-[A-Z0-9]{6}$/);

    const scelto = await createCoupon(venueId, base({ code: "estate-2026" }));
    expect(scelto.code).toBe("ESTATE-2026");
  });

  it("un codice già in uso non si riassegna", async () => {
    await createCoupon(venueId, base({ code: "UNICO-1" }));
    await expect(createCoupon(venueId, base({ code: "unico-1" }))).rejects.toThrow("code_taken");
  });
});

describe("cosa dà, detto come lo dice il cameriere", () => {
  it("percentuale, euro, omaggio", () => {
    expect(descriviCoupon({ kind: "PERCENT", value: 15, freeItem: null })).toBe("15% di sconto");
    expect(descriviCoupon({ kind: "FIXED", value: 1500, freeItem: null })).toContain("15,00");
    expect(descriviCoupon({ kind: "FREE_ITEM", value: 0, freeItem: "il dolce" })).toBe("il dolce in omaggio");
  });

  it("una percentuale fuori scala non passa", async () => {
    await expect(createCoupon(venueId, base({ value: 150 }))).rejects.toThrow();
    await expect(createCoupon(venueId, base({ value: 0 }))).rejects.toThrow();
  });

  it("un omaggio senza dire cosa non passa", async () => {
    await expect(createCoupon(venueId, base({ kind: "FREE_ITEM", value: 0 }))).rejects.toThrow();
  });
});

describe("vale o non vale", () => {
  const oggi = new Date("2026-09-10T20:00:00.000Z");
  const coupon = (extra: Record<string, unknown> = {}) => ({
    status: "ACTIVE" as const,
    validFrom: null,
    validUntil: null,
    maxRedemptions: null,
    maxPerGuest: 1,
    guestId: null,
    ...extra,
  });

  it("in pausa o archiviato non si usa", () => {
    expect(couponUsability(coupon({ status: "PAUSED" }), { now: oggi, usiTotali: 0, ospite: { guestId: ospiteA, usi: 0 } })).toEqual({
      usable: false,
      reason: "paused",
    });
    expect(couponUsability(coupon({ status: "ARCHIVED" }), { now: oggi, usiTotali: 0, ospite: { guestId: ospiteA, usi: 0 } })).toEqual({
      usable: false,
      reason: "archived",
    });
  });

  it("la scadenza si calcola dalle date, non da uno stato da aggiornare", () => {
    const scaduto = coupon({ validUntil: new Date("2026-09-01T00:00:00.000Z") });
    expect(couponUsability(scaduto, { now: oggi, usiTotali: 0, ospite: { guestId: ospiteA, usi: 0 } })).toEqual({
      usable: false,
      reason: "expired",
    });
    const nonAncora = coupon({ validFrom: new Date("2026-12-01T00:00:00.000Z") });
    expect(couponUsability(nonAncora, { now: oggi, usiTotali: 0, ospite: { guestId: ospiteA, usi: 0 } })).toEqual({
      usable: false,
      reason: "not_yet_valid",
    });
  });

  it("esaurito quando gli usi finiscono", () => {
    const c = coupon({ maxRedemptions: 2 });
    expect(couponUsability(c, { now: oggi, usiTotali: 2, ospite: { guestId: ospiteA, usi: 0 } }).usable).toBe(false);
    expect(couponUsability(c, { now: oggi, usiTotali: 1, ospite: { guestId: ospiteA, usi: 0 } }).usable).toBe(true);
  });

  it("un coupon riservato non vale per un altro cliente", () => {
    const c = coupon({ guestId: ospiteA });
    expect(couponUsability(c, { now: oggi, usiTotali: 0, ospite: { guestId: ospiteB, usi: 0 } })).toEqual({
      usable: false,
      reason: "wrong_guest",
    });
  });

  it("senza indicare nessun cliente si giudica solo il coupon, e resta valido", () => {
    // È il caso dell'elenco: lì un cliente non c'è, e prima ogni coupon
    // compariva «non valido» per un controllo che non si poteva fare.
    expect(couponUsability(coupon(), { now: oggi, usiTotali: 0 })).toEqual({ usable: true });
  });

  it("usandolo su una prenotazione senza cliente, un tetto per persona non si può rispettare", () => {
    // Meglio rifiutare che far finta di controllare.
    expect(couponUsability(coupon(), { now: oggi, usiTotali: 0, ospite: { guestId: null, usi: 0 } })).toEqual({
      usable: false,
      reason: "guest_unknown",
    });
  });
});

describe("l'uso al tavolo", () => {
  it("segna l'utilizzo, lo collega a chi e a quale prenotazione", async () => {
    const c = await createCoupon(venueId, base());
    const esito = await redeemCoupon(venueId, { code: c.code, guestId: ospiteA }, { actor: attore() });

    expect(esito.usi).toBe(1);
    expect(esito.descrizione).toBe("10% di sconto");

    const righe = await db.couponRedemption.findMany({ where: { couponId: c.id } });
    expect(righe).toHaveLength(1);
    expect(righe[0].guestId).toBe(ospiteA);
    expect(righe[0].redeemedBy).toBe("u1");
  });

  it("il codice si può scrivere come viene, anche in minuscolo", async () => {
    const c = await createCoupon(venueId, base({ code: "SCONTO-9" }));
    const esito = await redeemCoupon(venueId, { code: " sconto-9 ", guestId: ospiteA });
    expect(esito.code).toBe(c.code);
  });

  it("lo stesso cliente non lo usa due volte, se il tetto è uno", async () => {
    const c = await createCoupon(venueId, base({ maxPerGuest: 1 }));
    await redeemCoupon(venueId, { code: c.code, guestId: ospiteA });
    await expect(redeemCoupon(venueId, { code: c.code, guestId: ospiteA })).rejects.toThrow("guest_limit");
    // Un altro cliente sì.
    await expect(redeemCoupon(venueId, { code: c.code, guestId: ospiteB })).resolves.toBeTruthy();
  });

  it("finiti gli usi il coupon si chiude da sé", async () => {
    const c = await createCoupon(venueId, base({ maxRedemptions: 1, maxPerGuest: 5 }));
    await redeemCoupon(venueId, { code: c.code, guestId: ospiteA });
    await expect(redeemCoupon(venueId, { code: c.code, guestId: ospiteB })).rejects.toThrow("exhausted");

    const dopo = await db.coupon.findUniqueOrThrow({ where: { id: c.id } });
    expect(dopo.status).toBe("EXPIRED");
  });

  it("due camerieri nello stesso istante non superano il tetto", async () => {
    // È la ragione per cui la transazione è serializzabile: due tablet, un
    // solo utilizzo disponibile.
    const c = await createCoupon(venueId, base({ maxRedemptions: 1, maxPerGuest: 5 }));
    const esiti = await Promise.allSettled([
      redeemCoupon(venueId, { code: c.code, guestId: ospiteA }),
      redeemCoupon(venueId, { code: c.code, guestId: ospiteB }),
    ]);
    const riusciti = esiti.filter((e) => e.status === "fulfilled");
    expect(riusciti).toHaveLength(1);
    expect(await db.couponRedemption.count({ where: { couponId: c.id, deletedAt: null } })).toBe(1);
  });

  it("un coupon in pausa non si usa, e il motivo è quello giusto", async () => {
    const c = await createCoupon(venueId, base());
    await setCouponStatus(venueId, c.id, "PAUSED");
    await expect(redeemCoupon(venueId, { code: c.code, guestId: ospiteA })).rejects.toThrow("paused");
  });

  it("il coupon di un altro locale non esiste da qui", async () => {
    const altrui = await createCoupon(altroVenueId, base({ code: "ALTRUI-1" }));
    await expect(redeemCoupon(venueId, { code: altrui.code, guestId: ospiteA })).rejects.toThrow("not_found");
  });

  it("un codice inventato non esiste", async () => {
    await expect(redeemCoupon(venueId, { code: "MAI-VISTO", guestId: ospiteA })).rejects.toThrow("not_found");
  });
});

describe("annullare un utilizzo", () => {
  it("rimette l'uso a disposizione e riapre il coupon esaurito", async () => {
    const c = await createCoupon(venueId, base({ maxRedemptions: 1, maxPerGuest: 5 }));
    const usato = await redeemCoupon(venueId, { code: c.code, guestId: ospiteA });
    expect((await db.coupon.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("EXPIRED");

    await undoRedemption(venueId, usato.redemptionId, { actor: attore() });

    const dopo = await db.coupon.findUniqueOrThrow({ where: { id: c.id } });
    expect(dopo.status).toBe("ACTIVE");
    expect(dopo.redemptionCount).toBe(0);
    // E si può usare di nuovo.
    await expect(redeemCoupon(venueId, { code: c.code, guestId: ospiteB })).resolves.toBeTruthy();
  });

  it("l'utilizzo resta in tabella, segnato annullato: la storia non si cancella", async () => {
    const c = await createCoupon(venueId, base());
    const usato = await redeemCoupon(venueId, { code: c.code, guestId: ospiteA });
    await undoRedemption(venueId, usato.redemptionId, { actor: attore() });

    const riga = await db.couponRedemption.findUniqueOrThrow({ where: { id: usato.redemptionId } });
    expect(riga.deletedAt).not.toBeNull();
    expect(riga.deletedBy).toBe("u1");
  });

  it("annullare due volte non si può", async () => {
    const c = await createCoupon(venueId, base());
    const usato = await redeemCoupon(venueId, { code: c.code, guestId: ospiteA });
    await undoRedemption(venueId, usato.redemptionId);
    await expect(undoRedemption(venueId, usato.redemptionId)).rejects.toThrow();
  });

  it("l'utilizzo di un altro locale non si annulla da qui", async () => {
    const altrui = await createCoupon(altroVenueId, base({ code: "ALTRUI-2" }));
    const suoOspite = await db.guest.create({ data: { venueId: altroVenueId, firstName: "Carla" } });
    const usato = await redeemCoupon(altroVenueId, { code: altrui.code, guestId: suoOspite.id });
    await expect(undoRedemption(venueId, usato.redemptionId)).rejects.toThrow();
  });
});

describe("l'elenco", () => {
  it("conta gli utilizzi veri, non il contatore", async () => {
    const c = await createCoupon(venueId, base({ maxRedemptions: 3, maxPerGuest: 5 }));
    await redeemCoupon(venueId, { code: c.code, guestId: ospiteA });
    const secondo = await redeemCoupon(venueId, { code: c.code, guestId: ospiteB });
    await undoRedemption(venueId, secondo.redemptionId);

    // Il contatore in tabella e le righe devono dire la stessa cosa: in
    // questo progetto i contatori scollegati dai fatti hanno già fatto danni.
    const riga = await db.coupon.findUniqueOrThrow({ where: { id: c.id } });
    const elenco = await listCoupons(venueId);
    const vista = elenco.find((x) => x.id === c.id)!;
    expect(vista.usi).toBe(1);
    expect(riga.redemptionCount).toBe(1);
    expect(vista.restanti).toBe(2);
  });

  it("dice perché un coupon non vale, non solo che non vale", async () => {
    const scaduto = await createCoupon(
      venueId,
      base({ code: "VECCHIO-1", validUntil: new Date(Date.now() - 86_400_000).toISOString() }),
    );
    const elenco = await listCoupons(venueId);
    expect(elenco.find((x) => x.id === scaduto.id)?.stato).toBe("expired");
  });

  it("gli archiviati restano fuori, se non si chiedono", async () => {
    const c = await createCoupon(venueId, base());
    await setCouponStatus(venueId, c.id, "ARCHIVED");
    expect((await listCoupons(venueId)).find((x) => x.id === c.id)).toBeUndefined();
    expect((await listCoupons(venueId, { includeArchived: true })).find((x) => x.id === c.id)).toBeTruthy();
  });

  it("i coupon di un altro locale non compaiono", async () => {
    await createCoupon(altroVenueId, base({ code: "ALTRUI-3" }));
    expect((await listCoupons(venueId)).some((x) => x.code === "ALTRUI-3")).toBe(false);
  });
});
