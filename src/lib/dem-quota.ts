/**
 * La quota di invii DEM: i conti, senza database.
 *
 * Stanno qui e non dentro il modulo server per la stessa ragione per cui
 * `abilities.ts` sta fuori da `tenant.ts`: decidere se una campagna ci sta nel
 * piano è una regola, e una regola si verifica con un test che non ha bisogno
 * né di Postgres né di una richiesta HTTP. Il modulo server legge le righe e
 * chiama queste funzioni; le pagine chiamano queste funzioni per mostrare gli
 * stessi numeri, così non ci sono due aritmetiche della stessa cosa.
 */

/** Quanto vale un invio: **un destinatario**, non una campagna. */
export type StatoQuota = {
  /** Il tetto del ciclo: quello del piano, o quello concordato col cliente. */
  limite: number;
  /** Invii già entrati nel processo di invio. */
  usati: number;
  /** Invii impegnati da campagne programmate o a metà, non ancora partiti. */
  riservati: number;
};

/**
 * Quanti invii restano davvero.
 *
 * I riservati si sottraggono come gli usati, e non è una prudenza eccessiva: è
 * l'unica definizione che impedisce di promettere due volte gli stessi invii a
 * due campagne programmate lo stesso pomeriggio.
 *
 * Mai sotto zero. Può capitare di superare il tetto — una campagna parte con
 * la quota giusta e il piano scende al rinnovo successivo — e «−2.300
 * disponibili» non è un'informazione: è un numero che spaventa e non si sa
 * cosa farci.
 */
export function disponibili(stato: StatoQuota): number {
  return Math.max(0, stato.limite - stato.usati - stato.riservati);
}

/**
 * La percentuale consumata, per la barra.
 *
 * Con limite zero non è «zero per cento»: non c'è niente da consumare, e la
 * barra va disegnata piena — altrimenti un cliente senza piano vede una barra
 * vuota e legge «hai tutto lo spazio del mondo».
 */
export function percentualeUsata(stato: StatoQuota): number {
  if (stato.limite <= 0) return 100;
  return Math.min(100, Math.round((stato.usati / stato.limite) * 100));
}

export type EsitoQuota =
  | { sufficiente: true; disponibili: number }
  | { sufficiente: false; disponibili: number; richiesti: number; mancanti: number };

/**
 * Questa campagna ci sta?
 *
 * La risposta è sì o no per **tutta** la campagna. Non esiste il caso «ne
 * mando 2.430 e gli altri chissà»: un segmento tagliato a metà da un contatore
 * manda una promozione a una parte dei clienti scelta dal caso, e chi resta
 * fuori non lo sa nessuno, nemmeno chi ha premuto il pulsante.
 */
export function verificaQuota(stato: StatoQuota, richiesti: number): EsitoQuota {
  const liberi = disponibili(stato);
  if (richiesti <= liberi) return { sufficiente: true, disponibili: liberi };
  return { sufficiente: false, disponibili: liberi, richiesti, mancanti: richiesti - liberi };
}

/**
 * Le tre soglie che meritano un avviso, e nient'altro.
 *
 * A 80 c'è ancora tempo per decidere, a 95 no, a 100 è successo. Una soglia
 * ogni dieci per cento sarebbe una notifica ogni due campagne, cioè rumore che
 * si impara a ignorare proprio prima di quella che conta.
 */
export const SOGLIE_AVVISO = [80, 95, 100] as const;

/**
 * Quale soglia si è appena superata, se se n'è superata una mai comunicata.
 *
 * Restituisce **la più alta** fra quelle nuove: chi passa dal 70% al 100% con
 * una sola campagna deve ricevere «hai finito», non tre notifiche in fila di
 * cui le prime due sono già vecchie quando le legge.
 */
export function sogliaDaAvvisare(percentuale: number, giaAvvisate: readonly number[]): number | null {
  const nuove = SOGLIE_AVVISO.filter((s) => percentuale >= s && !giaAvvisate.includes(s));
  return nuove.length > 0 ? Math.max(...nuove) : null;
}

/**
 * Il ciclo a cui appartiene una data: `2026-09`.
 *
 * Deriva dall'**inizio del periodo** e non da «adesso»: un ciclo che parte il
 * 28 settembre e finisce il 28 ottobre è settembre per tutta la sua durata, e
 * chiamarlo ottobre a metà strada spezzerebbe lo storico in due righe per lo
 * stesso mese pagato.
 */
export function cicloDi(inizio: Date): string {
  const anno = inizio.getUTCFullYear();
  const mese = String(inizio.getUTCMonth() + 1).padStart(2, "0");
  return `${anno}-${mese}`;
}

const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** «settembre 2026», per lo storico dei consumi. */
export function nomeCiclo(yearMonth: string): string {
  const [anno, mese] = yearMonth.split("-");
  const indice = Number(mese) - 1;
  return MESI[indice] ? `${MESI[indice]} ${anno}` : yearMonth;
}

/**
 * Il ciclo successivo, calcolato sul calendario e non sommando trenta giorni.
 *
 * Trenta giorni dal 31 gennaio è il 2 marzo: il mese di febbraio sparirebbe
 * dallo storico, e un cliente pagherebbe un ciclo che non compare da nessuna
 * parte.
 */
export function prossimoCiclo(inizio: Date): Date {
  const d = new Date(inizio);
  const giorno = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + 1);
  // Il 31 marzo + un mese in JS diventa il 1° maggio: si riporta a fine mese.
  if (d.getUTCDate() !== giorno) d.setUTCDate(0);
  return d;
}
