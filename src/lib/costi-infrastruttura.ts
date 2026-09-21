/**
 * I conti dei costi di infrastruttura, senza database.
 *
 * Stessa scelta di `dem-quota.ts`: decidere se un cliente sta sforando è una
 * **regola**, e una regola si prova con un test che non ha bisogno né di
 * Postgres né di una chiamata ad Amazon. Il modulo server legge le righe e
 * chiama queste funzioni; le pagine chiamano queste funzioni per mostrare gli
 * stessi numeri, così non esistono due aritmetiche della stessa cosa.
 *
 * Tutti gli importi sono in **centesimi interi**. I decimali in virgola mobile
 * su un conto economico producono 28,429999999999996 e differenze che nessuno
 * sa spiegare quando si sommano diecimila righe.
 */

export type StatoCosto = "NORMALE" | "ATTENZIONE" | "CRITICO" | "LIMITE";

export const ETICHETTA_STATO: Record<StatoCosto, string> = {
  NORMALE: "Nessuna criticità",
  ATTENZIONE: "Attenzione",
  CRITICO: "Vicino al limite",
  LIMITE: "Budget raggiunto",
};

export type Soglie = {
  /** In percentuale del budget: 75, 90, 100. */
  warningPct: number;
  criticalPct: number;
  hardLimitPct: number;
};

export const SOGLIE_PREDEFINITE: Soglie = { warningPct: 75, criticalPct: 90, hardLimitPct: 100 };

/**
 * A che punto è il budget di questo cliente.
 *
 * Senza budget lo stato è `NORMALE` e la percentuale è nulla, **non zero**:
 * zero per cento dice «non ha speso niente», che è falso. Un cliente senza
 * tetto configurato non è un cliente tranquillo, è un cliente che non stiamo
 * misurando — e le due cose non devono somigliarsi in una tabella.
 */
export function statoDelBudget(
  spesoCents: number,
  budgetCents: number | null,
  soglie: Soglie = SOGLIE_PREDEFINITE,
): { stato: StatoCosto; percentuale: number | null; residuoCents: number | null } {
  if (budgetCents === null || budgetCents <= 0) {
    return { stato: "NORMALE", percentuale: null, residuoCents: null };
  }

  const percentuale = Math.round((spesoCents / budgetCents) * 1000) / 10;
  const residuoCents = budgetCents - spesoCents;

  let stato: StatoCosto = "NORMALE";
  if (percentuale >= soglie.hardLimitPct) stato = "LIMITE";
  else if (percentuale >= soglie.criticalPct) stato = "CRITICO";
  else if (percentuale >= soglie.warningPct) stato = "ATTENZIONE";

  return { stato, percentuale, residuoCents };
}

export type DatiPrevisione = {
  spesoCents: number;
  /** Giorni già trascorsi del ciclo, **compreso** oggi: il primo giorno è 1. */
  giorniTrascorsi: number;
  giorniNelCiclo: number;
  /**
   * La spesa degli ultimi giorni, dal più recente. Facoltativa.
   *
   * Serve a non farsi ingannare dalla media: un cliente che ha speso tutto in
   * una campagna il 2 del mese e poi più niente, con la sola media risulta in
   * corsa verso lo sfondamento per tutto il mese. Quando c'è, il ritmo recente
   * pesa di più — ma non da solo, altrimenti una settimana di silenzio
   * prevederebbe zero per un cliente che manda una campagna al mese.
   */
  ultimiGiorniCents?: number[];
};

/**
 * Quanto avrà speso a fine ciclo, al ritmo di adesso.
 *
 * Due ritmi mediati, non uno: quello del ciclo intero e quello degli ultimi
 * giorni, con peso uguale. È la via di mezzo fra una media che non si accorge
 * di un'accelerazione e un ritmo recente che scambia una campagna singola per
 * un'abitudine.
 *
 * Al primo giorno di un ciclo la previsione è quasi sempre sbagliata, e questo
 * è dichiarato in `attendibile`: chi disegna la pagina decide se mostrarla o
 * scrivere «troppo presto per dirlo», invece di stampare un numero inventato
 * con la stessa autorevolezza degli altri.
 */
export function previsioneFineCiclo(dati: DatiPrevisione): {
  previsioneCents: number;
  attendibile: boolean;
} {
  const giorni = Math.max(1, dati.giorniTrascorsi);
  const totali = Math.max(giorni, dati.giorniNelCiclo);

  const ritmoMedio = dati.spesoCents / giorni;

  const recenti = dati.ultimiGiorniCents?.filter((n) => Number.isFinite(n)) ?? [];
  const ritmoRecente =
    recenti.length > 0 ? recenti.reduce((a, b) => a + b, 0) / recenti.length : ritmoMedio;

  const ritmo = (ritmoMedio + ritmoRecente) / 2;
  const mancanti = totali - giorni;

  return {
    previsioneCents: Math.round(dati.spesoCents + ritmo * mancanti),
    /* Sotto i tre giorni un solo invio grosso sposta la previsione del doppio:
       il numero esiste, ma non merita di essere trattato come una notizia. */
    attendibile: giorni >= 3,
  };
}

export type MotivoBlocco = "EMAIL_LIMIT_EXCEEDED" | "BUDGET_LIMIT_EXCEEDED" | "COST_CALCULATION_UNAVAILABLE";

export type EsitoPreInvio =
  | { consentito: true }
  | {
      consentito: false;
      motivo: MotivoBlocco;
      /** Il messaggio per chi sta guardando il pannello, già in italiano. */
      messaggio: string;
      /** Quanto si sforerebbe: invii o centesimi, secondo il motivo. Zero quando il conto non si è potuto fare. */
      eccedenza: number;
    };

