import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Il menu.
 *
 * `MenuCategory`, `MenuItem` e `MenuItemCost` erano nello schema — con
 * allergeni, regimi alimentari, disponibilità, ordinamento e perfino il costo
 * di produzione. Zero righe di codice.
 *
 * È il primo anello di una catena: **menu → ordini → costo del cibo**. Non si
 * può calcolare quanto rende un piatto senza sapere che quel piatto esiste, e
 * non si possono prendere ordini da un menu che non c'è. Per questo si parte
 * da qui, e per questo il menu serve a qualcosa **da solo**: è quello che il
 * cliente legge dal QR sul tavolo.
 *
 * Una scelta che non è un dettaglio: **gli allergeni non si scrivono a mano**.
 * Sono un elenco chiuso, quello dei quattordici allergeni obbligatori per
 * legge in Europa. Un campo libero produce «glutine», «Glutine», «farina di
 * grano» e «GLUTINE» nella stessa carta, e un cliente celiaco non può fidarsi
 * di una ricerca che non trova la parola giusta.
 */

/* -------------------------------------------------------------------------- */
/*  Vocabolari chiusi                                                         */
/* -------------------------------------------------------------------------- */

/**
 * I quattordici allergeni a dichiarazione obbligatoria (Regolamento UE
 * 1169/2011). L'elenco è chiuso di proposito: su questo non si improvvisa.
 */
export const ALLERGENI = {
  glutine: "Glutine",
  crostacei: "Crostacei",
  uova: "Uova",
  pesce: "Pesce",
  arachidi: "Arachidi",
  soia: "Soia",
  latte: "Latte",
  frutta_a_guscio: "Frutta a guscio",
  sedano: "Sedano",
  senape: "Senape",
  sesamo: "Sesamo",
  solfiti: "Solfiti",
  lupini: "Lupini",
  molluschi: "Molluschi",
} as const;

export type Allergene = keyof typeof ALLERGENI;

/** Come si mangia, non cosa contiene: è un'altra domanda e un altro elenco. */
export const REGIMI = {
  vegetariano: "Vegetariano",
  vegano: "Vegano",
  senza_glutine: "Senza glutine",
  senza_lattosio: "Senza lattosio",
  piccante: "Piccante",
} as const;

export type Regime = keyof typeof REGIMI;

/*
  I codici vecchi, in inglese e maiuscolo.

  Sul menu pubblico in produzione si leggeva **«Contiene: , ,»**: gli allergeni
  erano salvati come `GLUTEN`, `DAIRY`, `EGGS` — codici scritti da una versione
  precedente — e il dizionario ha chiavi italiane minuscole, quindi ogni
  etichetta veniva `undefined` e restavano solo le virgole.

  È la riga che legge chi ha un'allergia, seduto a un tavolo col telefono in
  mano. Mostrare la punteggiatura di un elenco vuoto è peggio che non mostrare
  niente: dice che l'informazione c'è, e poi non la dà.

  Nessuna parte del codice scrive più questi codici, ma i dati vecchi restano.
  Tradurli qui — in lettura, in un posto solo — li sistema su ogni schermata e
  su ogni installazione, senza toccare le righe già salvate.
*/
const ALIAS_ALLERGENI: Record<string, Allergene> = {
  GLUTEN: "glutine",
  CRUSTACEANS: "crostacei",
  SHELLFISH: "crostacei",
  EGGS: "uova",
  FISH: "pesce",
  PEANUTS: "arachidi",
  SOY: "soia",
  SOYA: "soia",
  DAIRY: "latte",
  MILK: "latte",
  NUTS: "frutta_a_guscio",
  TREE_NUTS: "frutta_a_guscio",
  CELERY: "sedano",
  MUSTARD: "senape",
  SESAME: "sesamo",
  SULPHITES: "solfiti",
  SULFITES: "solfiti",
  LUPIN: "lupini",
  MOLLUSCS: "molluschi",
  MOLLUSKS: "molluschi",
};

const ALIAS_REGIMI: Record<string, Regime> = {
  VEGETARIAN: "vegetariano",
  VEGAN: "vegano",
  GLUTEN_FREE: "senza_glutine",
  LACTOSE_FREE: "senza_lattosio",
  SPICY: "piccante",
};

/**
 * Il nome di un allergene, sempre qualcosa di leggibile.
 *
 * Se il codice non è né una chiave nota né un alias, si mostra **il codice**
 * ripulito invece di una stringa vuota: un cliente allergico che legge
 * «Contiene: SENAPE_NUOVA» sa di dover chiedere, uno che legge «Contiene:»
 * pensa che non ci sia niente.
 */
export function nomeAllergene(codice: string): string {
  const chiave = codice in ALLERGENI ? (codice as Allergene) : ALIAS_ALLERGENI[codice.toUpperCase()];
  return chiave ? ALLERGENI[chiave] : leggibile(codice);
}

