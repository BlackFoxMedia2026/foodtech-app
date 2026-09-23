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
  | "booking.combine_tables"
  | "booking.combine_tables_forced"
  | "booking.split_tables"
  | "booking.walk_in"
  | "booking.guest_confirmed"
  | "booking.guest_cancelled"
  | "guest.update"
  | "guest.anonymize"
  | "guest.export"
  | "guest.merge"
  | "order.open"
  | "order.line_add"
  | "order.line_update"
  | "order.close"
  | "order.cancel"
  /*
    La comanda: la tranche di piatti che va in cucina, dentro il conto.

    Ne resta traccia qui **oltre** a `ComandaEvento` e non è un doppione: là
    si registra lo stato e chi l'ha mosso, e serve alla schermata del tavolo;
    qui si registra l'azione con IP e dispositivo, e serve quando a fine
    serata due piatti non tornano. Sono due domande diverse fatte da due
    persone diverse.
  */
  | "comanda.line_add"
  | "comanda.line_update"
  | "comanda.line_remove"
  | "comanda.send"
  | "comanda.status"
  | "comanda.cancel"
  | "comanda.guest_rename"
  | "menu.category_create"
  | "menu.category_update"
  | "menu.category_delete"
  | "menu.item_create"
  | "menu.item_update"
  | "menu.item_delete"
  | "menu.reorder"
  | "coupon.create"
  | "coupon.update"
  | "coupon.redeem"
  | "coupon.redeem_undo"
  | "loyalty.rules_update"
  | "loyalty.redeem"
  | "loyalty.adjust"
  | "giftcard.create"
  | "giftcard.cancel"
  | "giftcard.redeem"
  | "giftcard.redeem_undo"
  | "experience.create"
  | "experience.update"
  | "experience.delete"
  | "waiter.create"
  | "waiter.update"
  | "waiter.delete"
  // La scheda HR: ogni cosa che cambia sulla persona finisce qui con
  // entityType "waiter" ed entityId = la persona, così la sua tab «Storico»
  // è una sola interrogazione.
  | "waiter.document_upload"
  | "waiter.document_replace"
  | "waiter.document_delete"
  | "waiter.training_create"
  | "waiter.training_update"
  | "waiter.training_delete"
  | "waiter.medical_create"
  | "waiter.medical_update"
  | "waiter.medical_delete"
  | "waiter.note_create"
  | "waiter.note_delete"
  | "waiter.account_invite"
  | "waiter.account_email"
  | "waiter.account_password"
  | "waiter.account_reset_link"
  | "waiter.account_disable"
  | "waiter.account_enable"
  | "waiter.account_permissions"
  | "shift.create"
  | "shift.update"
  | "shift.delete"
  // I turni di **servizio** — quando si prenota — non quelli delle persone:
  // entityType "shift", mentre i tre qui sopra sono "work_shift".
  | "service_shift.create"
  | "service_shift.update"
  | "service_shift.delete"
  | "table.create"
  | "table.update"
  | "table.delete"
  // Il QR di pagamento del tavolo. La rigenerazione è quella che conta: da
  // quel momento ogni cartoncino già stampato smette di funzionare, e se
  // qualcuno se ne accorge a metà servizio deve poter sapere chi e quando.
  | "table.qr_on"
  | "table.qr_off"
  | "table.qr_rotate"
  /* Chi copre un tavolo in un servizio. Lo scrive il maître dalla piantina e,
     da quando esiste «prendo io», anche il cameriere dal telefono: a fine
     serata «chi seguiva il dodici alle nove» è una domanda che si fa. */
  | "table.assign_staff"
  | "room.delete"
  | "contract.create"
  | "contract.update"
  | "contract.delete"
  | "venue.brand_update"
  | "venue.service_mode_update"
  /** Da dove entrano le chiamate: scatoletta o deviazione dall'operatore. */
  | "venue.voice_ingresso"
  | "venue.voice_benvenuto"
  | "venue.calendario_link"
  | "utente.due_fattori"
  | "staff.richiesta"
  | "staff.richiesta_decisa"
  | "venue.avg_spend_update"
  /* La chiave del centralino: quando e da chi. Davanti a «il telefono non
     funziona più» è la prima cosa da guardare. */
  | "venue.centralino_attivato"
  | "venue.centralino_spento"
  /* I dati del telefono nel browser. Nel registro va **cosa** è cambiato, non
     il valore: la password SIP non entra in un registro. */
  | "venue.centralino_sip_modificato"
  /* La chiave con cui il centralino legge i dati di questo locale: chi l'ha
     emessa e quando è la prima domanda se quei dati finiscono dove non devono. */
  | "venue.centralino_chiave_emessa"
  | "venue.centralino_chiave_revocata"
  | "venue.wifi_update"
  /* La caparra: la regola del locale, la richiesta al cliente, e il denaro che
     torna indietro. Tre righe perche sono tre momenti diversi, e davanti a
     «perche questo cliente ha pagato?» servono tutti e tre. */
  | "venue.caparra_update"
  | "booking.caparra_chiesta"
  | "booking.caparra_rimborsata"
  /* Eventi e gruppi: la trattativa dalla richiesta alla prenotazione. Il
     «persa» porta il motivo, che e l'unico numero di quella pagina che puo
     far guadagnare qualcosa. */
  | "evento.richiesta"
  | "evento.preventivo"
  | "evento.accettata"
  | "evento.persa"
  /** Gli SMS di un locale accesi o spenti: sono messaggi che si pagano e che
   * arrivano sul telefono dei clienti. */
  | "venue.sms_update"
  /** Un file di un altro gestionale portato dentro: quante righe, cosa e stato
   * creato, quali colonne non abbiamo capito. */
  | "venue.import"
  | "venue.review_links_update"
  | "venue.booking_window_update"
  | "team.invite"
  | "team.invite_revoked"
  | "team.invite_accepted"
  | "team.role_change"
  | "team.remove"
  // Chiudere le sessioni di qualcuno è un'azione da tracciare come le altre:
  // chi l'ha fatta, su chi, e quando. È l'unico modo di distinguere «gli
  // abbiamo chiuso l'accesso» da «si è disconnesso da solo».
  | "team.revoke_sessions"
  | "account.revoke_sessions"
  | "waitlist.add"
  | "waitlist.update"
  | "waitlist.notify"
  | "waitlist.confirm"
  | "waitlist.close"
  | "waitlist.seat"
  | "campaign.send"
  | "campaign.cancel"
  | "payment.refund"
  /*
    Il modulo DEM. Sono le azioni che spostano denaro o spengono un servizio:
    chi ha cambiato piano, chi ha alzato la quota di un cliente, chi ha
    sospeso gli invii di un locale. Senza registro, la domanda «perché questo
    ristorante è su Business?» non ha una risposta.
  */
  | "dem.plan_change"
  | "dem.plan_scheduled"
  | "dem.custom_limit"
  | "dem.sending_paused"
  | "dem.sending_resumed"
  | "dem.domain_change"
  | "dem.domain_verified"
  | "dem.subscription_cancelled"
  /*
    Le integrazioni. Chi ha collegato la cassa del locale, chi l'ha
    scollegata, chi ha cambiato un abbinamento: sono le domande che si fanno
    il giorno in cui un ordine è finito sul tavolo sbagliato. Nella
    differenza non entra mai un segreto (vedi `server/integrations/`).
  */
  | "integration.install"
  | "integration.authorize"
  | "integration.configure"
  | "integration.test"
  | "integration.activate"
  | "integration.disable"
  | "integration.enable"
  | "integration.uninstall"
  | "integration.sync_requested"
  | "integration.mapping_update"
  | "integration.beta_access"
  | "integration.rollout"
  | "integration.certification_run"
  | "integration.certification_evidence"
  | "integration.fiscal_operation"
  | "integration.suspend"
  | "integration.resume";

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

