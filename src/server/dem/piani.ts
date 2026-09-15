import type { DemPlan } from "@prisma/client";
import { db } from "@/lib/db";
import { PIANI_INIZIALI, PIANO_INCLUSO } from "@/lib/dem-piani";

/**
 * Il catalogo dei piani DEM.
 *
 * Una tabella e non una costante: il giorno in cui Business passa da 49,90 a
 * 54,90 non deve essere il giorno di una pubblicazione. Il Super Admin li
 * cambia, e il resto del prodotto li legge da qui — nessun componente conosce
 * un prezzo.
 */

/**
 * Riempie la tabella la prima volta, e **non tocca quello che c'è già**.
 *
 * `create` e non `upsert` di proposito: un `upsert` riscriverebbe a ogni
 * avvio i prezzi che qualcuno ha cambiato dal pannello, e li riscriverebbe in
 * silenzio. Un piano tolto dal catalogo iniziale resta dov'è: disattivarlo è
 * una decisione, non un effetto collaterale di un deploy.
 */
export async function assicuraPiani(): Promise<void> {
  const esistenti = new Set((await db.demPlan.findMany({ select: { slug: true } })).map((p) => p.slug));
  const mancanti = PIANI_INIZIALI.filter((p) => !esistenti.has(p.slug));
  if (mancanti.length === 0) return;

  await db.demPlan.createMany({
    data: mancanti.map((p) => ({
      slug: p.slug,
      name: p.name,
      monthlyEmails: p.monthlyEmails,
      priceCents: p.priceCents,
      sortOrder: p.sortOrder,
      description: p.description,
      badge: p.badge ?? null,
    })),
    skipDuplicates: true,
  });
}

/** Il piano compreso: esiste sempre, ed è quello con cui nasce ogni locale. */
export async function pianoIncluso(): Promise<DemPlan> {
  const piano = await db.demPlan.findUnique({ where: { slug: PIANO_INCLUSO } });
  if (piano) return piano;
  await assicuraPiani();
  return db.demPlan.findUniqueOrThrow({ where: { slug: PIANO_INCLUSO } });
}

/**
 * I piani da mostrare al cliente.
 *
 * Solo attivi e pubblici: un piano trattato a mano con un cliente grande
 * esiste in tabella ma non compare nel confronto, altrimenti tutti gli altri
 * vedrebbero un'offerta che non possono comprare.
 */
export async function pianiPubblici(): Promise<DemPlan[]> {
  await assicuraPiani();
  return db.demPlan.findMany({
    where: { active: true, visibility: "PUBLIC" },
    orderBy: [{ sortOrder: "asc" }, { monthlyEmails: "asc" }],
  });
}

/** Tutti i piani, compresi quelli spenti: è l'elenco del Super Admin. */
export async function tuttiIPiani(): Promise<DemPlan[]> {
  await assicuraPiani();
  return db.demPlan.findMany({ orderBy: [{ sortOrder: "asc" }, { monthlyEmails: "asc" }] });
}

export async function pianoPerSlug(slug: string): Promise<DemPlan | null> {
  return db.demPlan.findUnique({ where: { slug } });
}