/**
 * Questa campagna si può far partire?
 *
 * Il controllo sta **prima** dell'accodamento e non dentro il ciclo di invio:
 * far partire diecimila email e poi fermarsi significa aver già speso per
 * diecimila email, e aver spedito a una parte dei destinatari scelta dal caso.
 *
 * ## I tre motivi sono distinti, e non è pedanteria
 *
 * «Supera il piano» si risolve vendendo un piano più grande; «supera il
 * budget» si risolve con un'autorizzazione nostra o alzando il tetto; «non so
 * calcolare il costo» è un guasto nostro, e il cliente non c'entra niente. Un
 * unico errore generico li farebbe finire tutti nella stessa risposta, e nel
 * terzo caso staremmo dando la colpa a un ristorante per un listino che
 * abbiamo dimenticato di configurare.
 *
 * ## Il riservato conta come lo speso
 *
 * `impegnatoCents` sono i soldi già promessi ad altre campagne programmate.
 * Senza, due campagne preparate lo stesso pomeriggio passano entrambe il
 * controllo e insieme sfondano il budget — è la stessa scena che i `reserved`
 * degli invii evitano da sempre.
 *
 * ## La previsione non blocca
 *
 * Qui dentro non compare, di proposito. Una previsione è un'ipotesi sul
 * futuro, e fermare una campagna vera per un'ipotesi significa impedire a un
 * ristorante di lavorare per un calcolo statistico. La previsione avvisa; a
 * fermare è solo il conto di quello che è già successo più quello che sta per
 * succedere.
 */
export function verificaPreInvio(input: {
  invii: { usati: number; riservati: number; limite: number };
  costo: {
    spesoCents: number;
    impegnatoCents: number;
    budgetCents: number | null;
    /** Falso quando manca il listino o il cambio: il costo non si sa calcolare. */
    calcolabile: boolean;
  };
  destinatari: number;
  /** Il costo stimato della campagna, in centesimi. */
  costoStimatoCents: number;
  allowOverage: boolean;
  soglie?: Soglie;
}): EsitoPreInvio {
  const { invii, costo, destinatari, costoStimatoCents, allowOverage } = input;

  if (allowOverage) return { consentito: true };

  const disponibili = Math.max(0, invii.limite - invii.usati - invii.riservati);
  if (destinatari > disponibili) {
    return {
      consentito: false,
      motivo: "EMAIL_LIMIT_EXCEEDED",
      messaggio: "Questa campagna supera il limite mensile previsto dal piano.",
      eccedenza: destinatari - disponibili,
    };
  }

  const haBudget = costo.budgetCents !== null && costo.budgetCents > 0;
  if (!haBudget) return { consentito: true };

  /*
    Il guasto non deve spegnere il freno.

    Se il listino manca o il cambio non c'è, il costo di questa campagna
    risulterebbe zero — e zero passa qualunque controllo. Un errore
    infrastrutturale diventerebbe così il modo più silenzioso di disattivare la
    protezione dei costi, proprio nel momento in cui non sappiamo cosa sta
    succedendo. Si blocca, e il Super Admin autorizza a mano se serve.
  */
  if (!costo.calcolabile) {
    return {
      consentito: false,
      motivo: "COST_CALCULATION_UNAVAILABLE",
      messaggio:
        "Non riusciamo a calcolare il costo di infrastruttura di questo invio: manca il listino o il cambio. L'invio resta fermo finché non è configurato, oppure va autorizzato a mano.",
      eccedenza: 0,
    };
  }

  const soglie = input.soglie ?? SOGLIE_PREDEFINITE;
  const tetto = Math.round((costo.budgetCents! * soglie.hardLimitPct) / 100);
  const totalePrevisto = costo.spesoCents + costo.impegnatoCents + costoStimatoCents;
  if (totalePrevisto > tetto) {
    return {
      consentito: false,
      motivo: "BUDGET_LIMIT_EXCEEDED",
      messaggio:
        "L'invio porterebbe il costo di infrastruttura stimato oltre il budget configurato per questo cliente.",
      eccedenza: totalePrevisto - tetto,
    };
  }

  return { consentito: true };
}

/**
 * Da quantità e prezzo unitario al costo, nell'unità del listino.
 *
 * `EMAIL_1000` significa che il prezzo è per mille: dividere è il mestiere di
 * questa funzione e non di chi la chiama, perché è esattamente il punto in cui
 * un fattore mille salta e il costo del mese diventa mille volte tanto.
 *
 * Il ritorno è in **unità di valuta** (dollari, euro), non in centesimi: i
 * prezzi unitari hanno sei decimali e arrotondare qui, riga per riga,
 * produrrebbe un totale diverso da quello vero. Si arrotonda alla fine.
 */
export function costoDiUnListino(quantita: number, prezzoUnitario: number, unita: string): number {
  if (quantita <= 0) return 0;
  const perMille = unita.endsWith("_1000");
  return perMille ? (quantita / 1000) * prezzoUnitario : quantita * prezzoUnitario;
}

/**
 * Da valuta del fornitore a valuta nostra.
 *
 * Restituisce `null` senza un cambio, e chi chiama deve mostrare l'importo
 * originale dicendo che il cambio manca. Un tasso 1:1 messo per difetto
 * sarebbe un numero sbagliato presentato come un dato — e con il dollaro
 * intorno a 0,87 sarebbe sbagliato del 13%, cioè quanto basta a far sembrare
 * in regola un cliente che sta sforando.
 */
export function convertiInCentesimi(importo: number, tasso: number | null): number | null {
  if (tasso === null || !Number.isFinite(tasso) || tasso <= 0) return null;
  return Math.round(importo * tasso * 100);
}
