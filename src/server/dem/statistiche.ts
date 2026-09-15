import { db } from "@/lib/db";
import { logAttenzione } from "@/lib/observability";
import { valutaReputazione, type EsitoReputazione } from "@/lib/dem-reputazione";
import { sospendiInvii } from "./abbonamento";
import { avvisa, avvisoInviiSospesi } from "./avvisi";

/**
 * I risultati di una campagna, calcolati dai fatti.
 *
 * Nessun numero di questo file è stimato o inventato: ogni valore viene da
 * righe scritte da un evento vero. Dove il dato non c'è — perché il fornitore
 * non lo manda, o perché la campagna è appena partita — si restituisce
 * l'assenza, e l'interfaccia dice che non c'è ancora invece di scrivere zero.
 *
 * La differenza conta: «0% di aperture» su una campagna partita due minuti fa
 * è una bocciatura inventata, e chi la legge ci crede perché ha la forma di una
 * misura.
 */

export type RisultatiCampagna = {
  inviate: number;
  consegnate: number;
  aperte: number;
  click: number;
  rimbalzi: number;
  disiscrizioni: number;
  segnalazioni: number;
  nonRiuscite: number;
  /** Le percentuali, o `null` quando la base non c'è ancora. */
  tassoConsegna: number | null;
  tassoApertura: number | null;
  tassoClick: number | null;
  tassoRimbalzo: number | null;
  tassoDisiscrizione: number | null;
  linkPiuCliccati: { url: string; click: number }[];
  /** La cronologia della campagna, per l'assistenza e per il cliente. */
  tappe: { etichetta: string; quando: Date }[];
};

function percentuale(parte: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round((parte / base) * 1000) / 10;
}

export async function risultatiCampagna(
  venueId: string,
  campaignId: string,
): Promise<RisultatiCampagna | null> {
  const campagna = await db.campaign.findFirst({ where: { id: campaignId, venueId } });
  if (!campagna) return null;

  /*
    I contatori della campagna e non un conteggio delle righe.

    Le righe dei destinatari si possono cancellare quando un cliente esercita
    il diritto all'oblio; i contatori no. Una campagna di marzo deve continuare
    a dire quante email erano partite anche se due di quelle persone non sono
    più nel database — altrimenti lo storico si riscrive da solo.
  */
  const inviate = campagna.sentCount;
  const consegnate = campagna.deliveredCount;

  const linkPiuCliccati = (
    await db.campaignEvent.groupBy({
      by: ["url"],
      where: { campaignId, type: "CLICK", url: { not: null } },
      _count: { url: true },
      orderBy: { _count: { url: "desc" } },
      take: 5,
    })
  ).map((r) => ({ url: r.url ?? "", click: r._count.url }));

  const tappe: { etichetta: string; quando: Date }[] = [
    { etichetta: "Creata", quando: campagna.createdAt },
    ...(campagna.scheduledAt ? [{ etichetta: "Programmata", quando: campagna.scheduledAt }] : []),
    ...(campagna.sendingStartedAt ? [{ etichetta: "Invio iniziato", quando: campagna.sendingStartedAt }] : []),
    ...(campagna.sentAt ? [{ etichetta: "Invio completato", quando: campagna.sentAt }] : []),
    ...(campagna.cancelledAt ? [{ etichetta: "Annullata", quando: campagna.cancelledAt }] : []),
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime());

  return {
    inviate,
    consegnate,
    aperte: campagna.openedCount,
    click: campagna.clickedCount,
    rimbalzi: campagna.bouncedCount,
    disiscrizioni: campagna.unsubscribedCount,
    segnalazioni: campagna.complainedCount,
    nonRiuscite: campagna.failedCount,
    tassoConsegna: percentuale(consegnate, inviate),
    // Aperture e click si misurano su **chi ha ricevuto**, non su chi ha
    // ricevuto il tentativo: dividere per gli invii abbassa il tasso di
    // qualcosa che non dipende dal contenuto.
    tassoApertura: percentuale(campagna.openedCount, consegnate),
    tassoClick: percentuale(campagna.clickedCount, consegnate),
    tassoRimbalzo: percentuale(campagna.bouncedCount, inviate),
    tassoDisiscrizione: percentuale(campagna.unsubscribedCount, consegnate),
    linkPiuCliccati,
    tappe,
  };
}

export type PanoramicaDem = {
  giorni: number;
  campagne: number;
  inviate: number;
  consegnate: number;
  aperte: number;
  click: number;
  rimbalzi: number;
  segnalazioni: number;
  disiscrizioni: number;
  tassoConsegna: number | null;
  tassoApertura: number | null;
  tassoClick: number | null;
  tassoRimbalzo: number | null;
  tassoDisiscrizione: number | null;
};

