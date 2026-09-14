import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  ALLERGENI,
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  getMenu,
  getMenuItemDettaglio,
  getMenuPubblico,
  getRendimentoPiatto,
  listCategorie,
  listMenuKeys,
  reorder,
  SETTIMANE_ANDAMENTO,
  updateCategory,
  updateItem,
} from "@/server/menu";

/**
 * Il menu — primo anello della catena menu → ordini → costo del cibo.
 *
 * Le prove guardano tre cose che contano davvero:
 *
 * - **cosa legge il cliente**: un piatto finito e una categoria nascosta non
 *   devono comparire, altrimenti qualcuno ordina qualcosa che non c'è;
 * - **gli allergeni sono un elenco chiuso**: un valore inventato non entra.
 *   Su questo un cliente celiaco deve potersi fidare;
 * - **niente si cancella per sbaglio**: una categoria con dei piatti e un
 *   piatto già ordinato non si eliminano, perché porterebbero via il conto di
 *   una serata chiusa.
 */

const db = new PrismaClient();
const PREFISSO = "test-menu-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let slug = "";

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: `${PREFISSO}org`, slug: `${PREFISSO}${Date.now()}` } });
  slug = `${PREFISSO}v${Date.now()}`;
  venueId = (await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}locale`, slug } })).id;
  altroVenueId = (
    await db.venue.create({ data: { orgId: org.id, name: `${PREFISSO}altro`, slug: `${PREFISSO}a${Date.now()}` } })
  ).id;
}, 60_000);

beforeEach(async () => {
  await db.menuItemCost.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuItem.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.menuCategory.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

const piatto = (categoryId: string, extra: Record<string, unknown> = {}) => ({
  categoryId,
  name: "Tagliatelle al ragù",
  priceCents: 1400,
  ...extra,
});

/* -------------------------------------------------------------------------- */

describe("categorie e piatti si aggiungono in coda", () => {
  it("una categoria nuova va in fondo, non in cima", async () => {
    const a = await createCategory(venueId, { name: "Antipasti" });
    const b = await createCategory(venueId, { name: "Primi" });
    // Chi aggiunge «Dolci» non se li ritrova prima degli antipasti.
    expect(a.ordering).toBe(0);
    expect(b.ordering).toBe(1);
  });

  it("un piatto nuovo va in fondo alla sua categoria", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p1 = await createItem(venueId, piatto(c.id, { name: "Uno" }));
    const p2 = await createItem(venueId, piatto(c.id, { name: "Due" }));
    expect(p1.ordering).toBe(0);
    expect(p2.ordering).toBe(1);
  });

  it("un piatto in una categoria di un altro locale non si crea", async () => {
    const altrui = await createCategory(altroVenueId, { name: "Loro" });
    await expect(createItem(venueId, piatto(altrui.id))).rejects.toThrow("not_found");
  });
});

describe("gli allergeni sono un elenco chiuso", () => {
  it("i quattordici obbligatori si accettano", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const tutti = Object.keys(ALLERGENI);
    const p = await createItem(venueId, piatto(c.id, { allergens: tutti }));
    expect(p.allergens).toHaveLength(14);
  });

  it("un valore inventato non entra", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    // Un campo libero produrrebbe «glutine», «Glutine» e «farina di grano»
    // nella stessa carta, e una ricerca che non trova la parola giusta.
    await expect(createItem(venueId, piatto(c.id, { allergens: ["farina"] }))).rejects.toThrow();
    await expect(createItem(venueId, piatto(c.id, { dietary: ["crudista"] }))).rejects.toThrow();
  });

  it("un prezzo negativo non passa", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await expect(createItem(venueId, piatto(c.id, { priceCents: -100 }))).rejects.toThrow();
  });
});

describe("il costo e il margine", () => {
  it("senza costo dichiarato non c'è margine, e non si inventa", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id));
    const menu = await getMenu(venueId);
    expect(menu[0].items[0].costCents).toBeNull();
    expect(menu[0].items[0].marginCents).toBeNull();
    expect(menu[0].items[0].marginPct).toBeNull();
  });

  it("col costo il margine è un numero vero, non una stima", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id, { costCents: 350 }));
    const menu = await getMenu(venueId);
    // 14,00 di prezzo e 3,50 di costo: 10,50 di margine, il 75%.
    expect(menu[0].items[0].marginCents).toBe(1050);
    expect(menu[0].items[0].marginPct).toBe(75);
  });

  it("il costo si può aggiungere dopo e togliere", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));

    await updateItem(venueId, p.id, { costCents: 400 });
    expect((await getMenu(venueId))[0].items[0].costCents).toBe(400);

    // `null` vuol dire «non lo so», e va distinto da «costa zero».
    await updateItem(venueId, p.id, { costCents: null });
    expect((await getMenu(venueId))[0].items[0].costCents).toBeNull();

    await updateItem(venueId, p.id, { costCents: 0 });
    expect((await getMenu(venueId))[0].items[0].costCents).toBe(0);
  });
});

describe("l'ordine si cambia tutto insieme", () => {
  it("mandando l'elenco completo nessuno resta con lo stesso numero", async () => {
    const a = await createCategory(venueId, { name: "A" });
    const b = await createCategory(venueId, { name: "B" });
    const c = await createCategory(venueId, { name: "C" });

    await reorder(venueId, "categorie", [c.id, a.id, b.id]);
    const menu = await getMenu(venueId);
    expect(menu.map((x) => x.name)).toEqual(["C", "A", "B"]);
    expect(menu.map((x) => x.ordering)).toEqual([0, 1, 2]);
  });

  it("l'ordine dei piatti dentro la categoria", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p1 = await createItem(venueId, piatto(c.id, { name: "Uno" }));
    const p2 = await createItem(venueId, piatto(c.id, { name: "Due" }));

    await reorder(venueId, "piatti", [p2.id, p1.id]);
    const menu = await getMenu(venueId);
    expect(menu[0].items.map((i) => i.name)).toEqual(["Due", "Uno"]);
  });

  it("non si riordina roba di un altro locale", async () => {
    const mia = await createCategory(venueId, { name: "Mia" });
    const altrui = await createCategory(altroVenueId, { name: "Loro" });
    await expect(reorder(venueId, "categorie", [mia.id, altrui.id])).rejects.toThrow("not_found");
  });
});

describe("niente si cancella per sbaglio", () => {
  it("una categoria con dei piatti non si elimina", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id));
    await expect(deleteCategory(venueId, c.id)).rejects.toThrow("category_not_empty");
    // Vuota invece sì.
    const vuota = await createCategory(venueId, { name: "Vuota" });
    await expect(deleteCategory(venueId, vuota.id)).resolves.toEqual({ deleted: true });
  });

  it("un piatto già ordinato non si elimina: si perderebbe la storia delle vendite", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));
    const ordine = await db.order.create({
      data: {
        venueId,
        reference: `${PREFISSO}${Date.now()}`,
        kind: "TABLE",
        customerName: "Prova",
        phone: "+39 000",
        scheduledAt: new Date(),
        totalCents: 1400,
      },
    });
    await db.orderItem.create({
      data: { orderId: ordine.id, menuItemId: p.id, name: p.name, quantity: 1, priceCents: 1400 },
    });

    await expect(deleteItem(venueId, p.id)).rejects.toThrow("item_ordered");
    await db.orderItem.deleteMany({ where: { orderId: ordine.id } });
    await db.order.delete({ where: { id: ordine.id } });
    await expect(deleteItem(venueId, p.id)).resolves.toEqual({ deleted: true });
  });

  it("eliminando un piatto va via anche il suo costo", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id, { costCents: 300 }));
    await deleteItem(venueId, p.id);
    expect(await db.menuItemCost.count({ where: { menuItemId: p.id } })).toBe(0);
  });
});

describe("il menu che legge il cliente", () => {
  it("mostra i piatti disponibili e nasconde quelli finiti", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id, { name: "C'è" }));
    await createItem(venueId, piatto(c.id, { name: "Finito", available: false }));

    const pubblico = await getMenuPubblico(slug);
    expect(pubblico?.categorie[0].items.map((i) => i.name)).toEqual(["C'è"]);
  });

  it("una categoria nascosta non compare", async () => {
    const c = await createCategory(venueId, { name: "Segreta" });
    await createItem(venueId, piatto(c.id));
    await updateCategory(venueId, c.id, { active: false });

    const pubblico = await getMenuPubblico(slug);
    expect(pubblico?.categorie).toHaveLength(0);
  });

  it("una categoria rimasta senza piatti disponibili non compare come sezione vuota", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id, { available: false }));
    const pubblico = await getMenuPubblico(slug);
    expect(pubblico?.categorie).toHaveLength(0);
  });

  it("non contiene costi né margini: sono numeri del locale, non del cliente", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id, { costCents: 350 }));
    const pubblico = await getMenuPubblico(slug);
    expect(JSON.stringify(pubblico)).not.toContain("350");
    expect(JSON.stringify(pubblico)).not.toContain("cost");
  });

  it("un indirizzo che non esiste non è un errore, è nessun menu", async () => {
    expect(await getMenuPubblico("locale-che-non-esiste")).toBeNull();
  });

  it("un locale disattivato non pubblica il menu", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id));
    await db.venue.update({ where: { id: venueId }, data: { active: false } });
    expect(await getMenuPubblico(slug)).toBeNull();
    await db.venue.update({ where: { id: venueId }, data: { active: true } });
  });
});

describe("più carte", () => {
  it("le categorie di una carta non compaiono nell'altra", async () => {
    await createCategory(venueId, { name: "Primi", menuKey: "main" });
    await createCategory(venueId, { name: "Rossi", menuKey: "vini" });

    expect((await getMenu(venueId, "main")).map((c) => c.name)).toEqual(["Primi"]);
    expect((await getMenu(venueId, "vini")).map((c) => c.name)).toEqual(["Rossi"]);
    expect(await listMenuKeys(venueId)).toEqual(["main", "vini"]);
  });

  it("«main» c'è sempre nell'elenco delle carte, anche a menu vuoto", async () => {
    expect(await listMenuKeys(venueId)).toContain("main");
  });
});

/* -------------------------------------------------------------------------- */

describe("la foto del piatto", () => {
  it("si salva, si cambia e si toglie", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id, { imageUrl: "https://esempio.test/a.jpg" }));
    expect(p.imageUrl).toBe("https://esempio.test/a.jpg");

    const cambiato = await updateItem(venueId, p.id, { imageUrl: "https://esempio.test/b.jpg" });
    expect(cambiato.imageUrl).toBe("https://esempio.test/b.jpg");

    // Il modulo svuotato manda una stringa vuota: deve diventare «nessuna
    // foto», non un `<img src="">` che il browser risolve sulla pagina stessa.
    const tolta = await updateItem(venueId, p.id, { imageUrl: "" });
    expect(tolta.imageUrl).toBeNull();
  });

  it("arriva fino alla carta di gestione", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createItem(venueId, piatto(c.id, { imageUrl: "https://esempio.test/a.jpg" }));
    const menu = await getMenu(venueId);
    expect(menu[0].items[0].imageUrl).toBe("https://esempio.test/a.jpg");
  });
});

describe("la scheda di un piatto", () => {
  it("porta con sé la categoria, le sorelle e il posto che occupa", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    await createCategory(venueId, { name: "Dolci" });
    const uno = await createItem(venueId, piatto(c.id, { name: "Uno" }));
    const due = await createItem(venueId, piatto(c.id, { name: "Due" }));

    const scheda = await getMenuItemDettaglio(venueId, due.id);
    expect(scheda?.item.name).toBe("Due");
    expect(scheda?.categoryName).toBe("Primi");
    expect(scheda?.posizione).toBe(2);
    expect(scheda?.fratelli).toEqual([uno.id, due.id]);
    // Le categorie della stessa carta, per spostarcelo dentro.
    expect(scheda?.categorie.map((x) => x.name)).toEqual(["Primi", "Dolci"]);
  });

  it("il piatto di un altro locale non si apre", async () => {
    const altrui = await createCategory(altroVenueId, { name: "Loro" });
    const loro = await createItem(altroVenueId, piatto(altrui.id));
    expect(await getMenuItemDettaglio(venueId, loro.id)).toBeNull();
    expect(await getRendimentoPiatto(venueId, loro.id)).toBeNull();
  });

  it("le categorie di un'altra carta non compaiono nella tendina", async () => {
    await createCategory(venueId, { name: "Primi", menuKey: "main" });
    await createCategory(venueId, { name: "Rossi", menuKey: "vini" });
    expect((await listCategorie(venueId)).map((c) => c.name)).toEqual(["Primi"]);
    expect((await listCategorie(venueId, "vini")).map((c) => c.name)).toEqual(["Rossi"]);
  });
});

describe("le vendite di un piatto", () => {
  /** Un conto chiuso `giorniFa`, con dentro `quantita` porzioni del piatto. */
  async function contoChiuso(menuItemId: string, giorniFa: number, quantita: number, priceCents = 1400) {
    const quando = new Date(Date.now() - giorniFa * 24 * 60 * 60 * 1000);
    return db.order.create({
      data: {
        reference: `${PREFISSO}${crypto.randomUUID()}`,
        venueId,
        status: "COMPLETED",
        scheduledAt: quando,
        completedAt: quando,
        totalCents: priceCents * quantita,
        OrderItem: { create: [{ menuItemId, name: "Tagliatelle al ragù", priceCents, quantity: quantita }] },
      },
    });
  }

  beforeEach(async () => {
    await db.order.deleteMany({ where: { venueId } });
  });

  it("senza nemmeno un conto chiuso non si dice «zero venduti»", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));
    const r = await getRendimentoPiatto(venueId, p.id);
    // «0 venduti» su un locale che non ha ancora chiuso un conto si legge come
    // una bocciatura del piatto, e non è quello che i dati dicono.
    expect(r?.ciSonoConti).toBe(false);
    expect(r?.quantitaTotale).toBe(0);
  });

  it("conta porzioni, conti, incasso e finestre di 7 e 30 giorni", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));

    await contoChiuso(p.id, 2, 3);
    await contoChiuso(p.id, 20, 2);
    await contoChiuso(p.id, 60, 5);

    const r = await getRendimentoPiatto(venueId, p.id);
    expect(r?.ciSonoConti).toBe(true);
    expect(r?.quantitaTotale).toBe(10);
    expect(r?.quantita30).toBe(5);
    expect(r?.quantita7).toBe(3);
    expect(r?.contiTotali).toBe(3);
    expect(r?.incassoCents).toBe(10 * 1400);
    expect(r?.ultimaVendita?.getTime()).toBeGreaterThan(Date.now() - 3 * 24 * 60 * 60 * 1000);
  });

  it("un conto aperto o annullato non è una vendita", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));

    const aperto = await contoChiuso(p.id, 1, 4);
    await db.order.update({ where: { id: aperto.id }, data: { status: "RECEIVED", completedAt: null } });
    const annullato = await contoChiuso(p.id, 1, 7);
    await db.order.update({ where: { id: annullato.id }, data: { status: "CANCELLED" } });
    await contoChiuso(p.id, 1, 1);

    const r = await getRendimentoPiatto(venueId, p.id);
    expect(r?.quantitaTotale).toBe(1);
    expect(r?.contiTotali).toBe(1);
  });

  it("le settimane sono dodici, e l'ultima è quella in corso", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));

    await contoChiuso(p.id, 1, 4); // questa settimana
    await contoChiuso(p.id, 40, 6); // dentro le dodici settimane
    await contoChiuso(p.id, 200, 9); // fuori: sta nei totali, non nella serie

    const r = await getRendimentoPiatto(venueId, p.id);
    expect(r?.settimane).toHaveLength(SETTIMANE_ANDAMENTO);
    expect(r?.settimane.at(-1)?.quantita).toBe(4);
    expect(r?.settimane.reduce((n, s) => n + s.quantita, 0)).toBe(10);
    // Il piatto vecchio resta contato dove è vero che è stato venduto.
    expect(r?.quantitaTotale).toBe(19);
  });

  it("il periodo precedente sono i trenta giorni prima, non tutto il passato", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));

    await contoChiuso(p.id, 5, 3); // ultimi 30
    await contoChiuso(p.id, 45, 7); // i trenta prima
    await contoChiuso(p.id, 120, 50); // più indietro: non è un confronto

    const r = await getRendimentoPiatto(venueId, p.id);
    expect(r?.quantita30).toBe(3);
    expect(r?.quantita30Precedenti).toBe(7);
  });

  it("la quota è sulla sua categoria, e il posto si legge a pari merito", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const altra = await createCategory(venueId, { name: "Dolci" });
    const a = await createItem(venueId, piatto(c.id, { name: "A" }));
    const b = await createItem(venueId, piatto(c.id, { name: "B" }));
    const dolce = await createItem(venueId, piatto(altra.id, { name: "Tiramisù" }));

    await contoChiuso(a.id, 3, 10);
    await contoChiuso(b.id, 3, 4);
    // Il dolce vende più di tutti, ma sta in un'altra parte della carta: non
    // entra nella quota, altrimenti il confronto sarebbe fra cose diverse.
    await contoChiuso(dolce.id, 3, 99);

    const r = await getRendimentoPiatto(venueId, a.id);
    expect(r?.nellaCategoria).toEqual({
      categoria: "Primi",
      porzioni: 10,
      porzioniCategoria: 14,
      posizione: 1,
      quantiPiatti: 2,
    });

    const secondo = await getRendimentoPiatto(venueId, b.id);
    expect(secondo?.nellaCategoria?.posizione).toBe(2);
  });

  it("una categoria che non ha venduto niente non ha una quota", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id));
    // Venduto, ma quattro mesi fa: negli ultimi trenta giorni la categoria è
    // ferma, e una quota su zero è una divisione per zero travestita da dato.
    await contoChiuso(p.id, 120, 5);
    expect((await getRendimentoPiatto(venueId, p.id))?.nellaCategoria).toBeNull();
  });

  it("l'incasso è ai prezzi con cui è stato battuto, non a quello di oggi", async () => {
    const c = await createCategory(venueId, { name: "Primi" });
    const p = await createItem(venueId, piatto(c.id, { priceCents: 1400 }));
    await contoChiuso(p.id, 5, 1, 1200);
    await updateItem(venueId, p.id, { priceCents: 1800 });

    const r = await getRendimentoPiatto(venueId, p.id);
    expect(r?.incassoCents).toBe(1200);
  });
});
