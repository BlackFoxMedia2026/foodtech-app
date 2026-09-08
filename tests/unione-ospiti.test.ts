import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  MergeError,
  contaDoppioni,
  livelloPiuAlto,
  trovaDoppioni,
  unisciOspiti,
} from "@/server/guest-merge";

/**
 * Unire due schede della stessa persona.
 *
 * È l'unica operazione di questo prodotto che **cancella una riga di
 * anagrafica**, e non si torna indietro: questi test valgono più del solito.
 * Metà di loro verifica che l'unione **si rifiuti**.
 */

const db = new PrismaClient();
const PREFISSO = "test-unione-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

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
  await db.$disconnect();
}, 60_000);

async function svuota() {
  await db.guest.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId: altroVenueId } });
}

async function ospite(
  dati: Partial<Parameters<typeof db.guest.create>[0]["data"]> & { firstName?: string } = {},
) {
  return db.guest.create({
    data: {
      venueId,
      firstName: "Anna",
      ...dati,
    } as Parameters<typeof db.guest.create>[0]["data"],
  });
}

describe("si propone solo su segnali esatti", () => {
  it("i punti mostrati sono la somma delle righe, non il contatore", async () => {
    // In una schermata dove si decide quale scheda cancellare, il numero da
    // guardare è quello vero: un contatore rimasto indietro farebbe scegliere
    // la scheda sbagliata.
    await svuota();
    const a = await ospite({ email: "punti@esempio.it" });
    const b = await ospite({ email: "punti@esempio.it", firstName: "Bis", loyaltyPoints: 999 });
    await db.loyaltyTransaction.create({ data: { venueId, guestId: b.id, kind: "EARNED", points: 60 } });

    const [d] = await trovaDoppioni(venueId);
    expect(d.principale.id).toBe(a.id);
    expect(d.principale.punti).toBe(0);
    expect(d.duplicato.punti).toBe(60);
  });

  it("stessa email, scritta con maiuscole diverse: è la stessa persona", async () => {
    await svuota();
    await ospite({ email: "Anna.Bianchi@Esempio.it" });
    await ospite({ email: "anna.bianchi@esempio.it", firstName: "Annina" });

    const doppioni = await trovaDoppioni(venueId);
    expect(doppioni).toHaveLength(1);
    expect(doppioni[0].motivo).toBe("email");
    expect(await contaDoppioni(venueId)).toBe(1);
  });

  it("stesso telefono scritto in due modi: è la stessa persona", async () => {
    await svuota();
    await ospite({ phone: "+39 340 123 45 67" });
    await ospite({ phone: "3401234567", firstName: "Anna Maria" });

    const doppioni = await trovaDoppioni(venueId);
    // «+393401234567» e «3401234567» non sono la stessa forma normalizzata:
    // il prefisso internazionale resta, ed è giusto — un numero col prefisso
    // e uno senza possono essere due numeri diversi in due paesi.
    expect(doppioni).toHaveLength(0);

    await svuota();
    await ospite({ phone: "340 123 45 67" });
    await ospite({ phone: "340-1234567", firstName: "Anna Maria" });
    const stessi = await trovaDoppioni(venueId);
    expect(stessi).toHaveLength(1);
    expect(stessi[0].motivo).toBe("telefono");
  });

  it("due omonimi senza contatti in comune non sono un doppione", async () => {
    // È la regola che protegge dal danno peggiore: fondere due schede
    // sbagliate significa mostrare a qualcuno le note riservate di un altro.
    await svuota();
    await ospite({ firstName: "Marco", lastName: "Rossi", email: "marco.rossi@a.it" });
    await ospite({ firstName: "Marco", lastName: "Rossi", email: "m.rossi@b.it" });
    expect(await trovaDoppioni(venueId)).toHaveLength(0);
  });

  it("una scheda anonimizzata non entra fra le proposte", async () => {
    await svuota();
    await ospite({ email: "via@esempio.it" });
    await ospite({ email: "via@esempio.it", anonymizedAt: new Date() });
    expect(await trovaDoppioni(venueId)).toHaveLength(0);
  });

  it("schede di due locali diversi non si incontrano", async () => {
    await svuota();
    await ospite({ email: "uguale@esempio.it" });
    await db.guest.create({
      data: { venueId: altroVenueId, firstName: "Anna", email: "uguale@esempio.it" },
    });
    expect(await trovaDoppioni(venueId)).toHaveLength(0);
  });

  it("tre schede uguali diventano due coppie sulla stessa principale", async () => {
    await svuota();
    const a = await ospite({ email: "tre@esempio.it" });
    await ospite({ email: "tre@esempio.it", firstName: "B" });
    await ospite({ email: "tre@esempio.it", firstName: "C" });

    const doppioni = await trovaDoppioni(venueId);
    expect(doppioni).toHaveLength(2);
    // La principale è sempre la stessa, anche quando le tre schede sono
    // state create nello stesso istante: l'ordine ha un secondo criterio.
    expect(doppioni.every((d) => d.principale.id === a.id)).toBe(true);
  });

  it("email e telefono uguali si propongono una volta sola", async () => {
    await svuota();
    await ospite({ email: "due@esempio.it", phone: "3331112222" });
    await ospite({ email: "due@esempio.it", phone: "333 111 2222", firstName: "Bis" });
    expect(await trovaDoppioni(venueId)).toHaveLength(1);
    // Il conteggio veloce (quello dell'avviso nella lista clienti) deve dare
    // lo stesso numero dell'elenco: sono due letture diverse della stessa
    // domanda, ed è il posto dove due formule divergono senza che nessuno lo
    // noti.
    expect(await contaDoppioni(venueId)).toBe(1);
  });

  it("il conteggio veloce e l'elenco dicono lo stesso numero, in ogni caso", async () => {
    await svuota();
    // Un caso per motivo, più rumore che non deve contare.
    await ospite({ email: "c1@esempio.it" });
    await ospite({ email: "c1@esempio.it", firstName: "Bis" });
    await ospite({ phone: "333 000 1111" });
    await ospite({ phone: "3330001111", firstName: "Tris" });
    await ospite({ email: "solo@esempio.it" });
    await ospite({ firstName: "Senza contatti" });
    await ospite({ email: "anon@esempio.it", anonymizedAt: new Date() });

    const elenco = await trovaDoppioni(venueId);
    expect(await contaDoppioni(venueId)).toBe(elenco.length);
    expect(elenco).toHaveLength(2);
  });
});

