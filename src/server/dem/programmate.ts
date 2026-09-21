import { db } from "@/lib/db";
import { brevoAdapter } from "@/server/marketing/brevo-adapter";
import type { EmailProviderAdapter } from "@/server/marketing/email-provider";
import { chiudiCampagnaProgrammata } from "@/server/campaigns";

/**
 * Le campagne programmate che nessuno chiudeva mai.
 *
 * ## Il difetto, per intero
 *
 * Programmare una campagna sul fornitore significa dirgli «mandala venerdì
 * alle nove» e fidarsi. Da noi la campagna restava `SCHEDULED` — «Programmata ·
 * Partirà all'ora indicata» — **per sempre**: venerdì alle nove le email
 * uscivano, e la schermata continuava a dire che dovevano ancora partire.
 *
 * Due danni, e il secondo costa soldi:
 *
 *  1. chi guarda non sa se è uscita. La domanda «è partita?» non aveva
 *     risposta in Tavolo, e l'unico modo di saperlo era entrare nel pannello
 *     del fornitore — cioè il posto da cui questo prodotto esiste per non far
 *     passare nessuno;
 *  2. `reservedCount` restava impegnato. Gli invii riservati per quella
 *     campagna non venivano né consumati né restituiti: sparivano dalla quota
 *     del mese senza comparire fra quelli usati. Un cliente che programma
 *     quattro campagne si trova il piano esaurito con «zero inviate».
 *
 * ## Perché si guardano le statistiche e non solo l'orologio
 *
 * Perché «l'ora è passata» non è «è partita». Il fornitore può averla
 * rifiutata, la lista può essere vuota, la chiave può essere scaduta: in tutti
 * questi casi l'orologio dice sì e non è uscita niente. Si chiede al fornitore
 * quanti ne ha mandati, e solo quel numero fa dichiarare inviata una campagna.
 *
 * ## E quando l'ora è passata da un pezzo e non è uscito niente
 *
 * Dopo qualche ora si dichiara **non riuscita**, si restituisce la quota e si
 * avvisa. È la parte che rende questo giro utile anche quando va male: una
 * campagna che non è partita e non lo dice a nessuno è peggio di una campagna
 * non riuscita, perché nessuno la rifà.
 */

/**
 * Quanto si aspetta prima di andare a guardare.
 *
 * Il fornitore non manda al secondo: mettersi a chiedere le statistiche
 * nell'istante esatto dell'appuntamento vorrebbe dire leggere zero e
 * dichiarare non riuscita una campagna che sta uscendo.
 */
const ATTESA_MINUTI = 10;

/** Dopo quanto una campagna che non ha mandato niente si dichiara non riuscita. */
const RESA_ORE = 6;

/** Quante se ne chiudono per giro: il cron ha un tetto di tempo anche lui. */
const PER_GIRO = 20;

export type EsitoProgrammate = {
  guardate: number;
  inviate: number;
  nonRiuscite: number;
};

export async function chiudiLeProgrammate(
  adesso: Date = new Date(),
  adapter: EmailProviderAdapter = brevoAdapter,
): Promise<EsitoProgrammate> {
  const scadute = await db.campaign.findMany({
    where: {
      status: "SCHEDULED",
      /* Solo quelle affidate a un fornitore: le campagne inviate da noi hanno
         il loro lavoro in coda con l'ora giusta, e si chiudono da sole. */
      providerId: { not: null },
      scheduledAt: { not: null, lte: new Date(adesso.getTime() - ATTESA_MINUTI * 60_000) },
    },
    orderBy: { scheduledAt: "asc" },
    take: PER_GIRO,
    select: { id: true, venueId: true, name: true, providerId: true, scheduledAt: true },
  });

  let inviate = 0;
  let nonRiuscite = 0;

  for (const c of scadute) {
    /* Una campagna che non si riesce a leggere non ferma le altre: sono di
       clienti diversi, e un fornitore che risponde male su una non è una
       ragione per lasciare le altre appese. */
    const stats = await adapter.getCampaignStats(c.providerId!).catch(() => null);

    if (stats && stats.sentCount > 0) {
      await chiudiCampagnaProgrammata(c.id, {
        inviati: stats.sentCount,
        aperti: stats.openedCount,
        /* La data d'invio è quella dell'appuntamento, non quella di adesso:
           l'invio è successo allora, e scrivere l'ora del cron farebbe
           sembrare partita alle 3 di notte una campagna uscita alle nove. */
        quando: c.scheduledAt!,
      });
      inviate += 1;
      continue;
    }

    const scadutaDa = adesso.getTime() - c.scheduledAt!.getTime();
    if (scadutaDa >= RESA_ORE * 3_600_000) {
      await chiudiCampagnaProgrammata(c.id, {
        nonRiuscita:
          `Era programmata per ${c.scheduledAt!.toLocaleString("it-IT")} e il fornitore ` +
          "non ne ha inviata nessuna. Gli invii impegnati sono tornati disponibili: " +
          "controlla il contenuto e i destinatari, poi riprogrammala.",
      });
      nonRiuscite += 1;
    }
  }

  return { guardate: scadute.length, inviate, nonRiuscite };
}
