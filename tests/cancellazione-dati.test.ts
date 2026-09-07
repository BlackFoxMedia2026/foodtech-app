import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem } from "@/server/menu";
import { addLine, closeOrder, incassoDelGiorno, openOrderForBooking } from "@/server/orders";
import { setRegoleFedelta } from "@/server/loyalty";
import { registraLead, setPortale } from "@/server/wifi";
import { ErasureError, anonimizzaOspite, anteprimaCancellazione } from "@/server/guest-erasure";

/**
 * Cancellare i dati di una persona quando lo chiede.
 *
 * La prova che conta più di tutte: **la cancellazione non riscrive i conti.**
 * Chi chiede di sparire ha diritto a sparire come persona, non a far sparire
 * una cena servita e pagata — e un locale che scoprisse a fine mese di aver
 * perso tre serate non userebbe mai più quel pulsante.
 *
 * Le altre: che i dati spariscano da **tutti** i posti dove sono (sette, non
 * uno), che il motivo sia obbligatorio, che non si possa fare due volte, e che
 * la scheda non venga distrutta ma svuotata.
 */

const db = new PrismaClient();
const PREFISSO = "test-cancella-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let slug = "";
let guestId = "";
let piattoId = "";
const TZ = "Europe/Rome";

const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  orgId = org.id;
  slug = `${PREFISSO}v${Date.now()}`;
  venueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug, timezone: TZ } })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.surveyResponse.deleteMany({ where: { Survey: { venueId } } });
  await db.survey.deleteMany({ where: { venueId } });
  await db.consentLog.deleteMany({ where: { venueId } });
  await db.wifiLead.deleteMany({ where: { venueId } });
  await db.messageLog.deleteMany({ where: { venueId } });
  await db.loyaltyTransaction.deleteMany({ where: { venueId } });
  await db.orderItem.deleteMany({ where: { Order: { venueId } } });
  await db.order.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.menuItem.deleteMany({ where: { venueId } });
  await db.menuCategory.deleteMany({ where: { venueId } });

  await setRegoleFedelta(venueId, { puntiPerEuro: 1, valorePuntoCents: 5 });
  await setPortale(venueId, { networkName: "Rete-Ospiti", password: "unapassword" });

  guestId = (
    await db.guest.create({
      data: {
        venueId,
        firstName: "Marco",
        lastName: "Bianchi",
        email: "marco@test.local",
        phone: "3401234567",
        birthday: new Date("1985-04-11"),
        allergies: "noci",
        privateNotes: "Preferisce il tavolo in fondo",
        preferences: { note: "acqua naturale" },
        tags: ["abituale"],
        marketingOptIn: true,
        loyaltyTier: "VIP",
      },
    })
  ).id;

  const categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
  piattoId = (await createItem(venueId, { categoryId: categoriaId, name: "Tagliatelle", priceCents: 1500 })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
});

/** Una serata completa: prenotazione con note, conto chiuso, punti. */
async function serataCompleta() {
  const b = await db.booking.create({
    data: {
      venueId,
      guestId,
      partySize: 2,
      startsAt: new Date(),
      status: "SEATED",
      source: "PHONE",
      notes: "Anniversario di Marco e Giulia",
      internalNotes: "Cliente del titolare",
    },
  });
  const conto = await openOrderForBooking(venueId, b.id, { actor: attore() });
  await addLine(venueId, conto.id, { menuItemId: piattoId, quantity: 4 }, { actor: attore() }); // 60,00 €
  await closeOrder(venueId, conto.id, { actor: attore() });
  return b;
}

/** Un messaggio inviato, un consenso, un sondaggio con commento, un accesso Wi-Fi. */
async function tracceSparse(bookingId: string) {
  await db.messageLog.create({
    data: {
      venueId,
      guestId,
      bookingId,
      channel: "EMAIL",
      toAddress: "marco@test.local",
      subject: "Il tuo tavolo di stasera",
      bodyPreview: "Ciao Marco, ti aspettiamo alle 20…",
      status: "SENT",
    },
  });
  const survey = await db.survey.create({ data: { venueId, guestId, bookingId, token: `t-${Date.now()}` } });
  await db.surveyResponse.create({
    data: {
      surveyId: survey.id,
      npsScore: 9,
      sentiment: "PROMOTER",
      comment: "Bravissimi, il mio cameriere si chiama Luca",
    },
  });
  await registraLead(
    slug,
    { name: "Marco Bianchi", email: "marco@test.local", consentPrivacy: true, consentMarketing: true },
    { ip: "1.2.3.4", userAgent: "iPhone" },
  );
}