describe("l'unione si rifiuta quando deve", () => {
  it("una scheda con sé stessa non si unisce", async () => {
    await svuota();
    const a = await ospite({ email: "x@esempio.it" });
    await expect(unisciOspiti(venueId, a.id, a.id)).rejects.toThrow(MergeError);
  });

  it("senza un segnale in comune si rifiuta, anche chiamando direttamente", async () => {
    /**
     * La difesa che conta: l'elenco delle proposte la fa già, ma un controllo
     * che sta solo nell'interfaccia non è un controllo. Senza questa riga,
     * una chiamata all'API con due identificativi qualsiasi fonderebbe due
     * clienti diversi.
     */
    await svuota();
    const a = await ospite({ firstName: "Uno", email: "uno@esempio.it" });
    const b = await ospite({ firstName: "Due", email: "due@esempio.it" });
    await expect(unisciOspiti(venueId, a.id, b.id)).rejects.toThrow("nessun_segnale");
    // e nessuna delle due è stata toccata
    expect(await db.guest.count({ where: { venueId } })).toBe(2);
  });

  it("una scheda anonimizzata non si unisce: sarebbe disfare una cancellazione", async () => {
    await svuota();
    const a = await ospite({ email: "z@esempio.it" });
    const b = await ospite({ email: "z@esempio.it", anonymizedAt: new Date() });
    await expect(unisciOspiti(venueId, a.id, b.id)).rejects.toThrow("anonimizzata");
  });

  it("una scheda di un altro locale non si unisce", async () => {
    await svuota();
    const a = await ospite({ email: "q@esempio.it" });
    const b = await db.guest.create({
      data: { venueId: altroVenueId, firstName: "Anna", email: "q@esempio.it" },
    });
    await expect(unisciOspiti(venueId, a.id, b.id)).rejects.toThrow("non_trovata");
  });
});

