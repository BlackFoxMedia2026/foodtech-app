import { db } from "@/lib/db";
import type { ActiveVenueContext } from "@/lib/tenant";

/**
 * Registro delle azioni sensibili.
 *
 * La tabella `AuditLog` esisteva con lo schema giusto — attore, azione,
 * entità, differenza, IP, user agent — e non veniva mai scritta. In un
 * prodotto con più utenti, ruoli diversi, contratti del personale e dati di
 * ospiti, nessuno poteva sapere chi avesse cancellato un cameriere o spostato
 * una prenotazione.
 *
 * Due scelte deliberate:
 *
 * - **Registrare non deve poter far fallire l'operazione.** Se la scrittura
 *   del registro va in errore, la prenotazione resta salvata e l'errore
 *   finisce nei log del server. Un registro è una garanzia, non un ostacolo.
 * - **La differenza contiene solo i campi cambiati.** Salvare l'intero
 *   record prima e dopo rende il registro illeggibile e cresce senza motivo;
 *   quando la differenza è vuota non si registra nulla.
 */

export type AuditAction =
  | "booking.create"
  | "booking.create_forced"
  | "booking.update"
  | "booking.cancel"
  | "booking.delete"
  | "booking.assign_table"
  | "booking.assign_table_forced"
  | "booking.walk_in"
  | "booking.guest_confirmed"
  | "booking.guest_cancelled"
  | "guest.update"
  | "waiter.create"
  | "waiter.update"
  | "waiter.delete"
  | "table.create"
  | "table.update"
  | "table.delete"
  | "room.delete"
  | "contract.create"
  | "contract.update"
  | "contract.delete"
  | "venue.brand_update"
  | "venue.service_mode_update"
  | "waitlist.add"
  | "waitlist.update"
  | "waitlist.notify"
  | "waitlist.confirm"
  | "waitlist.close"
  | "waitlist.seat"
  | "campaign.send"
  | "payment.refund";

export type AuditActor = {
  userId: string;
  email?: string | null;
  orgId: string;
  venueId: string;
  ip?: string | null;
  userAgent?: string | null;
};

/** Costruisce l'attore dal contesto della route. L'IP vero, dietro un proxy,
 * è il primo di x-forwarded-for. */
export function auditActor(ctx: ActiveVenueContext, req?: Request): AuditActor {
  const headers = req?.headers;
  return {
    userId: ctx.userId,
    email: ctx.session.user?.email ?? null,
    orgId: ctx.orgId,
    venueId: ctx.venueId,
    ip: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: headers?.get("user-agent")?.slice(0, 255) ?? null,
  };
}

type Recordable = Record<string, unknown> | null | undefined;

/**
 * Solo i campi il cui valore è cambiato, e solo i campi propri del record.
 *
 * Le relazioni restano fuori di proposito: le funzioni di aggiornamento
 * restituiscono la prenotazione con `include: { guest, table }` mentre il
 * record di partenza è senza, quindi confrontarle riempirebbe il registro con
 * l'intera scheda dell'ospite a ogni cambio di nota. Chi legge vuole sapere
 * che l'orario è passato dalle 20:00 alle 20:30, non rileggere il cliente.
 *
 * Le date sono confrontate sulla forma serializzata: due `Date` distinte con
 * lo stesso istante sono lo stesso dato.
 */
export function fieldDiff(before: Recordable, after: Recordable) {
  if (!before || !after) return null;
  const changed: Record<string, { da: unknown; a: unknown }> = {};
  for (const key of Object.keys(after)) {
    const b = before[key];
    const a = after[key];
    if (a === undefined) continue;
    // Se la chiave non c'era nel record di partenza non è una colonna: è una
    // relazione comparsa nel risultato per via di un include.
    if (!(key in before)) continue;
    if (!isOwnValue(a) || !isOwnValue(b)) continue;
    if (JSON.stringify(serialize(b)) !== JSON.stringify(serialize(a))) {
      changed[key] = { da: serialize(b), a: serialize(a) };
    }
  }
  return Object.keys(changed).length > 0 ? changed : null;
}

/** Vero per i valori che stanno davvero in una colonna: testo, numeri,
 * booleani, date, null. Falso per le relazioni caricate con include. */
function isOwnValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (value instanceof Date) return true;
  return typeof value !== "object";
}

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export async function recordAudit(
  actor: AuditActor | undefined,
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  diff?: unknown,
) {
  // Senza attore non c'è niente da attribuire: capita per le azioni che
  // arrivano dal widget pubblico o da un cron, che non hanno un utente.
  if (!actor) return;

  try {
    await db.auditLog.create({
      data: {
        orgId: actor.orgId,
        venueId: actor.venueId,
        actorId: actor.userId,
        actorEmail: actor.email ?? null,
        action,
        entityType,
        entityId,
        diff: (diff ?? undefined) as never,
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] non ho potuto registrare l'azione", { action, entityType, entityId }, err);
  }
}

/** Ultime azioni registrate per un locale, per la futura pagina di consultazione. */
export function listAuditLog(venueId: string, opts: { limit?: number; cursor?: string } = {}) {
  return db.auditLog.findMany({
    where: { venueId },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limit ?? 50, 200),
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
}