/** Come `nomeAllergene`, per i regimi alimentari. */
export function nomeRegime(codice: string): string {
  const chiave = codice in REGIMI ? (codice as Regime) : ALIAS_REGIMI[codice.toUpperCase()];
  return chiave ? REGIMI[chiave] : leggibile(codice);
}

/**
 * Un codice ignoto, reso leggibile — e **mai vuoto**.
 *
 * La prima versione era `codice.replace(/_/g, " ")`, e un test l'ha bocciata:
 * un codice fatto di soli trattini bassi diventava uno spazio, cioè di nuovo
 * un buco fra due virgole — lo stesso difetto che si stava correggendo,
 * arrivato da un'altra strada.
 *
 * Se non resta nemmeno una lettera o una cifra, si dice «non specificato»:
 * che è la verità, ed è un'informazione — chi legge sa di dover chiedere.
 */
function leggibile(codice: string): string {
  const pulito = codice.replace(/_/g, " ").trim().toLowerCase();
  return /[a-z0-9]/i.test(pulito) ? pulito : "non specificato";
}

const CHIAVI_ALLERGENI = Object.keys(ALLERGENI) as [Allergene, ...Allergene[]];
const CHIAVI_REGIMI = Object.keys(REGIMI) as [Regime, ...Regime[]];

/* -------------------------------------------------------------------------- */
/*  Categorie                                                                 */
/* -------------------------------------------------------------------------- */

export const CategoryInput = z.object({
  name: z.string().trim().min(1, "Serve un nome per la categoria").max(60),
  /**
   * Quale carta: `main` è quella del cibo, ma un locale ne ha spesso più di
   * una (vini, cocktail, pranzo di lavoro).
   */
  menuKey: z.string().trim().min(1).max(30).optional(),
  active: z.boolean().optional(),
});

export async function createCategory(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = CategoryInput.parse(raw);
  const menuKey = data.menuKey?.trim() || "main";

  // In coda, non in testa: chi aggiunge «Dolci» non se li ritrova prima degli
  // antipasti.
  const ultima = await db.menuCategory.findFirst({
    where: { venueId, menuKey },
    orderBy: { ordering: "desc" },
    select: { ordering: true },
  });

  const creata = await db.menuCategory.create({
    data: {
      venueId,
      name: data.name,
      menuKey,
      ordering: (ultima?.ordering ?? -1) + 1,
      active: data.active ?? true,
    },
  });

  await recordAudit(opts.actor, "menu.category_create", "menu_category", creata.id, {
    nome: creata.name,
    carta: menuKey,
  });
  return creata;
}

export async function updateCategory(venueId: string, id: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const esistente = await db.menuCategory.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");

  const data = CategoryInput.partial().parse(raw);
  const aggiornata = await db.menuCategory.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.active !== undefined && { active: data.active }),
    },
  });

  await recordAudit(opts.actor, "menu.category_update", "menu_category", id, {
    nome: aggiornata.name,
    attiva: aggiornata.active,
  });
  return aggiornata;
}

/**
 * Elimina una categoria, se è vuota.
 *
 * Con dei piatti dentro non si cancella: la cancellazione a cascata
 * porterebbe via anche quelli, e con loro il collegamento agli ordini già
 * fatti. Chi vuole togliere una sezione dal menu la **disattiva**.
 */
export async function deleteCategory(venueId: string, id: string, opts: { actor?: AuditActor } = {}) {
  const esistente = await db.menuCategory.findFirst({
    where: { id, venueId },
    include: { _count: { select: { MenuItem: true } } },
  });
  if (!esistente) throw new Error("not_found");
  if (esistente._count.MenuItem > 0) throw new Error("category_not_empty");

  await db.menuCategory.delete({ where: { id } });
  await recordAudit(opts.actor, "menu.category_delete", "menu_category", id, { nome: esistente.name });
  return { deleted: true as const };
}

/* -------------------------------------------------------------------------- */
/*  Piatti                                                                    */
/* -------------------------------------------------------------------------- */

export const ItemInput = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1, "Serve un nome per il piatto").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  /** In centesimi, come tutti gli importi. */
  priceCents: z.coerce.number().int().min(0).max(1_000_00),
  available: z.boolean().optional(),
  allergens: z.array(z.enum(CHIAVI_ALLERGENI)).max(14).optional(),
  dietary: z.array(z.enum(CHIAVI_REGIMI)).max(5).optional(),
  /** Il costo di produzione, se il locale lo conosce. Serve al food cost. */
  costCents: z.coerce.number().int().min(0).max(1_000_00).optional().nullable(),
});