/**
 * Come sta andando il marketing di questo locale, negli ultimi giorni.
 *
 * Si somma sulle campagne **partite** nel periodo, e non sugli eventi arrivati
 * nel periodo: una campagna mandata il 29 riceve aperture per settimane, e
 * contare gli eventi invece delle campagne farebbe apparire e sparire i numeri
 * dal riquadro a seconda di quando lo si guarda.
 */
export async function panoramicaDem(venueId: string, giorni = 30): Promise<PanoramicaDem> {
  const da = new Date(Date.now() - giorni * 86_400_000);

  const somme = await db.campaign.aggregate({
    where: { venueId, sentAt: { gte: da } },
    _count: { id: true },
    _sum: {
      sentCount: true,
      deliveredCount: true,
      openedCount: true,
      clickedCount: true,
      bouncedCount: true,
      complainedCount: true,
      unsubscribedCount: true,
    },
  });

  const inviate = somme._sum.sentCount ?? 0;
  const consegnate = somme._sum.deliveredCount ?? 0;
  const aperte = somme._sum.openedCount ?? 0;
  const click = somme._sum.clickedCount ?? 0;
  const rimbalzi = somme._sum.bouncedCount ?? 0;
  const segnalazioni = somme._sum.complainedCount ?? 0;
  const disiscrizioni = somme._sum.unsubscribedCount ?? 0;

  return {
    giorni,
    campagne: somme._count.id,
    inviate,
    consegnate,
    aperte,
    click,
    rimbalzi,
    segnalazioni,
    disiscrizioni,
    tassoConsegna: percentuale(consegnate, inviate),
    tassoApertura: percentuale(aperte, consegnate),
    tassoClick: percentuale(click, consegnate),
    tassoRimbalzo: percentuale(rimbalzi, inviate),
    tassoDisiscrizione: percentuale(disiscrizioni, consegnate),
  };
}

/* -------------------------------------------------------------------------- */
/*  Reputazione                                                               */
/* -------------------------------------------------------------------------- */

/**
 * La reputazione di invio di un locale, dai dati veri.
 *
 * La finestra è di trenta giorni: più corta reagirebbe a una singola campagna
 * sfortunata, più lunga terrebbe in ostaggio per mesi chi ha già pulito la
 * lista.
 */
export async function reputazioneDi(venueId: string, giorni = 30): Promise<EsitoReputazione & {
  dominioPronto: boolean;
  inviate: number;
}> {
  const da = new Date(Date.now() - giorni * 86_400_000);

  const [somme, dominio, sub] = await Promise.all([
    db.campaign.aggregate({
      where: { venueId, sentAt: { gte: da } },
      _sum: { sentCount: true, bouncedCount: true, complainedCount: true },
    }),
    db.demDomain.findUnique({ where: { venueId }, select: { status: true } }),
    db.demSubscription.findUnique({ where: { venueId }, select: { sendingPausedAt: true } }),
  ]);

  const inviate = somme._sum.sentCount ?? 0;
  const dominioPronto = dominio?.status === "VERIFIED";

  const esito = valutaReputazione({
    inviate,
    rimbalzi: somme._sum.bouncedCount ?? 0,
    segnalazioni: somme._sum.complainedCount ?? 0,
    dominioPronto,
    sospesa: sub?.sendingPausedAt != null,
  });

  return { ...esito, dominioPronto, inviate };
}

/**
 * Controlla la reputazione e, se serve, ferma gli invii.
 *
 * La chiamano la coda dopo una campagna e il lavoro pianificato. Fermare è una
 * decisione grossa — un locale che non può più scrivere ai suoi clienti — e
 * per questo ha tre proprietà:
 *
 * - **non cancella niente**: campagne, contatti, modelli e statistiche restano;
 * - **lo dice al cliente** con una frase che non nomina nessuna sigla;
 * - **lo dice anche a noi**, perché una sospensione automatica che nessuno
 *   guarda diventa un cliente perso in silenzio.
 */
export async function controllaReputazione(venueId: string): Promise<EsitoReputazione> {
  const esito = await reputazioneDi(venueId);
  if (!esito.daFermare) return esito;

  const sub = await db.demSubscription.findUnique({
    where: { venueId },
    select: { sendingPausedAt: true },
  });
  if (sub?.sendingPausedAt) return esito;

  await sospendiInvii(venueId, "Troppe email non consegnate: invii fermati a tutela del dominio.");
  await avvisa(venueId, avvisoInviiSospesi(esito.messaggio));
  logAttenzione("dem.reputazione.invii_fermati", {
    venueId,
    rimbalzi: esito.tassoRimbalzi ?? 0,
    segnalazioni: esito.tassoSegnalazioni ?? 0,
  });

  return esito;
}
