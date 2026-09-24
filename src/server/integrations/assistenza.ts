import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { can } from "@/lib/abilities";
import { logEvento } from "@/lib/observability";
import { recordAudit, type AuditActor } from "@/server/audit";
import { voceDi } from "./registry";
import { adattatoreDi } from "./adapters";
import { motivoNonInstallabile } from "./installazioni";
import { motivoRilascio } from "./certificazione/accesso";

/**
 * **L'assistenza di Foodtech sulle integrazioni.**
 *
 * Molti ristoranti non sanno dove si trova una chiave API, o chi nel loro
 * gruppo gestisce l'account Facebook. Questo modulo permette a Foodtech di
 * accompagnarli **senza mai ricevere un segreto** per email, chat o
 * telefono. Tre pezzi:
 *
 * 1. **La richiesta** («Chiedi aiuto a Foodtech»): una riga per locale e
 *    integrazione, con una nota del cliente. La vede il Super Admin nella
 *    coda di /admin/integrazioni.
 * 2. **La delega**: il cliente, con il permesso di collegare, autorizza
 *    Foodtech a configurare **quella** integrazione su **quel** locale per
 *    `GIORNI_DELEGA` giorni. Senza delega attiva, un amministratore Foodtech
 *    guarda e verifica la connessione; con la delega, sceglie anche la sede,
 *    cosa sincronizzare, attiva. Mai disinstalla: scollegare resta del
 *    cliente. La delega si revoca con un clic e scade da sola.
 * 3. **Il collegamento di consegna**: Foodtech prepara un indirizzo da
 *    mandare al cliente; il cliente lo apre **nella sua sessione** e arriva
 *    al passo «Accesso» del wizard sul locale giusto, dove scrive lui le
 *    credenziali (o accede al fornitore). Il collegamento non porta segreti
 *    e non ne dà: nel database c'è solo l'impronta SHA-256 del codice, vale
 *    `ORE_CONSEGNA` ore, e funziona solo per chi è membro di quel locale con
 *    il permesso di collegare. Si chiude da solo quando le credenziali
 *    entrano (`installazioni.ts`).
 *
 * In nessuno dei tre casi un amministratore vede un segreto: la vista
 * interna legge dalle credenziali solo tipo, permessi e scadenze.
 */

export const GIORNI_DELEGA = 7;
export const ORE_CONSEGNA = 72;

function errore(code: string, message: string, httpStatus: number) {
  return Object.assign(new Error(message), { code, httpStatus });
}

function voceConAdattatore(slug: string) {
  const voce = voceDi(slug);
  if (!voce) throw errore("not_found", "Questa integrazione non esiste nel catalogo.", 404);
  if (voce.nativa) throw errore("validation_failed", "Questa integrazione si collega dalla sua pagina.", 422);
  return voce;
}

export function impronta(codice: string): string {
  return createHash("sha256").update(codice).digest("hex");
}

/* -------------------------------------------------------------------------- */
/*  Dal lato del cliente                                                      */
/* -------------------------------------------------------------------------- */

export type AttoreCliente = { venueId: string; userId: string; audit?: AuditActor };

/**
 * «Chiedi aiuto a Foodtech», con o senza delega. Chiedere di nuovo riapre la
 * stessa riga e aggiorna la nota; una delega già attiva si rinnova solo se
 * il cliente la concede di nuovo.
 */
export async function chiediAssistenza(a: AttoreCliente, slug: string, input: { nota?: string | null; delega: boolean }, adesso = new Date()) {
  voceConAdattatore(slug);
  const nota = input.nota?.trim().slice(0, 1000) || null;
  const delega = input.delega
    ? { delegatedById: a.userId, delegatedAt: adesso, delegatedUntil: new Date(adesso.getTime() + GIORNI_DELEGA * 86_400_000), revokedAt: null }
    : {};
  const riga = await db.integrationAssistance.upsert({
    where: { venueId_integrationSlug: { venueId: a.venueId, integrationSlug: slug } },
    create: { venueId: a.venueId, integrationSlug: slug, note: nota, requestedById: a.userId, requestedAt: adesso, ...delega },
    update: { status: "OPEN", note: nota, requestedById: a.userId, requestedAt: adesso, closedAt: null, closedByEmail: null, ...delega },
  });
  await recordAudit(a.audit, "integration.assistance_request", "integration", slug, {
    venueId: a.venueId,
    delega: input.delega ? { fino: riga.delegatedUntil?.toISOString() } : null,
    nota: !!nota,
  });
  logEvento("integrazione.assistenza_richiesta", { slug, venue: a.venueId, delega: input.delega });
  return riga;
}

