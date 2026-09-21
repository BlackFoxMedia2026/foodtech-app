import { eseguiCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { controllaDominiInAttesa } from "@/server/dem/dominio";
import { chiudiLeProgrammate } from "@/server/dem/programmate";
import { controllaReputazione } from "@/server/dem/statistiche";
import { ricalcolaPeriodo } from "@/server/costi/periodo";
import { generaAvvisi } from "@/server/costi/avvisi";
import { riconciliaCiclo } from "@/server/costi/riconciliazione";
import { cicloCorrente } from "@/server/costi/piattaforma-costi";

/**
 * Il giro del modulo DEM: i domini che aspettano e la reputazione di chi invia.
 *
 * Due lavori nello stesso cron perché hanno lo stesso ritmo — «ogni tanto, e
 * non importa il minuto esatto» — e perché un cron in più è un indirizzo in
 * più da proteggere e da guardare quando qualcosa non gira.
 *
 * Quello che **non** sta qui è il rinnovo dei cicli di consumo: si fa da solo
 * alla prima lettura del mese nuovo (vedi `rinnovaSeScaduto`). Un cron che
 * salta un giro non deve poter lasciare un cliente col contatore del mese
 * scorso.
 */
export async function GET(req: Request) {
  return eseguiCron("dem", req, async () => {
    const domini = await controllaDominiInAttesa();

    /*
      Le campagne programmate che il fornitore ha già mandato.

      Senza questo passaggio restavano «Programmata · Partirà all'ora
      indicata» per sempre — anche il giorno dopo — e gli invii impegnati non
      tornavano né fra quelli usati né fra quelli disponibili: un cliente che
      programma quattro campagne si trovava il piano esaurito con «zero
      inviate». Ogni venti minuti, perché nessuno guarda il minuto esatto.
    */
    const programmate = await chiudiLeProgrammate();

    /*
      La reputazione si guarda a chi ha inviato **di recente**: su chi non
      manda da settimane non c'è niente di nuovo da vedere, e scorrerli tutti
      ogni ora sarebbe una lettura di tutte le campagne di tutti i clienti per
      confermare che non è cambiato niente.
    */
    const da = new Date(Date.now() - 7 * 86_400_000);
    const attivi = await db.campaign.groupBy({
      by: ["venueId"],
      where: { sentAt: { gte: da } },
      _count: { id: true },
    });

    let fermati = 0;
    for (const { venueId } of attivi) {
      const esito = await controllaReputazione(venueId).catch(() => null);
      if (esito?.daFermare) fermati += 1;
    }

    /*
      I costi: ricalcolo dell'aggregato, avvisi mancanti, riconciliazione.

      Qui e non nel blocco pre-invio, che è **in tempo reale** e non aspetta
      nessun cron: là si decide se una campagna può partire, e venti minuti di
      ritardo sarebbero venti minuti senza freno. Questo giro riallinea
      l'aggregato con il ledger, ricalcola la previsione e si accorge delle
      soglie di chi non sta inviando in questo momento.

      Si guardano i clienti che hanno **consumato**, non tutti: su chi non ha
      mandato niente non c'è niente di nuovo da calcolare.
    */
    const conConsumi = await db.usageEvent.groupBy({
      by: ["venueId"],
      where: { occurredAt: { gte: new Date(Date.now() - 45 * 86_400_000) } },
      _count: { id: true },
    });

    let periodiRicalcolati = 0;
    let avvisiCreati = 0;
    for (const { venueId } of conConsumi) {
      const stato = await ricalcolaPeriodo(venueId).catch(() => null);
      if (!stato) continue;
      periodiRicalcolati += 1;
      const locale = await db.venue.findUnique({ where: { id: venueId }, select: { name: true } });
      avvisiCreati += await generaAvvisi(stato, locale?.name ?? "Locale").catch(() => 0);
    }

    /*
      La riconciliazione con la fattura di Amazon. Il freno sulle richieste a
      Cost Explorer sta dentro `riconciliaCiclo`, che non chiede il dato più di
      due volte al giorno: si paga a richiesta, e questo cron passa ogni venti
      minuti. Si guarda anche il ciclo precedente, perché la fattura di un mese
      si chiude giorni dopo la sua fine.
    */
    const riconciliazioni: string[] = [];
    for (const ciclo of [cicloCorrente(), cicloPrecedente()]) {
      const esito = await riconciliaCiclo(ciclo).catch(() => null);
      if (esito) riconciliazioni.push(`${ciclo}:${esito.stato}`);
    }

    return {
      programmateGuardate: programmate.guardate,
      programmateInviate: programmate.inviate,
      programmateNonRiuscite: programmate.nonRiuscite,
      dominiControllati: domini.controllati,
      dominiPronti: domini.diventatiPronti,
      localiValutati: attivi.length,
      inviiFermati: fermati,
      periodiRicalcolati,
      avvisiCreati,
      riconciliazioni,
    };
  });
}

/** Il ciclo del mese scorso, nel formato `2026-08`. */
function cicloPrecedente(adesso = new Date()): string {
  const d = new Date(Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
