import { eseguiCron } from "@/lib/cron";
import { pulisciLavoriVecchi, runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/handlers";
import { scadiPagamentiVecchi } from "@/server/pagamenti-tavolo";
import { chiudiChiamateAppese } from "@/server/chiamate";
import { notificaChiamatePerse } from "@/server/voice/recupero";
import { spazzataIntegrazioni } from "@/server/integrations/sync";

/**
 * Smaltisce la coda. Chiamata da Vercel Cron ogni minuto (vedi vercel.json).
 *
 * Il budget di tempo è più basso del limite della funzione: si smette di
 * prendere lavori nuovi prima di essere interrotti, e quelli rimasti li
 * prende il minuto dopo. Meglio una coda un po' più lenta di un lavoro
 * troncato a metà.
 *
 * Come gli altri cron, **si rifiuta di partire** senza CRON_SECRET invece di
 * restare un endpoint pubblico che chiunque trovi l'URL può innescare.
 */
export async function GET(req: Request) {
  return eseguiCron("jobs", req, async () => {
    const esito = await runDueJobs({ handlers: JOB_HANDLERS });

    /**
     * La pulizia va **dopo** il lavoro, non prima: se il budget di tempo
     * finisce, si preferisce aver consegnato i messaggi e non aver ripulito
     * la storia. E i lavori non riusciti non si toccano mai.
     */
    const storiaRipulita = await pulisciLavoriVecchi();

    /**
     * I tentativi di pagamento al tavolo lasciati a metà.
     *
     * Non serve alla correttezza — un impegno scaduto smette di contare nel
     * residuo già in lettura, quindi nessun tavolo resta bloccato aspettando
     * questo giro. Serve a non lasciare in tabella righe «in corso» eterne
     * che a fine mese sembrano incassi rimasti appesi.
     */
    const pagamentiScaduti = await scadiPagamentiVecchi();

    /**
     * Le chiamate che il centralino non ha mai chiuso.
     *
     * `chiudiChiamateAppese` esisteva da tre fasi e **non la chiamava
     * nessuno**: una funzione scritta, provata, e mai eseguita. Le righe
     * rimaste `RINGING` per una rete che è saltata a metà chiamata restavano
     * così per sempre — invisibili sullo schermo grazie al limite dei novanta
     * secondi, ma dentro i conti di fine mese come telefonate in corso.
     */
    const chiamateAppese = await chiudiChiamateAppese();

    /**
     * Le chiamate perse che nessuno ha ancora guardato.
     *
     * Sta qui e non in un cron suo: è una spazzata da qualche millisecondo sui
     * locali che hanno il telefono, e un indirizzo in più da proteggere con un
     * segreto in più è una superficie in più. Il giro al minuto è anche la
     * cadenza giusta — la grazia è di dieci minuti, e chi apre alle sei di
     * sera trova la campanella già piena di quello che è successo alle
     * quattro.
     */
    const chiamatePerse = await notificaChiamatePerse();

    /**
     * Le integrazioni: i lucchetti di sincronizzazione rimasti chiusi da un
     * processo morto, e le sincronizzazioni programmate dovute. Solo
     * **accodate**: il lavoro vero lo fa questa stessa coda al giro dopo,
     * dentro il suo budget di tempo.
     */
    const integrazioni = await spazzataIntegrazioni();

    return {
      integrazioni,
      storiaRipulita,
      pagamentiScaduti,
      chiamateAppese,
      chiamatePerse: chiamatePerse.notificate,
      presiInCarico: esito.claimed,
      conclusi: esito.done,
      rimandati: esito.requeued,
      daRiprovare: esito.retried,
      nonRiusciti: esito.failed,
      ripresiDopoInterruzione: esito.recovered,
      tempoEsaurito: esito.budgetExhausted,
      rinviatiPerQuota: esito.rinviatiPerQuota,
    };
  });
}
