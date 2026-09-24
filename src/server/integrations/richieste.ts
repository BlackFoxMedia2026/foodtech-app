import { db } from "@/lib/db";
import { logEvento } from "@/lib/observability";
import { recordAudit, type AuditActor } from "@/server/audit";
import { voceDi } from "./registry";
import { adattatoreDi } from "./adapters";
import { motivoNonInstallabile } from "./installazioni";
import { impostaAccessoBeta, motivoRilascio } from "./certificazione/accesso";
import type { StatoRichiesta, TipoRichiesta } from "./cliente";

/**
 * **«Richiedi attivazione» e «Avvisami».**
 *
 * Una richiesta del ristorante a Foodtech, e basta: non parte niente verso
 * il fornitore, nessuna domanda di partnership, nessuna email automatica.
 * La vede il Super Admin in /admin/integrazioni («Richieste integrazioni»),
 * e per un'anteprima la chiude concedendo l'accesso beta al locale.
 *
 * - `ACCESS` — un'anteprima che il locale non può ancora collegare (accesso
 *   beta mancante, o Foodtech non ha ancora ciò che serve dalla sua parte);
 * - `NOTIFY` — una voce senza adattatore: il locale vuole sapere quando c'è.
 *
 * Una riga per locale e integrazione. Chiedere di nuovo quando la richiesta
 * è aperta non cambia niente; dopo che è stata chiusa, la riapre.
 */

function errore(code: string, message: string, httpStatus: number) {
  return Object.assign(new Error(message), { code, httpStatus });
}

export async function richiediAttivazione(
  a: { venueId: string; userId: string; audit?: AuditActor },
  slug: string,
): Promise<{ kind: TipoRichiesta; status: StatoRichiesta; giaDisponibile: boolean }> {
  const voce = voceDi(slug);
  if (!voce) throw errore("not_found", "Questa integrazione non esiste nel catalogo.", 404);
  if (voce.nativa) throw errore("validation_failed", "Questa integrazione si collega dalla sua pagina.", 422);

  const tecnico = motivoNonInstallabile(voce);
  const kind: TipoRichiesta = tecnico?.codice === "coming_soon" ? "NOTIFY" : "ACCESS";
  // Già collegabile: niente da chiedere, il cliente può procedere.
  if (!tecnico && !(await motivoRilascio(voce, a.venueId))) {
    return { kind, status: "APPROVED", giaDisponibile: true };
  }

  const prima = await db.integrationAccessRequest.findUnique({
    where: { venueId_integrationSlug: { venueId: a.venueId, integrationSlug: slug } },
  });
  if (prima?.status === "PENDING" && prima.kind === kind) {
    return { kind, status: "PENDING", giaDisponibile: false };
  }

  const riga = await db.integrationAccessRequest.upsert({
    where: { venueId_integrationSlug: { venueId: a.venueId, integrationSlug: slug } },
    create: { venueId: a.venueId, integrationSlug: slug, kind, requestedById: a.userId },
    update: { kind, status: "PENDING", requestedById: a.userId, requestedAt: new Date(), resolvedAt: null, resolvedByEmail: null },
  });
  await recordAudit(a.audit, "integration.access_request", "integration", slug, { kind, venueId: a.venueId });
  logEvento("integrazione.richiesta", { slug, venue: a.venueId, tipo: kind });
  return { kind, status: riga.status as StatoRichiesta, giaDisponibile: false };
}

/** Le richieste di un locale, per slug: servono alla scheda per dire «Richiesta inviata». */
export async function richiesteDelLocale(venueId: string) {
  const righe = await db.integrationAccessRequest.findMany({
    where: { venueId },
    select: { integrationSlug: true, kind: true, status: true, requestedAt: true },
  });
  return new Map(
    righe.map((r) => [r.integrationSlug, { kind: r.kind as TipoRichiesta, status: r.status as StatoRichiesta, il: r.requestedAt }]),
  );
}

/* -------------------------------------------------------------------------- */
/*  Solo Super Admin                                                          */
/* -------------------------------------------------------------------------- */

/** Le richieste aperte, le più vecchie prima: è una coda. */
export async function richiesteAperte() {
  const righe = await db.integrationAccessRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
    take: 200,
    include: { venue: { select: { name: true, slug: true, org: { select: { name: true } } } } },
  });
  const utenti = await db.user.findMany({
    where: { id: { in: righe.map((r) => r.requestedById).filter((x): x is string => !!x) } },
    select: { id: true, email: true, name: true },
  });
  const chi = new Map(utenti.map((u) => [u.id, u]));
  return righe.map((r) => ({
    id: r.id,
    slug: r.integrationSlug,
    integrazione: voceDi(r.integrationSlug)?.nome ?? r.integrationSlug,
    tipo: r.kind as TipoRichiesta,
    /** Si può concedere l'accesso beta solo dove c'è un adattatore. */
    abilitabile: r.kind === "ACCESS" && !!adattatoreDi(r.integrationSlug),
    venueId: r.venueId,
    locale: r.venue.name,
    slugLocale: r.venue.slug,
    gruppo: r.venue.org.name,
    richiestaDa: r.requestedById ? chi.get(r.requestedById)?.email ?? null : null,
    il: r.requestedAt.toISOString(),
  }));
}

async function richiestaAperta(id: string) {
  const r = await db.integrationAccessRequest.findUnique({ where: { id } });
  if (!r || r.status !== "PENDING") throw errore("not_found", "Richiesta non trovata o già chiusa.", 404);
  return r;
}

/**
 * «Abilita beta»: concede l'accesso beta al locale per quell'integrazione.
 * La richiesta la chiude `impostaAccessoBeta` (vale anche quando l'accesso
 * si concede da un'altra strada: console, pannello).
 */
export async function approvaRichiesta(id: string, email: string, audit?: AuditActor) {
  const r = await richiestaAperta(id);
  if (r.kind !== "ACCESS" || !adattatoreDi(r.integrationSlug)) {
    throw errore("validation_failed", "Questa integrazione non ha ancora un collegamento da abilitare.", 422);
  }
  await impostaAccessoBeta({ venueId: r.venueId, slug: r.integrationSlug, abilitato: true, email, audit });
}

export async function archiviaRichiesta(id: string, email: string, audit?: AuditActor) {
  const r = await richiestaAperta(id);
  await db.integrationAccessRequest.update({
    where: { id: r.id },
    data: { status: "DISMISSED", resolvedAt: new Date(), resolvedByEmail: email },
  });
  await recordAudit(audit, "integration.access_request_dismissed", "integration", r.integrationSlug, { venueId: r.venueId, da: email });
}
