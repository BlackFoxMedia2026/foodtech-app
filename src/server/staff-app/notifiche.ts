import type { NotificationKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * **Le notifiche che hanno un nome e un cognome.**
 *
 * `Notification` è sempre stata del locale: un avviso che chiunque passi dalla
 * campanella può leggere. Va bene per «è arrivata una prenotazione dal sito» —
 * chiunque può prenderla in carico. Non va bene per «i tuoi due piatti sono
 * pronti al passe»: quella frase riguarda una persona sola, e nella campanella
 * di tutti è rumore per quattro su cinque.
 *
 * Da qui la colonna `waiterId`, nulla su tutto lo storico e su tutti gli avvisi
 * del locale. Le due strade non si incrociano: la campanella del back office
 * filtra `waiterId: null` (vedi `server/notifications.ts`), questo modulo
 * filtra sul destinatario.
 *
 * ## Le push, e perché non ci sono
 *
 * §40 chiede di **preparare** l'architettura, non di implementarle. Una push
 * vera richiede un service worker, le chiavi VAPID, il permesso del browser e
 * un registro di iscrizioni — cioè quattro cose che, mezze fatte, producono
 * notifiche che non arrivano e nessuno se ne accorge.
 *
 * Quello che serve averci pensato adesso è **dove nasce l'evento**, e quello
 * c'è: ogni notifica personale passa da `avvisa()`. Il giorno in cui ci
 * saranno le chiavi, l'invio push è tre righe dentro quella funzione, e
 * nessuno dei chiamanti cambia.
 */

type Avviso = {
  waiterId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  meta?: Prisma.InputJsonValue;
};

/**
 * Scrive una notifica personale.
 *
 * **Non può far fallire l'operazione che l'ha generata.** Stessa regola del
 * registro di audit, e per lo stesso motivo: una comanda che non parte perché
 * non si è potuto scrivere un avviso è un guasto molto peggiore dell'avviso
 * mancante. L'errore finisce nei log del server, dove serve a noi.
 */
export async function avvisa(venueId: string, avviso: Avviso): Promise<void> {
  try {
    await db.notification.create({
      data: {
        id: crypto.randomUUID(),
        venueId,
        waiterId: avviso.waiterId,
        kind: avviso.kind,
        title: avviso.title.slice(0, 160),
        body: avviso.body?.slice(0, 500),
        link: avviso.link?.slice(0, 300),
        meta: avviso.meta,
      },
    });
    /* Qui, un giorno: se questa persona ha un'iscrizione push attiva, spedirla.
       Niente di finto nel frattempo — vedi il commento in testa al file. */
  } catch (err) {
    console.error("[notifiche-staff] non ho potuto avvisare", { waiterId: avviso.waiterId }, err);
  }
}

export type NotificaStaff = {
  id: string;
  kind: NotificationKind;
  titolo: string;
  corpo: string | null;
  link: string | null;
  quando: string;
  letta: boolean;
};

export async function notificheDi(
  venueId: string,
  waiterId: string,
  opts: { limite?: number } = {},
): Promise<NotificaStaff[]> {
  const righe = await db.notification.findMany({
    where: { venueId, waiterId },
    orderBy: { createdAt: "desc" },
    take: Math.min(opts.limite ?? 30, 100),
  });
  return righe.map((n) => ({
    id: n.id,
    kind: n.kind,
    titolo: n.title,
    corpo: n.body,
    link: n.link,
    quando: n.createdAt.toISOString(),
    letta: !!n.readAt,
  }));
}

export async function daLeggere(venueId: string, waiterId: string): Promise<number> {
  return db.notification.count({ where: { venueId, waiterId, readAt: null } });
}

export async function segnaLetta(venueId: string, waiterId: string, id: string): Promise<void> {
  /* Il `waiterId` nella `where` non è ridondante: senza, chiunque conosca un
     identificativo potrebbe segnare letta la notifica di un collega. */
  await db.notification.updateMany({
    where: { id, venueId, waiterId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function segnaTutteLette(venueId: string, waiterId: string): Promise<void> {
  await db.notification.updateMany({
    where: { venueId, waiterId, readAt: null },
    data: { readAt: new Date() },
  });
}

/* -------------------------------------------------------------------------- */
/*  Gli eventi del servizio                                                   */
/* -------------------------------------------------------------------------- */

/**
 * «Tavolo 12 — 2 piatti pronti».
 *
 * La notifica del §20, quella che fa alzare qualcuno. Il titolo porta il
 * tavolo perché è la prima cosa che serve sapere; i piatti stanno nel corpo,
 * con i nomi, perché il runner deve poter caricare il vassoio giusto senza
 * aprire niente.
 */
export async function avvisaPiattiPronti(
  venueId: string,
  opts: {
    waiterId: string | null;
    tavolo: string | null;
    tableId: string | null;
    piatti: { nome: string; quantita: number }[];
    comandaId: string;
  },
): Promise<void> {
  if (!opts.waiterId || opts.piatti.length === 0) return;

  const pezzi = opts.piatti.reduce((s, p) => s + p.quantita, 0);
  await avvisa(venueId, {
    waiterId: opts.waiterId,
    kind: "COMANDA_PRONTA",
    title: `${opts.tavolo ? `Tavolo ${opts.tavolo}` : "Comanda"} — ${pezzi === 1 ? "1 piatto pronto" : `${pezzi} piatti pronti`}`,
    body: opts.piatti
      .map((p) => (p.quantita > 1 ? `${p.quantita} × ${p.nome}` : p.nome))
      .join(", "),
    link: opts.tableId ? `/staff-app/tavolo/${opts.tableId}` : "/staff-app/comande",
    meta: { comandaId: opts.comandaId },
  });
}

/** «La cucina ha preso in carico la comanda 2 del tavolo 12». */
export async function avvisaPresaInCarico(
  venueId: string,
  opts: { waiterId: string | null; tavolo: string | null; tableId: string | null; numero: number },
): Promise<void> {
  if (!opts.waiterId) return;
  await avvisa(venueId, {
    waiterId: opts.waiterId,
    kind: "COMANDA_PRESA_IN_CARICO",
    title: `${opts.tavolo ? `Tavolo ${opts.tavolo}` : "Comanda"} — la cucina ha preso la comanda ${opts.numero}`,
    link: opts.tableId ? `/staff-app/tavolo/${opts.tableId}` : "/staff-app/comande",
  });
}

/**
 * «Comanda 2 del tavolo 12 modificata dopo l'invio».
 *
 * Va a chi ha la comanda in carico ed è la metà visibile del §24: l'altra metà
 * è la conferma esplicita che la sala deve dare prima di toccare una comanda
 * già in cucina. Finché la postazione di cucina non esiste, questo avviso
 * serve soprattutto a lasciare traccia dove qualcuno la legge.
 */
export async function avvisaModificaComanda(
  venueId: string,
  opts: {
    waiterId: string | null;
    tavolo: string | null;
    tableId: string | null;
    numero: number;
    cosa: string;
  },
): Promise<void> {
  if (!opts.waiterId) return;
  await avvisa(venueId, {
    waiterId: opts.waiterId,
    kind: "COMANDA_MODIFICATA",
    title: `${opts.tavolo ? `Tavolo ${opts.tavolo}` : "Comanda"} — comanda ${opts.numero} modificata dopo l'invio`,
    body: opts.cosa,
    link: opts.tableId ? `/staff-app/tavolo/${opts.tableId}` : "/staff-app/comande",
  });
}