export async function createItem(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = ItemInput.parse(raw);

  const categoria = await db.menuCategory.findFirst({
    where: { id: data.categoryId, venueId },
    select: { id: true },
  });
  if (!categoria) throw new Error("not_found");

  const ultimo = await db.menuItem.findFirst({
    where: { categoryId: data.categoryId },
    orderBy: { ordering: "desc" },
    select: { ordering: true },
  });

  const creato = await db.menuItem.create({
    data: {
      venueId,
      categoryId: data.categoryId,
      name: data.name,
      description: data.description ?? null,
      priceCents: data.priceCents,
      available: data.available ?? true,
      allergens: data.allergens ?? [],
      dietary: data.dietary ?? [],
      ordering: (ultimo?.ordering ?? -1) + 1,
    },
  });

  if (data.costCents != null) {
    await db.menuItemCost.create({
      data: { venueId, menuItemId: creato.id, costCents: data.costCents },
    });
  }

  await recordAudit(opts.actor, "menu.item_create", "menu_item", creato.id, {
    nome: creato.name,
    prezzo: creato.priceCents,
    allergeni: creato.allergens,
  });
  return creato;
}

export async function updateItem(venueId: string, id: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const esistente = await db.menuItem.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");

  const data = ItemInput.partial().parse(raw);

  if (data.categoryId && data.categoryId !== esistente.categoryId) {
    const categoria = await db.menuCategory.findFirst({
      where: { id: data.categoryId, venueId },
      select: { id: true },
    });
    if (!categoria) throw new Error("not_found");
  }

  const aggiornato = await db.menuItem.update({
    where: { id },
    data: {
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priceCents !== undefined && { priceCents: data.priceCents }),
      ...(data.available !== undefined && { available: data.available }),
      ...(data.allergens !== undefined && { allergens: data.allergens }),
      ...(data.dietary !== undefined && { dietary: data.dietary }),
    },
  });

  if (data.costCents !== undefined) {
    if (data.costCents === null) {
      await db.menuItemCost.deleteMany({ where: { menuItemId: id, venueId } });
    } else {
      await db.menuItemCost.upsert({
        where: { menuItemId: id },
        create: { venueId, menuItemId: id, costCents: data.costCents },
        update: { costCents: data.costCents },
      });
    }
  }

  await recordAudit(opts.actor, "menu.item_update", "menu_item", id, {
    nome: aggiornato.name,
    prezzo: aggiornato.priceCents,
    disponibile: aggiornato.available,
  });
  return aggiornato;
}

/**
 * Elimina un piatto, se non è mai stato ordinato.
 *
 * Il conto di una serata chiusa **non** è in pericolo: la riga d'ordine porta
 * la sua copia di nome e prezzo (`OrderItem.name`, `priceCents`), quindi
 * resterebbe leggibile anche senza il piatto. Quello che si perde è il
 * **collegamento**: senza, non si può più dire quante volte quel piatto è
 * stato venduto, e quella è precisamente la storia che serve al costo del
 * cibo.
 *
 * Quindi: un piatto che non si fa più si segna **non disponibile**, e sparisce
 * dalla carta del cliente restando nei conti. Si elimina solo quello che non
 * è mai uscito dalla cucina — un errore di battitura, una prova.
 */
export async function deleteItem(venueId: string, id: string, opts: { actor?: AuditActor } = {}) {
  const esistente = await db.menuItem.findFirst({
    where: { id, venueId },
    include: { _count: { select: { OrderItem: true } } },
  });
  if (!esistente) throw new Error("not_found");
  if (esistente._count.OrderItem > 0) throw new Error("item_ordered");

  await db.menuItemCost.deleteMany({ where: { menuItemId: id, venueId } });
  await db.menuItem.delete({ where: { id } });
  await recordAudit(opts.actor, "menu.item_delete", "menu_item", id, { nome: esistente.name });
  return { deleted: true as const };
}

/**
 * Cambia l'ordine dentro una categoria (o l'ordine delle categorie).
 *
 * Arriva l'elenco completo degli identificativi nell'ordine voluto: è
 * l'unico modo di non lasciare due elementi con lo stesso numero d'ordine
 * quando due persone trascinano nello stesso momento.
 */
