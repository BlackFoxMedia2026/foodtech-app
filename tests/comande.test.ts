import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createCategory, createItem, updateItem } from "@/server/menu";
import { openOrderForBooking } from "@/server/orders";
import {
  aggiornaRiga,
  aggiungiRiga,
  assicuraOspiti,
  bozzaDelConto,
  cambiaStatoComanda,
  comandeDelConto,
  comandeVive,
  inviaComanda,
  rinominaOspite,
  segnaRigheServite,
  transizionePossibile,
} from "@/server/comande/comande";

/**
 * **La comanda**: la tranche che va in cucina, dentro il conto del tavolo.
 *
 * Le prove guardano quello che, sbagliato, arriva sul tavolo di qualcuno:
 *
 * - **due tap su «invia» mandano una comanda sola.** È il §38, ed è la
 *   ragione per cui l'idempotenza sta in un vincolo del database e non in un
 *   `if`: due richieste in parallelo non si vedono a vicenda;
 * - **una comanda non blocca il tavolo** (§22): dopo l'invio se ne apre
 *   un'altra, e il conto resta uno solo;
 * - **le allergie sopravvivono** fino in fondo, e un codice inventato viene
 *   rifiutato: su questo elenco non si improvvisa;
 * - **una comanda già in cucina non si modifica in silenzio** (§24);
 * - **il totale del conto torna**, modificatori compresi;
 * - **un altro locale non tocca niente**.
 */

const db = new PrismaClient();
const PREFISSO = "test-comande-";
const TZ = "Europe/Rome";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let orgId = "";
let venueId = "";
let altroVenueId = "";
let bookingId = "";
let orderId = "";
let categoriaId = "";
let waiterId = "";

const attore = () => ({ userId: "u1", email: "p@test.local", orgId, venueId, ip: null, userAgent: null });

async function prenotazione(venue = venueId, coperti = 4) {
  return db.booking.create({
    data: { venueId: venue, partySize: coperti, startsAt: new Date(), status: "SEATED", source: "PHONE" },
  });
}

const piatto = (extra: Record<string, unknown> = {}) =>
  createItem(venueId, { categoryId: categoriaId, name: "Carbonara", priceCents: 1400, ...extra });

