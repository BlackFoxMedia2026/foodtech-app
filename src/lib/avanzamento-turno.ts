/**
 * **A che punto è il turno.**
 *
 * La domanda che un cameriere si fa guardando l'orologio a metà servizio è
 * una sola — «quanto manca?» — e fino a oggi la Home rispondeva con due
 * orari e il calcolo a carico di chi legge. Sono due sottrazioni in testa,
 * una delle quali passa la mezzanotte.
 *
 * ## I minuti, e la mezzanotte
 *
 * `WorkShift` tiene gli orari come **minuti da mezzanotte**, e 1440 significa
 * «mezzanotte di domani»: «17:00 → 02:00» si scrive 1020 → 1560. Il perché
 * sta in `lib/turni.ts`, e qui si eredita quella convenzione senza rifarla.
 *
 * Restano due casi da normalizzare, e sono quelli che di solito rompono
 * questo genere di conto:
 *
 * 1. **sono le 00:30 di un turno cominciato alle 17.** Il minuto corrente è
 *    30, l'inizio è 1020: senza correzione il turno risulterebbe «non ancora
 *    cominciato» per tutta la coda della serata, cioè proprio nelle ore in
 *    cui la barra serve. Si somma un giorno all'ora corrente;
 * 2. **una riga scritta senza la convenzione**, con `fine` minore di
 *    `inizio` (1020 → 120 invece di 1560). Non dovrebbe esistere, ma una
 *    durata negativa produrrebbe una percentuale negativa su uno schermo
 *    invece di un errore in un log: si somma un giorno alla fine.
 *
 * ## Perché è una funzione pura e non un componente
 *
 * Perché è l'unica parte di questa schermata che si può sbagliare in
 * silenzio, e l'unico modo di accorgersene sarebbe guardare una barra
 * storta alle due di notte.
 */

export type StatoAvanzamento = "prima" | "in-corso" | "finito";

export type AvanzamentoTurno = {
  stato: StatoAvanzamento;
  /** La quota di turno già passata, fra 0 e 1. Fuori dal turno è 0 o 1. */
  frazione: number;
  /** La stessa cosa in percentuale intera, per il testo. */
  percentuale: number;
  minutiTotali: number;
  minutiTrascorsi: number;
  /** Minuti alla fine se il turno è in corso, all'inizio se non è cominciato. */
  minutiRimanenti: number;
  /** «4h 12m rimanenti», «Comincia fra 35 min», «Turno concluso». */
  testo: string;
};

/** 252 → «4h 12m»; 60 → «1h»; 45 → «45 min». */
export function durataUmana(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  const ore = Math.floor(m / 60);
  const resto = m % 60;
  if (ore === 0) return `${resto} min`;
  if (resto === 0) return `${ore}h`;
  return `${ore}h ${resto}m`;
}

/**
 * L'avanzamento di un turno, dati i suoi estremi in minuti e l'ora corrente
 * **già espressa nel fuso del locale** (vedi `server/staff-app/turno.ts`:
 * l'ora del server è UTC e non c'entra niente con quella della sala).
 *
 * `null` quando il turno non ha orari — un riposo, un'assenza — perché di
 * quei giorni non c'è nessun avanzamento da mostrare e restituire uno zero
 * vorrebbe dire disegnare una barra vuota su una giornata libera.
 */
export function avanzamentoTurno(
  inizioMinuti: number | null,
  fineMinuti: number | null,
  oraMinuti: number,
): AvanzamentoTurno | null {
  if (inizioMinuti === null || fineMinuti === null) return null;

  const inizio = inizioMinuti;
  /* Caso 2: una riga senza la convenzione del giorno dopo. Solo se la fine è
     **minore** dell'inizio: uguale vuol dire durata zero, e un turno lungo
     zero non è un turno di ventiquattr'ore. */
  const fine = fineMinuti < inizio ? fineMinuti + 24 * 60 : fineMinuti;
  const totali = fine - inizio;
  if (totali <= 0) return null;

  /*
    Caso 1: siamo dopo la mezzanotte di un turno serale.

    Un minuto da mezzanotte, da solo, è ambiguo: per un turno 17:00 → 02:00 le
    02:30 sono sia «mezz'ora dopo la fine di ieri sera» sia «quattordici ore
    prima dell'inizio di stasera», e le due letture danno due schermate
    opposte. La regola è prendere **la più vicina al turno**: fra l'ora
    com'è e l'ora più un giorno vince quella che dista meno dall'intervallo.

    | ora | grezza | +1 giorno | vince |
    |---|---|---|---|
    | 00:30 | 990 min prima | dentro | dentro → in corso |
    | 02:30 | 870 min prima | 30 min dopo | dopo → concluso |
    | 16:00 | 60 min prima | 840 min dopo | prima → non cominciato |

    Un semplice «se l'ora è prima dell'inizio somma un giorno» dava «turno
    concluso» alle sedici del pomeriggio, un'ora prima di cominciare.
  */
  const distanza = (x: number) => (x < inizio ? inizio - x : x > fine ? x - fine : 0);
  const domani = oraMinuti + 24 * 60;
  const ora = distanza(domani) < distanza(oraMinuti) ? domani : oraMinuti;

  if (ora < inizio) {
    const manca = inizio - ora;
    return {
      stato: "prima",
      frazione: 0,
      percentuale: 0,
      minutiTotali: totali,
      minutiTrascorsi: 0,
      minutiRimanenti: manca,
      testo: `Comincia fra ${durataUmana(manca)}`,
    };
  }

  if (ora >= fine) {
    return {
      stato: "finito",
      frazione: 1,
      percentuale: 100,
      minutiTotali: totali,
      minutiTrascorsi: totali,
      minutiRimanenti: 0,
      testo: "Turno concluso",
    };
  }

  const trascorsi = ora - inizio;
  const frazione = trascorsi / totali;
  return {
    stato: "in-corso",
    frazione,
    percentuale: Math.round(frazione * 100),
    minutiTotali: totali,
    minutiTrascorsi: trascorsi,
    minutiRimanenti: fine - ora,
    testo: `${durataUmana(fine - ora)} rimanenti`,
  };
}
