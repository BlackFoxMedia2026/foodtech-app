import { eseguiCron } from "@/lib/cron";
import { db } from "@/lib/db";
import { controllaDominiInAttesa } from "@/server/dem/dominio";
import { chiudiLeProgrammate } from "@/server/dem/programmate";
import { controllaReputazione } from "@/server/dem/statistiche";

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

    return {
      programmateGuardate: programmate.guardate,
      programmateInviate: programmate.inviate,
      programmateNonRiuscite: programmate.nonRiuscite,
      dominiControllati: domini.controllati,
      dominiPronti: domini.diventatiPronti,
      localiValutati: attivi.length,
      inviiFermati: fermati,
    };
  });
}