/** Il cliente toglie la delega. La richiesta resta aperta: Foodtech può ancora guardare e consigliare. */
export async function revocaDelega(a: AttoreCliente, slug: string, adesso = new Date()) {
  const { count } = await db.integrationAssistance.updateMany({
    where: { venueId: a.venueId, integrationSlug: slug, delegatedUntil: { gt: adesso }, revokedAt: null },
    data: { revokedAt: adesso, delegatedUntil: null },
  });
  if (count > 0) await recordAudit(a.audit, "integration.assistance_revoked", "integration", slug, { venueId: a.venueId });
  return { revocata: count > 0 };
}

export type AssistenzaCliente = {
  aperta: boolean;
  richiestaIl: string | null;
  nota: string | null;
  /** Fino a quando Foodtech può configurare, se il cliente l'ha autorizzato. */
  delegaFinoAl: string | null;
};

export async function assistenzaDelLocale(venueId: string, slug: string, adesso = new Date()): Promise<AssistenzaCliente | null> {
  const r = await db.integrationAssistance.findUnique({
    where: { venueId_integrationSlug: { venueId, integrationSlug: slug } },
    select: { status: true, requestedAt: true, note: true, delegatedUntil: true, revokedAt: true },
  });
  if (!r) return null;
  const attiva = !!r.delegatedUntil && r.delegatedUntil > adesso && !r.revokedAt;
  if (r.status !== "OPEN" && !attiva) return null;
  return {
    aperta: r.status === "OPEN",
    richiestaIl: r.requestedAt.toISOString(),
    nota: r.note,
    delegaFinoAl: attiva ? r.delegatedUntil!.toISOString() : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Dal lato di Foodtech                                                      */
/* -------------------------------------------------------------------------- */

export async function delegaAttiva(venueId: string, slug: string, adesso = new Date()): Promise<boolean> {
  const r = await db.integrationAssistance.findUnique({
    where: { venueId_integrationSlug: { venueId, integrationSlug: slug } },
    select: { delegatedUntil: true, revokedAt: true },
  });
  return !!r?.delegatedUntil && r.delegatedUntil > adesso && !r.revokedAt;
}

/** La coda: le richieste aperte, le più vecchie prima. */
export async function assistenzeAperte(adesso = new Date()) {
  const righe = await db.integrationAssistance.findMany({
    where: { status: "OPEN" },
    orderBy: { requestedAt: "asc" },
    take: 200,
    include: { venue: { select: { name: true, slug: true, org: { select: { name: true } } } } },
  });
  const utenti = await db.user.findMany({
    where: { id: { in: righe.map((r) => r.requestedById).filter((x): x is string => !!x) } },
    select: { id: true, email: true },
  });
  const chi = new Map(utenti.map((u) => [u.id, u.email]));
  return righe.map((r) => ({
    id: r.id,
    slug: r.integrationSlug,
    integrazione: voceDi(r.integrationSlug)?.nome ?? r.integrationSlug,
    venueId: r.venueId,
    locale: r.venue.name,
    gruppo: r.venue.org.name,
    nota: r.note,
    richiestaDa: r.requestedById ? chi.get(r.requestedById) ?? null : null,
    il: r.requestedAt.toISOString(),
    delegaFinoAl: r.delegatedUntil && r.delegatedUntil > adesso && !r.revokedAt ? r.delegatedUntil.toISOString() : null,
  }));
}

export async function chiudiAssistenza(input: { venueId: string; slug: string; email: string; audit?: AuditActor }) {
  const { count } = await db.integrationAssistance.updateMany({
    where: { venueId: input.venueId, integrationSlug: input.slug, status: "OPEN" },
    // Chiudere la richiesta chiude anche la delega: il lavoro è finito.
    data: { status: "CLOSED", closedAt: new Date(), closedByEmail: input.email, delegatedUntil: null },
  });
  if (count === 0) throw errore("not_found", "Nessuna richiesta aperta per questa integrazione.", 404);
  await recordAudit(input.audit, "integration.assistance_closed", "integration", input.slug, { venueId: input.venueId, da: input.email });
}

/**
 * Un collegamento di consegna nuovo. Quelli ancora validi per la stessa
 * integrazione dello stesso locale si revocano: ne vale uno alla volta, così
 * un indirizzo mandato per sbaglio a qualcun altro si spegne rifacendolo.
 *
 * Restituisce il codice in chiaro **una volta sola**: non si salva, e non si
 * può rileggere.
 */
export async function creaConsegna(input: { venueId: string; slug: string; email: string; origine: string; audit?: AuditActor }, adesso = new Date()) {
  const voce = voceConAdattatore(input.slug);
  if (!adattatoreDi(voce.slug)) throw errore("validation_failed", "Questa integrazione non ha ancora un collegamento da configurare.", 422);
  const venue = await db.venue.findUnique({ where: { id: input.venueId }, select: { id: true } });
  if (!venue) throw errore("not_found", "Locale non trovato.", 404);
  /* Un collegamento che porta a «Richiedi attivazione» sarebbe un vicolo
     cieco per il cliente: prima si sistema ciò che manca dalla parte di
     Foodtech (variabili della piattaforma, beta per questo locale). */
  const tecnico = motivoNonInstallabile(voce);
  if (tecnico) throw errore(`integration_${tecnico.codice}`, `Non ancora collegabile: ${tecnico.messaggio}`, 409);
  if (await motivoRilascio(voce, input.venueId)) {
    throw errore("integration_beta_required", "Abilita prima l'anteprima per questo locale: senza, il cliente non vedrebbe il pulsante «Collega».", 409);
  }

  const codice = randomBytes(24).toString("base64url");
  const scade = new Date(adesso.getTime() + ORE_CONSEGNA * 3_600_000);
  const [, riga] = await db.$transaction([
    db.integrationCredentialHandoff.updateMany({
      where: { venueId: input.venueId, integrationSlug: input.slug, completedAt: null, revokedAt: null, expiresAt: { gt: adesso } },
      data: { revokedAt: adesso },
    }),
    db.integrationCredentialHandoff.create({
      data: { venueId: input.venueId, integrationSlug: input.slug, tokenHash: impronta(codice), createdByEmail: input.email, expiresAt: scade },
    }),
  ]);
  await recordAudit(input.audit, "integration.handoff_created", "integration", input.slug, {
    venueId: input.venueId,
    consegna: riga.id,
    scade: scade.toISOString(),
    da: input.email,
  });
  return { id: riga.id, url: `${input.origine}/api/integrations/consegna/${codice}`, scadeIl: scade.toISOString() };
}

export async function revocaConsegna(input: { id: string; venueId: string; email: string; audit?: AuditActor }) {
  const { count } = await db.integrationCredentialHandoff.updateMany({
    where: { id: input.id, venueId: input.venueId, completedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw errore("not_found", "Collegamento non trovato o già chiuso.", 404);
  await recordAudit(input.audit, "integration.handoff_revoked", "integration", input.id, { venueId: input.venueId, da: input.email });
}

export type EsitoApertura =
  | { ok: true; venueId: string; slug: string }
  | { ok: false; motivo: "sconosciuto" | "scaduto" | "revocato" | "usato" | "non_membro" };

/**
 * Chi apre il collegamento: deve essere **già entrato** in Foodtech, membro
 * attivo del locale del collegamento e con il permesso di collegare. Un
 * collegamento girato a chi non lavora in quel locale non apre niente.
 */
export async function apriConsegna(codice: string, utente: { userId: string }, adesso = new Date()): Promise<EsitoApertura> {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(codice)) return { ok: false, motivo: "sconosciuto" };
  const c = await db.integrationCredentialHandoff.findUnique({ where: { tokenHash: impronta(codice) } });
  if (!c) return { ok: false, motivo: "sconosciuto" };
  if (c.revokedAt) return { ok: false, motivo: "revocato" };
  if (c.completedAt) return { ok: false, motivo: "usato" };
  if (c.expiresAt <= adesso) return { ok: false, motivo: "scaduto" };

  const m = await db.venueMembership.findUnique({
    where: { userId_venueId: { userId: utente.userId, venueId: c.venueId } },
    select: { role: true, disabledAt: true, venue: { select: { orgId: true } } },
  });
  if (!m || m.disabledAt || !can(m.role, "integration:install")) return { ok: false, motivo: "non_membro" };

  if (!c.openedAt) {
    await db.integrationCredentialHandoff.updateMany({ where: { id: c.id, openedAt: null }, data: { openedAt: adesso, openedById: utente.userId } });
    await recordAudit({ userId: utente.userId, orgId: m.venue.orgId, venueId: c.venueId }, "integration.handoff_opened", "integration", c.integrationSlug, {
      consegna: c.id,
    });
  }
  return { ok: true, venueId: c.venueId, slug: c.integrationSlug };
}
