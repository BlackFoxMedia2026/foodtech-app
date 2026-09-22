import { db } from "@/lib/db";
import { dateKeyInVenue } from "@/lib/venue-time";
import { recordAudit, type AuditActor } from "@/server/audit";
import { copertureDelServizio, servizioCorrente, type Copertura } from "./sala";

/**
 * **«Prendo io».**
 *
 * ## Il buco che questa funzione chiude
 *
 * Fino a ieri i tavoli si assegnavano **solo dal back office**: il maître
 * apriva la piantina, o la pagina Camerieri, e distribuiva i ranghi. Funziona
 * nei locali che lo fanno; negli altri — che sono tanti — nessun tavolo era
 * di nessuno, e la Staff App di un cameriere restava vuota per tutto il
 * servizio. «Nessun tavolo assegnato», con un pulsante che portava in una
 * sala dove non c'era niente da premere per rimediare.
 *
 * Il gesto che mancava non è una funzione nuova del prodotto: è quello che in
 * sala si fa a voce cinquanta volte a sera — *questo lo seguo io*. Adesso si
 * fa da un tasto, e da quel momento il tavolo compare fra i propri, si apre
 * senza chiedere permesso, e sparisce dalla coda degli altri.
 *
 * ## Niente modello nuovo
 *
 * Scrive una `StaffAssignment` con `scope: TABLE` e capacità
 * `TABLE_RESPONSIBLE` — la **stessa riga** che scriverebbe il maître dalla
 * piantina, con la stessa chiave (`tableId + data + servizio + capacità`).
 * Da lì in poi la leggono `tavoliAssegnatiA`, `tavoloConsentito` e la
 * piantina del back office: chi prende un tavolo dal telefono risulta
 * assegnato anche al leggio, che è il solo modo perché le due schermate
 * raccontino la stessa serata.
 *
 * L'unicità della chiave fa il resto: **un responsabile per tavolo**. Un
 * secondo cameriere che preme «prendo io» subentra, e non si aggiunge — è il
 * comportamento che ci si aspetta quando si dà il cambio a un collega che è
 * andato in pausa, e l'alternativa (due responsabili) sarebbe un tavolo che
 * compare come «mio» a due persone che credono che se ne occupi l'altra.
 */
export class PresaInCaricoError extends Error {
  constructor(readonly code: "not_found" | "occupato_da_altri") {
    super(code);
    this.name = "PresaInCaricoError";
  }
}

export const MESSAGGIO_PRESA: Record<PresaInCaricoError["code"], string> = {
  not_found: "Questo tavolo non esiste in questo locale.",
  occupato_da_altri: "Questo tavolo lo sta già seguendo un collega.",
};

export type EsitoPresaInCarico = {
  tableId: string;
  label: string;
  servizio: string;
  /** Chi lo segue adesso — cioè chi ha premuto. */
  coperto: Copertura[];
};

export async function prendiInCarico(
  ctx: { venueId: string; timezone: string; waiterId: string },
  tableId: string,
  opts: {
    adesso?: Date;
    actor?: AuditActor;
    /**
     * Vero per chi ha `view_all_tables`: può prendere anche un tavolo che
     * qualcun altro sta già seguendo, perché è il gesto del maître che
     * ridistribuisce i ranghi a metà servizio.
     *
     * Senza, il tavolo di un collega si rifiuta: prendersi il rango di un
     * altro dal telefono, senza che lui lo sappia, vorrebbe dire due persone
     * che si passano un tavolo a vicenda senza accorgersene.
     */
    puoSubentrare?: boolean;
  } = {},
): Promise<EsitoPresaInCarico> {
  const adesso = opts.adesso ?? new Date();
  const giorno = dateKeyInVenue(adesso, ctx.timezone);

  const tavolo = await db.table.findFirst({
    where: { id: tableId, venueId: ctx.venueId },
    select: { id: true, label: true },
  });
  if (!tavolo) throw new PresaInCaricoError("not_found");

  const servizio = await servizioCorrente(ctx.venueId, ctx.timezone, adesso);
  const chiCopre = (await copertureDelServizio(ctx.venueId, giorno, servizio)).get(tableId) ?? [];
  const mio = chiCopre.some((c) => c.waiterId === ctx.waiterId);

  if (chiCopre.length > 0 && !mio && !opts.puoSubentrare) {
    throw new PresaInCaricoError("occupato_da_altri");
  }

  /*
    Idempotente: premere due volte, o premere su un tavolo che è già mio,
    riscrive la stessa riga. Serve più di quanto sembri — la sonda del
    realtime può far ridisegnare la card fra il tocco e la risposta, e un
    secondo tocco non deve produrre un errore su un gesto riuscito.
  */
  const data = new Date(`${giorno}T00:00:00.000Z`);
  await db.staffAssignment.upsert({
    where: {
      StaffAssignment_table_slot: {
        tableId,
        date: data,
        service: servizio,
        assignmentType: "TABLE_RESPONSIBLE",
      },
    },
    create: {
      venueId: ctx.venueId,
      waiterId: ctx.waiterId,
      tableId,
      date: data,
      service: servizio,
      scope: "TABLE",
      assignmentType: "TABLE_RESPONSIBLE",
    },
    update: { waiterId: ctx.waiterId },
  });

  await recordAudit(opts.actor, "table.assign_staff", "table", tableId, {
    servizio,
    giorno,
    waiterId: ctx.waiterId,
    presaInCarico: true,
  });

  const dopo = (await copertureDelServizio(ctx.venueId, giorno, servizio)).get(tableId) ?? [];
  return { tableId, label: tavolo.label, servizio, coperto: dopo };
}

/**
 * La presa in carico **implicita**, quando qualcuno apre una comanda su un
 * tavolo che non sta seguendo nessuno.
 *
 * Chi batte la comanda di un tavolo lo sta servendo: chiedergli di premere
 * prima «prendo io» sarebbe un tocco in più su un fatto già dichiarato dal
 * gesto. Non ruba niente a nessuno — se il tavolo ha già un responsabile
 * questa funzione non fa nulla e la comanda si batte lo stesso, perché
 * aiutare un collega su un suo tavolo è normale e non deve cambiargli il
 * rango sotto i piedi.
 *
 * Non può far fallire l'apertura della comanda: stessa regola dell'audit e
 * delle notifiche. Una comanda che non parte perché non si è potuta scrivere
 * un'assegnazione è un guasto molto peggiore dell'assegnazione mancante.
 */
export async function prendiInCaricoSeScoperto(
  ctx: { venueId: string; timezone: string; waiterId: string },
  tableId: string,
  opts: { adesso?: Date; actor?: AuditActor } = {},
): Promise<void> {
  try {
    const adesso = opts.adesso ?? new Date();
    const giorno = dateKeyInVenue(adesso, ctx.timezone);
    const servizio = await servizioCorrente(ctx.venueId, ctx.timezone, adesso);
    const chiCopre = (await copertureDelServizio(ctx.venueId, giorno, servizio)).get(tableId) ?? [];
    if (chiCopre.length > 0) return;
    await prendiInCarico(ctx, tableId, opts);
  } catch (err) {
    console.error("[presa-in-carico] non ho potuto assegnare il tavolo", { tableId }, err);
  }
}
