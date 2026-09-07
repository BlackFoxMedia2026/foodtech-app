import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "./audit";

/**
 * Le esperienze: il programma del locale.
 *
 * La pagina esisteva e mostrava le esperienze in sola lettura, con un pulsante
 * «Nuova esperienza» che **non faceva niente**. È la forma peggiore di
 * funzione fantasma: non una pagina vuota che si capisce, ma un pulsante che
 * sembra vivo.
 *
 * Qui c'è il pezzo che mancava — creare, modificare, pubblicare — e si ferma
 * dove finisce l'onestà: **i biglietti non si vendono da dentro Tavolo**.
 * Vendere richiede i pagamenti, che sono bloccati in attesa delle chiavi
 * Stripe. Nel frattempo `Experience.ticketUrl` esisteva già nello schema: si
 * mette il link a dove i biglietti si vendono davvero, e la pagina lo dice.
 */

export const ExperienceInput = z
  .object({
    title: z.string().trim().min(1, "Serve un titolo").max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    capacity: z.coerce.number().int().min(1).max(2000),
    /** In centesimi, come tutti gli importi dell'applicazione. */
    priceCents: z.coerce.number().int().min(0).max(100_000_00),
    /** Dove si comprano i biglietti, se si comprano da qualche parte. */
    ticketUrl: z.string().trim().url("Il link dei biglietti non è un indirizzo valido").optional().nullable(),
    published: z.boolean().optional(),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "La fine deve venire dopo l'inizio",
    path: ["endsAt"],
  });

export type ExperienceInputType = z.infer<typeof ExperienceInput>;

/**
 * Un indirizzo leggibile a partire dal titolo.
 *
 * `slug` è obbligatorio e unico per locale, e chiederlo a chi crea un evento
 * sarebbe un campo in più da spiegare. In caso di collisione si aggiunge un
 * numero: due «Cena di San Valentino» in due anni sono normali.
 */
export function slugDaTitolo(titolo: string): string {
  const base = titolo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "esperienza";
}

async function slugLibero(venueId: string, titolo: string, escludi?: string): Promise<string> {
  const base = slugDaTitolo(titolo);
  for (let n = 0; n < 50; n++) {
    const candidato = n === 0 ? base : `${base}-${n + 1}`;
    const esistente = await db.experience.findFirst({
      where: { venueId, slug: candidato, ...(escludi ? { id: { not: escludi } } : {}) },
      select: { id: true },
    });
    if (!esistente) return candidato;
  }
  return `${base}-${Date.now()}`;
}

export type ExperienceView = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  priceCents: number;
  ticketUrl: string | null;
  published: boolean;
  /** Biglietti registrati: oggi sempre zero, perché non si vendono da qui. */
  ticketsSold: number;
};

export async function listExperiences(venueId: string): Promise<ExperienceView[]> {
  const items = await db.experience.findMany({
    where: { venueId },
    orderBy: { startsAt: "asc" },
    include: { tickets: { select: { quantity: true, status: true } } },
  });

  return items.map((e) => ({
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    capacity: e.capacity,
    priceCents: e.priceCents,
    ticketUrl: e.ticketUrl,
    published: e.published,
    ticketsSold: e.tickets
      .filter((t) => t.status !== "REFUNDED" && t.status !== "CANCELLED")
      .reduce((s, t) => s + t.quantity, 0),
  }));
}

export async function createExperience(venueId: string, raw: unknown, opts: { actor?: AuditActor } = {}) {
  const data = ExperienceInput.parse(raw);
  const creata = await db.experience.create({
    data: {
      venueId,
      title: data.title,
      slug: await slugLibero(venueId, data.title),
      description: data.description ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      capacity: data.capacity,
      priceCents: data.priceCents,
      ticketUrl: data.ticketUrl ?? null,
      // Nasce bozza se non si dice altro: un evento pubblicato per sbaglio è
      // visibile a chiunque.
      published: data.published ?? false,
    },
  });

  await recordAudit(opts.actor, "experience.create", "experience", creata.id, {
    titolo: creata.title,
    quando: creata.startsAt.toISOString(),
    pubblicata: creata.published,
  });

  return creata;
}

export async function updateExperience(
  venueId: string,
  id: string,
  raw: unknown,
  opts: { actor?: AuditActor } = {},
) {
  const esistente = await db.experience.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");

  const data = ExperienceInput.parse(raw);
  const aggiornata = await db.experience.update({
    where: { id },
    data: {
      title: data.title,
      // Lo slug segue il titolo solo se il titolo cambia: cambiarlo sempre
      // romperebbe i link già in giro a ogni salvataggio.
      ...(data.title !== esistente.title ? { slug: await slugLibero(venueId, data.title, id) } : {}),
      description: data.description ?? null,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      capacity: data.capacity,
      priceCents: data.priceCents,
      ticketUrl: data.ticketUrl ?? null,
      ...(data.published !== undefined ? { published: data.published } : {}),
    },
  });

  await recordAudit(opts.actor, "experience.update", "experience", id, {
    titolo: aggiornata.title,
    quando: aggiornata.startsAt.toISOString(),
    pubblicata: aggiornata.published,
  });

  return aggiornata;
}

/** Pubblicare o riportare in bozza, senza toccare il resto. */
export async function setExperiencePublished(
  venueId: string,
  id: string,
  published: boolean,
  opts: { actor?: AuditActor } = {},
) {
  const esistente = await db.experience.findFirst({ where: { id, venueId } });
  if (!esistente) throw new Error("not_found");

  const aggiornata = await db.experience.update({ where: { id }, data: { published } });
  await recordAudit(opts.actor, "experience.update", "experience", id, {
    titolo: aggiornata.title,
    pubblicata: published,
  });
  return aggiornata;
}

/**
 * Elimina un'esperienza, se non ha biglietti.
 *
 * Con dei biglietti registrati non si cancella: dietro c'è qualcuno che ha
 * pagato, e far sparire l'evento farebbe sparire anche la sua traccia. In quel
 * caso si riporta in bozza.
 */
export async function deleteExperience(venueId: string, id: string, opts: { actor?: AuditActor } = {}) {
  const esistente = await db.experience.findFirst({
    where: { id, venueId },
    include: { _count: { select: { tickets: true } } },
  });
  if (!esistente) throw new Error("not_found");
  if (esistente._count.tickets > 0) throw new Error("has_tickets");

  await db.experience.delete({ where: { id } });
  await recordAudit(opts.actor, "experience.delete", "experience", id, { titolo: esistente.title });
  return { deleted: true as const };
}
