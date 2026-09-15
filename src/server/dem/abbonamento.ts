import { Prisma, type DemPlan, type DemSubscription } from "@prisma/client";
import { db } from "@/lib/db";
import { prossimoCiclo } from "@/lib/dem-quota";
import { pianoIncluso } from "./piani";

/**
 * Il piano DEM di un locale.
 *
 * ## Perché la verità sta qui e non su Stripe
 *
 * Stripe sa se una carta ha pagato. Non sa cosa abbiamo venduto, non conosce
 * le quote personalizzate concordate a voce con un cliente grande, e soprattutto
 * **può non rispondere**: un webhook che arriva in ritardo o non arriva non
 * deve poter spegnere il marketing di un ristorante che ha pagato. Quindi il
 * piano valido, il limite e il ciclo stanno in `DemSubscription`, e Stripe è
 * il mezzo con cui quell'abbonamento si incassa.
 *
 * ## Perché ogni locale ne ha uno anche senza pagare
 *
 * Il piano compreso è un piano: ha un limite (500), un ciclo e uno storico. Se
 * esistesse solo per chi paga, metà del codice dovrebbe chiedersi ogni volta
 * «e se non ce l'ha?», e la risposta sarebbe diversa in ogni punto.
 */

export type AbbonamentoConPiano = DemSubscription & {
  plan: DemPlan;
  scheduledPlan: DemPlan | null;
};

/** L'inizio del mese corrente, in UTC. Il ciclo del piano compreso parte di lì. */
function inizioMeseCorrente(adesso: Date): Date {
  return new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), 1));
}

/**
 * L'abbonamento del locale, creandolo al piano compreso se non c'è.
 *
 * Fa anche il passaggio di ciclo: vedi `rinnovaSeScaduto`. Si fa qui e non solo
 * in un lavoro pianificato perché un cron che salta un giro non deve poter
 * lasciare un cliente con il contatore del mese scorso — e perché così il
 * rinnovo funziona anche in locale, dove nessun cron gira.
 */
export async function abbonamentoDi(venueId: string, adesso = new Date()): Promise<AbbonamentoConPiano> {
  const esistente = await db.demSubscription.findUnique({
    where: { venueId },
    include: { plan: true, scheduledPlan: true },
  });
  if (esistente) return rinnovaSeScaduto(esistente, adesso);

  const piano = await pianoIncluso();
  const inizio = inizioMeseCorrente(adesso);

  try {
    /*
      `upsert` e non `create`, e la differenza si vede solo sotto carico.

      Due richieste del locale arrivate insieme la prima volta — apre la pagina
      e il wizard chiede la quota nello stesso istante — provano entrambe a
      creare l'abbonamento. Con `create` la seconda riceve un errore di
      vincolo: gestibile (sta qui sotto), ma è comunque un errore scritto nei
      log per una cosa che non è andata storta. `upsert` su una chiave unica
      diventa un `insert ... on conflict`, cioè una scrittura sola che non
      fallisce: la seconda richiesta trova la riga dell'altra e va avanti.

      Il `catch` resta lo stesso, perché la garanzia deve venire dal database e
      non dal fatto che oggi il client traduce l'operazione in quel modo.
    */
    return await db.demSubscription.upsert({
      where: { venueId },
      create: {
        venueId,
        planId: piano.id,
        currentPeriodStart: inizio,
        currentPeriodEnd: prossimoCiclo(inizio),
      },
      update: {},
      include: { plan: true, scheduledPlan: true },
    });
  } catch (err) {
    // La rete di sicurezza: se il vincolo scatta lo stesso, la riga c'è —
    // l'ha scritta l'altra richiesta — e rileggerla è la risposta giusta.
    // Arrivare secondi non è un errore. È lo stesso ragionamento di
    // `claimJob` nella coda.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const creatoDaAltri = await db.demSubscription.findUnique({
        where: { venueId },
        include: { plan: true, scheduledPlan: true },
      });
      if (creatoDaAltri) return rinnovaSeScaduto(creatoDaAltri, adesso);
    }
    throw err;
  }
}

/**
 * Porta avanti il ciclo quando è scaduto, e applica il piano programmato.
 *
 * Il ciclo si sposta **di mese in mese**, non a un periodo di trenta giorni:
 * un abbonamento lasciato fermo tre mesi deve arrivare al mese giusto passando
 * per i due in mezzo, così lo storico non ha buchi.
 *
 * È qui che entra in vigore un downgrade (§10): fino a questo istante il
 * cliente aveva il piano che ha pagato.
 */
export async function rinnovaSeScaduto(
  sub: AbbonamentoConPiano,
  adesso = new Date(),
): Promise<AbbonamentoConPiano> {
  if (adesso < sub.currentPeriodEnd) return sub;

  let inizio = sub.currentPeriodEnd;
  let fine = prossimoCiclo(inizio);
  // Un abbonamento dimenticato per mesi: si arriva al ciclo che contiene oggi.
  while (adesso >= fine) {
    inizio = fine;
    fine = prossimoCiclo(inizio);
  }

  const cambio = sub.scheduledPlanId && (!sub.scheduledChangeAt || sub.scheduledChangeAt <= adesso);

  return db.demSubscription.update({
    where: { id: sub.id },
    data: {
      currentPeriodStart: inizio,
      currentPeriodEnd: fine,
      ...(cambio && {
        planId: sub.scheduledPlanId!,
        scheduledPlanId: null,
        scheduledChangeAt: null,
      }),
    },
    include: { plan: true, scheduledPlan: true },
  });
}

/**
 * Il tetto di invii che vale per questo cliente.
 *
 * La quota concordata vince sul piano (§34): un cliente a cui sono stati
 * promessi 150.000 su un Business da 100.000 li ha, e la promessa sta in una
 * colonna invece che in una nota su un foglio.
 */
export function limiteDi(sub: { customMonthlyLimit: number | null; plan: { monthlyEmails: number } }): number {
  return sub.customMonthlyLimit ?? sub.plan.monthlyEmails;
}

/** Gli invii sono fermi? Vero sia per una sospensione nostra sia del fornitore. */
export function inviiSospesi(sub: Pick<DemSubscription, "sendingPausedAt">): boolean {
  return sub.sendingPausedAt !== null;
}

/**
 * Ferma gli invii di un locale, senza cancellare niente.
 *
 * Campagne, contatti, modelli e statistiche restano: sospendere vuol dire che
 * non esce posta, non che si perde il lavoro fatto.
 */
export async function sospendiInvii(venueId: string, motivo: string): Promise<void> {
  await db.demSubscription.updateMany({
    where: { venueId, sendingPausedAt: null },
    data: { sendingPausedAt: new Date(), sendingPausedReason: motivo.slice(0, 200) },
  });
}

export async function riattivaInvii(venueId: string): Promise<void> {
  await db.demSubscription.updateMany({
    where: { venueId },
    data: { sendingPausedAt: null, sendingPausedReason: null },
  });
}