beforeAll(async () => {
  const org = await db.organization.create({
    data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` },
  });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}locale`, slug: `${PREFISSO}v${Date.now()}`, timezone: TZ },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}`, timezone: TZ },
    })
  ).id;
  waiterId = (
    await db.waiter.create({
      data: {
        venueId,
        firstName: "Luca",
        lastName: "Rossi",
        birthday: new Date("1990-01-01"),
        phone: "+39000",
        role: "Cameriere",
        primaryRole: "CAMERIERE",
      },
    })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.comanda.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.orderItem.deleteMany({ where: { Order: { venueId: { in: [venueId, altroVenueId] } } } });
  await db.order.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.booking.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuItem.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuCategory.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });

  bookingId = (await prenotazione()).id;
  orderId = (await openOrderForBooking(venueId, bookingId)).id;
  categoriaId = (await createCategory(venueId, { name: "Primi" })).id;
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("la bozza", () => {
  it("una sola per conto, anche premendo due volte", async () => {
    const primo = await bozzaDelConto(venueId, orderId, { waiterId });
    const secondo = await bozzaDelConto(venueId, orderId, { waiterId });
    expect(secondo.id).toBe(primo.id);
    expect(await db.comanda.count({ where: { orderId } })).toBe(1);
  });

  it("due camerieri che aprono insieme finiscono nella stessa", async () => {
    const [a, b, c] = await Promise.all([
      bozzaDelConto(venueId, orderId, { waiterId }),
      bozzaDelConto(venueId, orderId, { waiterId }),
      bozzaDelConto(venueId, orderId, { waiterId }),
    ]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
  });

  it("nasce numerata dall'uno e in bozza", async () => {
    const b = await bozzaDelConto(venueId, orderId);
    expect(b.numero).toBe(1);
    expect(b.status).toBe("BOZZA");
    expect(b.modificabile).toBe(true);
  });

  it("non si apre su un conto chiuso", async () => {
    await db.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
    await expect(bozzaDelConto(venueId, orderId)).rejects.toThrow("already_closed");
  });
});

describe("le righe", () => {
  it("copiano nome e prezzo dal menu in quel momento", async () => {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    await aggiungiRiga(venueId, b.id, { menuItemId: p.id, quantity: 2 }, { actor: attore() });

    await updateItem(venueId, p.id, { priceCents: 1800 });

    const [comanda] = await comandeDelConto(venueId, orderId);
    expect(comanda.righe[0].nome).toBe("Carbonara");
    expect(comanda.righe[0].priceCents).toBe(1400);
    expect(comanda.totalCents).toBe(2800);
  });

  it("gli extra a pagamento entrano nel prezzo della riga", async () => {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    const { comanda } = await aggiungiRiga(venueId, b.id, {
      menuItemId: p.id,
      quantity: 2,
      modifiche: [
        { kind: "COTTURA", label: "Al sangue", priceCents: 0 },
        { kind: "EXTRA", label: "Salsa al pepe", priceCents: 200 },
      ],
    });

    // 14,00 + 2,00 = 16,00 al pezzo, per due.
    expect(comanda.righe[0].priceCents).toBe(1600);
    expect(comanda.totalCents).toBe(3200);

    // Il conto vero, quello che paga il cliente, deve dire lo stesso numero.
    const conto = await db.order.findFirstOrThrow({ where: { id: orderId } });
    expect(conto.totalCents).toBe(3200);
  });

  it("un piatto finito non si ordina", async () => {
    const p = await piatto({ available: false });
    const b = await bozzaDelConto(venueId, orderId);
    await expect(aggiungiRiga(venueId, b.id, { menuItemId: p.id })).rejects.toThrow("not_available");
  });

  it("il fuori carta si batte a mano", async () => {
    const b = await bozzaDelConto(venueId, orderId);
    const { comanda } = await aggiungiRiga(venueId, b.id, {
      name: "Tartufo della casa",
      priceCents: 2500,
    });
    expect(comanda.righe[0].nome).toBe("Tartufo della casa");
    expect(comanda.righe[0].menuItemId).toBeNull();
  });

  it("a quantità zero, in bozza, la riga sparisce", async () => {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    const { comanda } = await aggiungiRiga(venueId, b.id, { menuItemId: p.id });
    const dopo = await aggiornaRiga(venueId, b.id, comanda.righe[0].id, { quantity: 0 });
    expect(dopo.comanda.righe).toHaveLength(0);
    expect(dopo.comanda.totalCents).toBe(0);
  });
});

describe("le allergie (§13)", () => {
  it("restano attaccate alla riga e arrivano fino allo storico", async () => {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    await aggiungiRiga(venueId, b.id, {
      menuItemId: p.id,
      allergeni: ["arachidi", "latte"],
      notaAllergia: "Allergia grave alle arachidi.",
    });

    const [comanda] = await comandeDelConto(venueId, orderId);
    expect(comanda.righe[0].allergeni.sort()).toEqual(["arachidi", "latte"]);
    expect(comanda.righe[0].notaAllergia).toBe("Allergia grave alle arachidi.");
  });

  it("un allergene inventato viene rifiutato: su questo elenco non si improvvisa", async () => {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    await expect(
      aggiungiRiga(venueId, b.id, { menuItemId: p.id, allergeni: ["kriptonite"] }),
    ).rejects.toThrow("allergene_sconosciuto");
  });
});

describe("i commensali (§14, §15)", () => {
  it("si creano uno per coperto, con un nome provvisorio", async () => {
    const ospiti = await assicuraOspiti(orderId, 4);
    expect(ospiti.map((o) => o.label)).toEqual(["Ospite 1", "Ospite 2", "Ospite 3", "Ospite 4"]);
  });

  it("chiamarla due volte non ne crea altri", async () => {
    await assicuraOspiti(orderId, 4);
    const secondi = await assicuraOspiti(orderId, 4);
    expect(secondi).toHaveLength(4);
    expect(await db.orderGuest.count({ where: { orderId } })).toBe(4);
  });

  it("correggere i coperti al ribasso non cancella nessuno", async () => {
    await assicuraOspiti(orderId, 4);
    await rinominaOspite(venueId, (await db.orderGuest.findFirstOrThrow({ where: { orderId, ordering: 4 } })).id, {
      label: "Laura",
    });
    const dopo = await assicuraOspiti(orderId, 2);
    // Un commensale rinominato non deve sparire perché qualcuno ha corretto
    // i coperti: i piatti già assegnati resterebbero senza destinatario.
    expect(dopo).toHaveLength(4);
    expect(dopo[3].label).toBe("Laura");
  });

  it("un piatto si assegna a una persona", async () => {
    const [primo] = await assicuraOspiti(orderId, 2);
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    const { comanda } = await aggiungiRiga(venueId, b.id, { menuItemId: p.id, orderGuestId: primo.id });
    expect(comanda.righe[0].ospiteId).toBe(primo.id);
    expect(comanda.righe[0].ospiteLabel).toBe("Ospite 1");
  });
});

describe("l'invio (§17, §38)", () => {
  async function bozzaConUnPiatto() {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId, { waiterId });
    await aggiungiRiga(venueId, b.id, { menuItemId: p.id, quantity: 2 });
    return b;
  }

  it("una comanda vuota non parte", async () => {
    const b = await bozzaDelConto(venueId, orderId);
    await expect(inviaComanda(venueId, b.id, { invioKey: "k-vuota-0001" })).rejects.toThrow(
      "empty_comanda",
    );
  });

  it("parte, e le righe partono con lei", async () => {
    const b = await bozzaConUnPiatto();
    const esito = await inviaComanda(venueId, b.id, { invioKey: "k-invio-0001" }, { waiterId });

    expect(esito.inviataAdesso).toBe(true);
    expect(esito.comanda.status).toBe("INVIATA");
    expect(esito.comanda.sentAt).not.toBeNull();
    expect(esito.comanda.righe.every((r) => r.status === "INVIATA")).toBe(true);
  });

  it("**due tap mandano una comanda sola**", async () => {
    const b = await bozzaConUnPiatto();
    const chiave = "k-doppio-tap-0001";

    const primo = await inviaComanda(venueId, b.id, { invioKey: chiave }, { waiterId });
    const secondo = await inviaComanda(venueId, b.id, { invioKey: chiave }, { waiterId });

    expect(primo.inviataAdesso).toBe(true);
    // Il secondo non è un errore: chi ha premuto due volte vede la stessa
    // conferma, e in cucina è arrivato un foglio solo.
    expect(secondo.inviataAdesso).toBe(false);
    expect(secondo.comanda.id).toBe(primo.comanda.id);
    expect(await db.comanda.count({ where: { orderId, status: "INVIATA" } })).toBe(1);
  });

  it("due tap **contemporanei** mandano una comanda sola", async () => {
    const b = await bozzaConUnPiatto();
    const chiave = "k-parallelo-0001";

    // Il caso che un controllo applicativo non prende: due richieste in volo
    // insieme non si vedono a vicenda. L'unicità la garantisce il database.
    const esiti = await Promise.allSettled([
      inviaComanda(venueId, b.id, { invioKey: chiave }, { waiterId }),
      inviaComanda(venueId, b.id, { invioKey: chiave }, { waiterId }),
    ]);

    const riuscite = esiti.filter((e) => e.status === "fulfilled");
    expect(riuscite.length).toBeGreaterThanOrEqual(1);
    expect(await db.comanda.count({ where: { orderId } })).toBe(1);
    const comanda = await db.comanda.findFirstOrThrow({ where: { orderId } });
    expect(comanda.status).toBe("INVIATA");
  });

  it("una comanda già partita non riparte", async () => {
    const b = await bozzaConUnPiatto();
    await inviaComanda(venueId, b.id, { invioKey: "k-uno-0001" });
    await expect(inviaComanda(venueId, b.id, { invioKey: "k-due-0002" })).rejects.toThrow(
      "gia_inviata",
    );
  });
});

describe("la seconda tranche (§22)", () => {
  it("dopo l'invio se ne apre un'altra, e il conto resta uno", async () => {
    const p = await piatto();

    const prima = await bozzaDelConto(venueId, orderId, { waiterId });
    await aggiungiRiga(venueId, prima.id, { menuItemId: p.id });
    await inviaComanda(venueId, prima.id, { invioKey: "k-t1-0001" });

    const seconda = await bozzaDelConto(venueId, orderId, { waiterId });
    expect(seconda.id).not.toBe(prima.id);
    expect(seconda.numero).toBe(2);
    await aggiungiRiga(venueId, seconda.id, { menuItemId: p.id, quantity: 3 });

    expect(await db.order.count({ where: { venueId, bookingId } })).toBe(1);
    const conto = await db.order.findFirstOrThrow({ where: { id: orderId } });
    // Le righe di tutte le tranche stanno sullo stesso totale.
    expect(conto.totalCents).toBe(1400 * 4);
  });
});

describe("modificare dopo l'invio (§24)", () => {
  async function comandaInCucina() {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId, { waiterId });
    await aggiungiRiga(venueId, b.id, { menuItemId: p.id });
    await inviaComanda(venueId, b.id, { invioKey: `k-mod-${Date.now()}` });
    return { b, p };
  }

  it("senza conferma esplicita non si tocca", async () => {
    const { b, p } = await comandaInCucina();
    await expect(aggiungiRiga(venueId, b.id, { menuItemId: p.id })).rejects.toThrow(
      "modifica_da_confermare",
    );
  });

  it("con la conferma si può, e il chiamante sa che deve avvisare la cucina", async () => {
    const { b, p } = await comandaInCucina();
    const esito = await aggiungiRiga(venueId, b.id, { menuItemId: p.id, confermaModifica: true });
    expect(esito.avvisaCucina).toBe(true);
    // La riga nuova nasce già partita: è uscita adesso, insieme all'avviso.
    expect(esito.comanda.righe.at(-1)!.status).toBe("INVIATA");
  });

  it("una voce annullata dopo l'invio resta, segnata, e non si paga", async () => {
    const { b } = await comandaInCucina();
    const comanda = await db.comanda.findFirstOrThrow({ where: { id: b.id }, include: { righe: true } });

    const esito = await aggiornaRiga(venueId, b.id, comanda.righe[0].id, {
      quantity: 0,
      confermaModifica: true,
    });

    expect(esito.comanda.righe[0].status).toBe("ANNULLATA");
    const conto = await db.order.findFirstOrThrow({ where: { id: orderId } });
    expect(conto.totalCents).toBe(0);
  });

  it("una comanda servita non si modifica più", async () => {
    const { b, p } = await comandaInCucina();
    await cambiaStatoComanda(venueId, b.id, "PRONTA");
    await segnaRigheServite(venueId, b.id, []);
    await expect(
      aggiungiRiga(venueId, b.id, { menuItemId: p.id, confermaModifica: true }),
    ).rejects.toThrow("gia_inviata");
  });
});

describe("gli stati (§19, §20)", () => {
  async function inviata() {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId, { waiterId });
    await aggiungiRiga(venueId, b.id, { menuItemId: p.id, quantity: 2 });
    await aggiungiRiga(venueId, b.id, { name: "Acqua", priceCents: 300 });
    await inviaComanda(venueId, b.id, { invioKey: `k-st-${Date.now()}-${Math.random()}` });
    return b;
  }

  it("la tabella delle transizioni non fa tornare indietro una comanda servita", () => {
    expect(transizionePossibile("SERVITA", "IN_PREPARAZIONE")).toBe(false);
    expect(transizionePossibile("PRONTA", "SERVITA")).toBe(true);
    expect(transizionePossibile("BOZZA", "PRONTA")).toBe(false);
  });

  it("un passaggio impossibile viene rifiutato", async () => {
    const b = await bozzaDelConto(venueId, orderId);
    await expect(cambiaStatoComanda(venueId, b.id, "PRONTA")).rejects.toThrow(
      "transizione_non_valida",
    );
  });

  it("le righe seguono il foglio, e resta traccia di chi l'ha mosso", async () => {
    const b = await inviata();
    await cambiaStatoComanda(venueId, b.id, "IN_PREPARAZIONE", { waiterId });
    const pronta = await cambiaStatoComanda(venueId, b.id, "PRONTA", { waiterId });

    expect(pronta.righe.every((r) => r.status === "PRONTA")).toBe(true);
    expect(pronta.readyAt).not.toBeNull();

    const eventi = await db.comandaEvento.findMany({ where: { comandaId: b.id }, orderBy: { at: "asc" } });
    expect(eventi.map((e) => e.a)).toEqual(["BOZZA", "INVIATA", "IN_PREPARAZIONE", "PRONTA"]);
    expect(eventi.at(-1)!.waiterId).toBe(waiterId);
  });

  it("segnare serviti solo due piatti non chiude la comanda", async () => {
    const b = await inviata();
    await cambiaStatoComanda(venueId, b.id, "PRONTA");
    const righe = await db.orderItem.findMany({ where: { comandaId: b.id }, orderBy: { id: "asc" } });

    const dopo = await segnaRigheServite(venueId, b.id, [righe[0].id], { waiterId });
    expect(dopo.status).toBe("PRONTA");
    expect(dopo.righe.filter((r) => r.status === "SERVITA")).toHaveLength(1);

    const finita = await segnaRigheServite(venueId, b.id, [righe[1].id], { waiterId });
    expect(finita.status).toBe("SERVITA");
  });

  it("una comanda annullata non fa incasso", async () => {
    const b = await inviata();
    await cambiaStatoComanda(venueId, b.id, "ANNULLATA", { waiterId });
    const conto = await db.order.findFirstOrThrow({ where: { id: orderId } });
    expect(conto.totalCents).toBe(0);
  });
});

describe("l'elenco delle comande vive", () => {
  it("filtra su chi le ha battute", async () => {
    const altro = await db.waiter.create({
      data: {
        venueId,
        firstName: "Giulia",
        lastName: "Bianchi",
        birthday: new Date("1992-01-01"),
        phone: "+39111",
        role: "Cameriere",
        primaryRole: "CAMERIERE",
      },
    });

    const p = await piatto();
    const mia = await bozzaDelConto(venueId, orderId, { waiterId });
    await aggiungiRiga(venueId, mia.id, { menuItemId: p.id });
    await inviaComanda(venueId, mia.id, { invioKey: `k-mia-${Date.now()}` });

    const altraPrenotazione = await prenotazione();
    const altroOrder = await openOrderForBooking(venueId, altraPrenotazione.id);
    const sua = await bozzaDelConto(venueId, altroOrder.id, { waiterId: altro.id });
    await aggiungiRiga(venueId, sua.id, { menuItemId: p.id });
    await inviaComanda(venueId, sua.id, { invioKey: `k-sua-${Date.now()}` });

    expect(await comandeVive(venueId)).toHaveLength(2);
    expect(await comandeVive(venueId, { waiterId })).toHaveLength(1);
  });
});

describe("l'isolamento fra locali", () => {
  it("una comanda di un altro locale non si legge né si tocca", async () => {
    const p = await piatto();
    const b = await bozzaDelConto(venueId, orderId);
    await aggiungiRiga(venueId, b.id, { menuItemId: p.id });

    await expect(aggiungiRiga(altroVenueId, b.id, { name: "X", priceCents: 100 })).rejects.toThrow(
      "not_found",
    );
    await expect(cambiaStatoComanda(altroVenueId, b.id, "ANNULLATA")).rejects.toThrow("not_found");
    expect(await comandeDelConto(altroVenueId, orderId)).toHaveLength(0);
  });

  it("un conto di un altro locale non apre bozze", async () => {
    const altrui = await prenotazione(altroVenueId);
    const altroOrder = await openOrderForBooking(altroVenueId, altrui.id);
    await expect(bozzaDelConto(venueId, altroOrder.id)).rejects.toThrow("not_found");
  });

  it("un piatto di un altro locale non entra in comanda", async () => {
    const altraCat = await createCategory(altroVenueId, { name: "Primi" });
    const altroPiatto = await createItem(altroVenueId, {
      categoryId: altraCat.id,
      name: "Altro",
      priceCents: 1000,
    });
    const b = await bozzaDelConto(venueId, orderId);
    await expect(aggiungiRiga(venueId, b.id, { menuItemId: altroPiatto.id })).rejects.toThrow(
      "not_found",
    );
  });
});