/**
 * Chi compie un'azione **sul proprio accesso**, dove un locale può non esserci.
 *
 * `AuditLog` richiede un'organizzazione (la colonna ha un vincolo verso
 * `Organization`), e l'amministratore di piattaforma non appartiene a nessuna:
 * per lui una riga di registro non si può scrivere. Quindi qui si restituisce
 * `undefined`, e `recordAudit` — che accetta un attore facoltativo — non
 * scrive niente.
 *
 * **Non si inventa un'organizzazione per far quadrare il registro.** Una riga
 * attribuita a un locale dove quell'azione non è successa è peggio di una riga
 * che manca: la prima la si legge e ci si crede.
 */
export async function auditAttoreDelProprioAccesso(
  utente: { userId: string; email: string },
  req?: Request,
): Promise<AuditActor | undefined> {
  const appartenenza = await db.venueMembership.findFirst({
    where: { userId: utente.userId, disabledAt: null },
    orderBy: { createdAt: "asc" },
    select: { venueId: true, venue: { select: { orgId: true } } },
  });
  if (!appartenenza?.venue?.orgId) return undefined;

  const headers = req?.headers;
  return {
    userId: utente.userId,
    email: utente.email,
    orgId: appartenenza.venue.orgId,
    venueId: appartenenza.venueId,
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