export async function reorder(
  venueId: string,
  cosa: "categorie" | "piatti",
  ids: string[],
  opts: { actor?: AuditActor } = {},
) {
  const unici = [...new Set(ids)];
  if (unici.length === 0) throw new Error("not_found");

  if (cosa === "categorie") {
    const mie = await db.menuCategory.findMany({ where: { id: { in: unici }, venueId }, select: { id: true } });
    if (mie.length !== unici.length) throw new Error("not_found");
    await db.$transaction(
      unici.map((id, i) => db.menuCategory.update({ where: { id }, data: { ordering: i } })),
    );
  } else {
    const miei = await db.menuItem.findMany({ where: { id: { in: unici }, venueId }, select: { id: true } });
    if (miei.length !== unici.length) throw new Error("not_found");
    await db.$transaction(unici.map((id, i) => db.menuItem.update({ where: { id }, data: { ordering: i } })));
  }

  await recordAudit(opts.actor, "menu.reorder", cosa === "categorie" ? "menu_category" : "menu_item", null, {
    quanti: unici.length,
  });
  return { ok: true as const };
}

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export type MenuItemView = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  available: boolean;
  allergens: Allergene[];
  dietary: Regime[];
  /** Il costo di produzione dichiarato, se c'è. */
  costCents: number | null;
  /** Quanto resta sul piatto, in centesimi. Nullo senza costo dichiarato. */
  marginCents: number | null;
  /** Quota di ricarico sul prezzo. Nulla senza costo, o a prezzo zero. */
  marginPct: number | null;
};

export type MenuCategoryView = {
  id: string;
  name: string;
  active: boolean;
  ordering: number;
  items: MenuItemView[];
};

/**
 * Il menu completo, per chi lo gestisce.
 *
 * Include il costo e il margine quando il costo c'è: è il primo assaggio del
 * food cost, e a differenza delle stime in euro qui il margine è **vero** —
 * prezzo e costo sono entrambi numeri dichiarati dal locale, non dedotti.
 */
export async function getMenu(venueId: string, menuKey = "main"): Promise<MenuCategoryView[]> {
  const [categorie, costi] = await Promise.all([
    db.menuCategory.findMany({
      where: { venueId, menuKey },
      orderBy: { ordering: "asc" },
      include: { MenuItem: { orderBy: { ordering: "asc" } } },
    }),
    db.menuItemCost.findMany({ where: { venueId }, select: { menuItemId: true, costCents: true } }),
  ]);

  const costoDi = new Map(costi.map((c) => [c.menuItemId, c.costCents]));

  return categorie.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active,
    ordering: c.ordering,
    items: c.MenuItem.map((i) => {
      const costCents = costoDi.get(i.id) ?? null;
      const marginCents = costCents != null ? i.priceCents - costCents : null;
      return {
        id: i.id,
        name: i.name,
        description: i.description,
        priceCents: i.priceCents,
        available: i.available,
        allergens: i.allergens as Allergene[],
        dietary: i.dietary as Regime[],
        costCents,
        marginCents,
        marginPct:
          marginCents != null && i.priceCents > 0 ? Math.round((marginCents / i.priceCents) * 100) : null,
      };
    }),
  }));
}

/** Le carte esistenti, per il selettore. */
export async function listMenuKeys(venueId: string): Promise<string[]> {
  const righe = await db.menuCategory.findMany({
    where: { venueId },
    distinct: ["menuKey"],
    select: { menuKey: true },
    orderBy: { menuKey: "asc" },
  });
  const chiavi = righe.map((r) => r.menuKey);
  return chiavi.includes("main") ? chiavi : ["main", ...chiavi];
}

/* -------------------------------------------------------------------------- */
/*  Il menu che legge il cliente                                              */
/* -------------------------------------------------------------------------- */

export type MenuPubblico = {
  venueName: string;
  brandLogoUrl: string | null;
  brandAccent: string | null;
  currency: string;
  categorie: {
    name: string;
    items: {
      name: string;
      description: string | null;
      priceCents: number;
      allergens: Allergene[];
      dietary: Regime[];
    }[];
  }[];
};

/**
 * Il menu dal QR sul tavolo.
 *
 * Mostra solo le categorie attive e i piatti disponibili: un piatto finito
 * non si legge, così nessuno lo ordina e nessuno resta deluso. Non contiene
 * costi né margini — sono numeri del locale, non del cliente — e una
 * categoria rimasta senza piatti disponibili non compare come sezione vuota.
 */
export async function getMenuPubblico(slug: string, menuKey = "main"): Promise<MenuPubblico | null> {
  const venue = await db.venue.findFirst({
    where: { slug, active: true },
    select: { id: true, name: true, brandLogoUrl: true, brandAccent: true, currency: true },
  });
  if (!venue) return null;

  const categorie = await db.menuCategory.findMany({
    where: { venueId: venue.id, menuKey, active: true },
    orderBy: { ordering: "asc" },
    include: { MenuItem: { where: { available: true }, orderBy: { ordering: "asc" } } },
  });

  return {
    venueName: venue.name,
    brandLogoUrl: venue.brandLogoUrl,
    brandAccent: venue.brandAccent,
    currency: venue.currency,
    categorie: categorie
      .filter((c) => c.MenuItem.length > 0)
      .map((c) => ({
        name: c.name,
        items: c.MenuItem.map((i) => ({
          name: i.name,
          description: i.description,
          priceCents: i.priceCents,
          allergens: i.allergens as Allergene[],
          dietary: i.dietary as Regime[],
        })),
      })),
  };
}