describe("niente si perde", () => {
  it("prenotazioni, punti e note finiscono sulla principale", async () => {
    await svuota();
    const a = await ospite({ email: "somma@esempio.it", privateNotes: "Preferisce il tavolo 4" });
    const b = await ospite({
      email: "somma@esempio.it",
      firstName: "Anna",
      lastName: "Bianchi",
      privateNotes: "Allergica al sedano, non gliene abbiamo mai dato",
      allergies: "Sedano",
      loyaltyTier: "VIP",
    });

    await db.booking.create({
      data: { venueId, guestId: b.id, partySize: 2, startsAt: new Date(), status: "COMPLETED", source: "PHONE" },
    });
    await db.loyaltyTransaction.create({
      data: { venueId, guestId: b.id, kind: "EARNED", points: 40 },
    });
    await db.loyaltyTransaction.create({
      data: { venueId, guestId: a.id, kind: "EARNED", points: 15 },
    });

    const esito = await unisciOspiti(venueId, a.id, b.id);

    expect(esito.guestId).toBe(a.id);
    expect(esito.spostate["prenotazioni"]).toBe(1);
    expect(esito.spostate["movimenti punti"]).toBe(1);
    // Il saldo è la **somma delle righe**, non la somma dei contatori.
    expect(esito.punti).toBe(55);

    const unita = await db.guest.findUniqueOrThrow({ where: { id: a.id } });
    expect(unita.lastName).toBe("Bianchi");
    expect(unita.loyaltyPoints).toBe(55);
    // Le note si uniscono, non si sovrascrivono: una nota scritta a mano non
    // si butta via per un'unione.
    expect(unita.privateNotes).toContain("tavolo 4");
    expect(unita.privateNotes).toContain("sedano");
    expect(unita.allergies).toBe("Sedano");
    // Chi era VIP non torna «nuovo».
    expect(unita.loyaltyTier).toBe("VIP");
    // La scheda vuota non c'è più.
    expect(await db.guest.findUnique({ where: { id: b.id } })).toBeNull();
    // E le visite sono state ricontate dalle righe.
    expect(unita.totalVisits).toBe(1);
  });

  it("l'unione finisce nel registro delle azioni, col nome di chi l'ha fatta", async () => {
    await svuota();
    const a = await ospite({ email: "reg@esempio.it" });
    const b = await ospite({ email: "reg@esempio.it", firstName: "Bis" });
    const venue = await db.venue.findUniqueOrThrow({ where: { id: venueId }, select: { orgId: true } });
    const utente = await db.user.create({
      data: { email: `${PREFISSO}chi@esempio.it`, name: "Chi Unisce" },
    });

    await unisciOspiti(venueId, a.id, b.id, {
      actor: { userId: utente.id, email: `${PREFISSO}chi@esempio.it`, orgId: venue.orgId, venueId },
    });

    const riga = await db.auditLog.findFirst({
      where: { action: "guest.merge", entityId: a.id },
      orderBy: { createdAt: "desc" },
    });
    expect(riga).toBeTruthy();
    expect(riga!.actorEmail).toContain("chi@esempio.it");
    // Nel registro c'è quale scheda è stata assorbita: è l'unico posto dove
    // resta scritto, perché la riga non esiste più.
    expect(JSON.stringify(riga!.diff)).toContain(b.id);

    await db.auditLog.deleteMany({ where: { actorId: utente.id } });
    await db.user.delete({ where: { id: utente.id } });
  });

  it("un blocco non si perde nell'unione", async () => {
    await svuota();
    const a = await ospite({ email: "bl@esempio.it" });
    const b = await ospite({
      email: "bl@esempio.it",
      firstName: "Bis",
      blocked: true,
      blockedAt: new Date(),
      blockedReason: "Ha rotto tre bicchieri e non ha pagato",
    });
    await unisciOspiti(venueId, a.id, b.id);
    const unita = await db.guest.findUniqueOrThrow({ where: { id: a.id } });
    // Sbloccare per errore è più grave che tenere un blocco di troppo.
    expect(unita.blocked).toBe(true);
    expect(unita.blockedReason).toContain("bicchieri");
  });
});

describe("il consenso: l'ultima parola detta", () => {
  it("una revoca più recente vince su un consenso più vecchio", async () => {
    await svuota();
    const a = await ospite({ email: "cons@esempio.it", marketingOptIn: true });
    const b = await ospite({ email: "cons@esempio.it", firstName: "Bis", marketingOptIn: false });

    await db.consentLog.create({
      data: {
        venueId,
        guestId: a.id,
        channel: "EMAIL",
        granted: true,
        createdAt: new Date("2026-01-10T10:00:00Z"),
      },
    });
    await db.consentLog.create({
      data: {
        venueId,
        guestId: b.id,
        channel: "EMAIL",
        granted: false,
        createdAt: new Date("2026-03-02T10:00:00Z"),
      },
    });

    const esito = await unisciOspiti(venueId, a.id, b.id);
    expect(esito.consensoMarketing).toBe(false);
    const unita = await db.guest.findUniqueOrThrow({ where: { id: a.id } });
    expect(unita.marketingOptIn).toBe(false);
  });

  it("un consenso più recente di una revoca vecchia riporta dentro", async () => {
    await svuota();
    const a = await ospite({ email: "cons2@esempio.it", marketingOptIn: false });
    const b = await ospite({ email: "cons2@esempio.it", firstName: "Bis", marketingOptIn: true });
    await db.consentLog.create({
      data: { venueId, guestId: a.id, channel: "EMAIL", granted: false, createdAt: new Date("2026-01-10T10:00:00Z") },
    });
    await db.consentLog.create({
      data: { venueId, guestId: b.id, channel: "EMAIL", granted: true, createdAt: new Date("2026-04-01T10:00:00Z") },
    });
    expect((await unisciOspiti(venueId, a.id, b.id)).consensoMarketing).toBe(true);
  });

  it("senza nessun consenso registrato, un sì raccolto non si butta", async () => {
    await svuota();
    const a = await ospite({ email: "cons3@esempio.it", marketingOptIn: false });
    const b = await ospite({ email: "cons3@esempio.it", firstName: "Bis", marketingOptIn: true });
    expect((await unisciOspiti(venueId, a.id, b.id)).consensoMarketing).toBe(true);
  });
});

describe("il livello di fedeltà più alto vince", () => {
  it("l'ordine dei livelli è dichiarato", () => {
    expect(livelloPiuAlto("NEW", "VIP")).toBe("VIP");
    expect(livelloPiuAlto("AMBASSADOR", "REGULAR")).toBe("AMBASSADOR");
    expect(livelloPiuAlto("NEW", "NEW")).toBe("NEW");
    // Un livello che non conosciamo non fa esplodere niente.
    expect(livelloPiuAlto("QUALCOSA", "REGULAR")).toBe("REGULAR");
  });
});