describe("l'anteprima", () => {
  it("dice cosa sparisce e cosa resta, con i numeri", async () => {
    const b = await serataCompleta();
    await tracceSparse(b.id);

    const a = await anteprimaCancellazione(venueId, guestId);
    expect(a.nome).toBe("Marco Bianchi");
    expect(a.giaAnonimizzato).toBe(false);
    expect(a.sparisce.contatti).toBe(2);
    expect(a.sparisce.noteSuPrenotazioni).toBe(1);
    expect(a.sparisce.contattiWifi).toBe(1);
    expect(a.sparisce.messaggiInviati).toBe(1);
    expect(a.sparisce.commentiSondaggi).toBe(1);

    // E l'elenco che serve a chi decide.
    expect(a.resta.prenotazioni).toBe(1);
    expect(a.resta.contiChiusi).toBe(1);
    expect(a.resta.incassoCents).toBe(6_000);
    expect(a.resta.punti).toBe(60);
  });

  it("non esiste per un ospite di un altro locale", async () => {
    const altro = await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}x${Date.now()}`, timezone: TZ },
    });
    await expect(anteprimaCancellazione(altro.id, guestId)).rejects.toBeInstanceOf(ErasureError);
    await db.venue.delete({ where: { id: altro.id } });
  });
});

describe("la cancellazione", () => {
  it("svuota la scheda senza distruggerla", async () => {
    await anonimizzaOspite(venueId, guestId, { reason: "richiesta via email" }, { actor: attore() });

    const g = await db.guest.findUniqueOrThrow({ where: { id: guestId } });
    expect(g.firstName).toBe("Ospite anonimizzato");
    expect(g.lastName).toBeNull();
    expect(g.email).toBeNull();
    expect(g.phone).toBeNull();
    expect(g.birthday).toBeNull();
    expect(g.allergies).toBeNull();
    expect(g.privateNotes).toBeNull();
    expect(g.preferences).toBeNull();
    expect(g.tags).toEqual([]);
    expect(g.marketingOptIn).toBe(false);
    expect(g.loyaltyTier).toBe("NEW");
    expect(g.anonymizedAt).not.toBeNull();
    expect(g.anonymizedBy).toBe("u1");
  });

  it("porta via i dati da tutti i posti dove sono, non solo dalla scheda", async () => {
    const b = await serataCompleta();
    await tracceSparse(b.id);

    await anonimizzaOspite(venueId, guestId, { reason: "richiesta a voce" }, { actor: attore() });

    const prenotazione = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(prenotazione.notes).toBeNull();
    expect(prenotazione.internalNotes).toBeNull();

    const lead = await db.wifiLead.findFirstOrThrow({ where: { venueId } });
    expect(lead.email).toBeNull();
    expect(lead.phone).toBeNull();
    expect(lead.ipAddress).toBeNull();
    expect(lead.userAgent).toBeNull();
    expect(lead.name).toBe("Ospite anonimizzato");

    const messaggio = await db.messageLog.findFirstOrThrow({ where: { venueId } });
    expect(messaggio.toAddress).toBe("");
    expect(messaggio.subject).toBeNull();
    expect(messaggio.bodyPreview).toBeNull();
    // Ma resta che è stato inviato: serve a non rimandarlo due volte.
    expect(messaggio.status).toBe("SENT");

    const consenso = await db.consentLog.findFirstOrThrow({ where: { venueId } });
    expect(consenso.ipAddress).toBeNull();
    expect(consenso.userAgent).toBeNull();
    // La riga resta: è la prova di cosa è stato scelto e quando.
    expect(consenso.granted).toBe(true);

    const risposta = await db.surveyResponse.findFirstOrThrow({ where: { Survey: { venueId } } });
    expect(risposta.comment).toBeNull();
    expect(risposta.npsScore).toBe(9);
  });

  it("NON riscrive i conti: incasso, coperti e punti restano", async () => {
    const b = await serataCompleta();
    const giorno = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
    const prima = await incassoDelGiorno(venueId, giorno, TZ);

    await anonimizzaOspite(venueId, guestId, { reason: "richiesta" }, { actor: attore() });

    const dopo = await incassoDelGiorno(venueId, giorno, TZ);
    expect(dopo.totalCents).toBe(prima.totalCents);
    expect(dopo.conti).toBe(prima.conti);
    expect(dopo.totalCents).toBe(6_000);

    // La prenotazione c'è ancora, con i suoi coperti.
    const prenotazione = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(prenotazione.partySize).toBe(2);
    expect(prenotazione.status).toBe("SEATED");

    // Le righe del conto — quelle su cui si calcola il costo del cibo.
    const righe = await db.orderItem.count({ where: { Order: { venueId } } });
    expect(righe).toBe(1);

    // E i punti guadagnati: non si cancella la storia dei conti.
    const punti = await db.loyaltyTransaction.aggregate({ where: { venueId, guestId }, _sum: { points: true } });
    expect(punti._sum.points).toBe(60);
  });

  it("toglie il nome dai conti ma non i conti", async () => {
    const b = await db.booking.create({
      data: { venueId, guestId, partySize: 2, startsAt: new Date(), status: "SEATED", source: "PHONE" },
    });
    const conto = await openOrderForBooking(venueId, b.id, { actor: attore() });
    await db.order.update({
      where: { id: conto.id },
      data: { customerName: "Marco Bianchi", phone: "3401234567", notes: "citofonare Bianchi" },
    });

    await anonimizzaOspite(venueId, guestId, { reason: "richiesta" }, { actor: attore() });

    const dopo = await db.order.findUniqueOrThrow({ where: { id: conto.id } });
    expect(dopo.customerName).toBeNull();
    expect(dopo.phone).toBeNull();
    expect(dopo.notes).toBeNull();
    expect(dopo.id).toBe(conto.id);
  });

  it("pretende un motivo e lo scrive nel registro", async () => {
    await expect(anonimizzaOspite(venueId, guestId, { reason: "  " })).rejects.toMatchObject({
      code: "reason_required",
    });

    await anonimizzaOspite(venueId, guestId, { reason: "richiesta scritta del 7 settembre" }, { actor: attore() });
    const riga = await db.auditLog.findFirstOrThrow({
      where: { venueId, action: "guest.anonymize", entityId: guestId },
    });
    expect(JSON.stringify(riga.diff)).toContain("richiesta scritta del 7 settembre");
  });

  it("non si fa due volte", async () => {
    await anonimizzaOspite(venueId, guestId, { reason: "richiesta" }, { actor: attore() });
    await expect(anonimizzaOspite(venueId, guestId, { reason: "di nuovo" })).rejects.toMatchObject({
      code: "already_anonymized",
    });
  });

  it("non tocca gli altri clienti", async () => {
    const altro = await db.guest.create({
      data: { venueId, firstName: "Giulia", lastName: "Ferrari", email: "giulia@test.local" },
    });
    await anonimizzaOspite(venueId, guestId, { reason: "richiesta" }, { actor: attore() });

    const g = await db.guest.findUniqueOrThrow({ where: { id: altro.id } });
    expect(g.firstName).toBe("Giulia");
    expect(g.email).toBe("giulia@test.local");
  });
});

describe("dopo la cancellazione", () => {
  it("il portale Wi-Fi non riconosce più la persona: non c'è più niente da riconoscere", async () => {
    await anonimizzaOspite(venueId, guestId, { reason: "richiesta" }, { actor: attore() });

    const esito = await registraLead(slug, {
      name: "Marco Bianchi",
      email: "marco@test.local",
      consentPrivacy: true,
      consentMarketing: false,
    });
    // Nasce una scheda nuova, che è il comportamento giusto: l'email di prima
    // è stata cancellata, quindi non esiste un collegamento da ritrovare.
    expect(esito.giaConosciuto).toBe(false);
    expect(await db.guest.count({ where: { venueId } })).toBe(2);
  });
});
