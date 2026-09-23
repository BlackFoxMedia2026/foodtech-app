/**
 * **Il modello normalizzato: la lingua in cui Foodtech parla con ogni cassa.**
 *
 * Nessun modulo di Foodtech legge un oggetto di Lightspeed o di Oracle. Legge
 * questi tipi, e ogni adattatore traduce: `LightspeedAdapter` da ciò che
 * risponde Lightspeed a `OrdineEsterno`, `OracleAdapter` da ciò che risponde
 * Oracle allo stesso `OrdineEsterno`. `lightspeedOrder.totalAmount` dentro un
 * componente della sala è esattamente ciò che questo file esiste per
 * impedire.
 *
 * ## Convenzioni, uguali per tutti i fornitori
 *
 * - **Denaro in centesimi interi**, come nel resto di Foodtech (`Order.totalCents`,
 *   `Payment.amountCents`). I fornitori che danno decimali si arrotondano
 *   nell'adattatore, una volta sola.
 * - **`externalId` è sempre una stringa**, anche quando il fornitore usa
 *   interi a 64 bit: in JavaScript un `int64` oltre 2^53 perde cifre, e un
 *   identificativo con un'ultima cifra sbagliata è il tavolo di un altro.
 * - **Nessun campo inventato.** Se il fornitore non lo dà, il campo è
 *   `null`, non un valore per difetto che sembra vero.
 * - `raw` non esiste: il formato del fornitore resta dentro l'adattatore.
 */

export type SedeEsterna = {
  externalId: string;
  nome: string;
  /** L'account (business, merchant, organizzazione) a cui la sede appartiene. */
  account: { externalId: string; nome: string } | null;
};

export type SalaEsterna = {
  externalId: string;
  nome: string;
};

export type TavoloEsterno = {
  externalId: string;
  /** Come la sala chiama il tavolo: «12», «B1», «Terrazza 3». */
  etichetta: string;
  salaExternalId: string | null;
  posti: number | null;
  attivo: boolean;
};

export type CategoriaEsterna = {
  externalId: string;
  nome: string;
  padreExternalId: string | null;
};

export type ModificatoreEsterno = {
  externalId: string;
  nome: string;
  prezzoCents: number | null;
};

export type ProdottoEsterno = {
  externalId: string;
  /** Il codice con cui il prodotto si ordina alla cassa (SKU, PLU). */
  codice: string | null;
  nome: string;
  prezzoCents: number | null;
  categoriaExternalId: string | null;
  aliquotaPercentuale: number | null;
  ivaInclusa: boolean | null;
  modificatori: ModificatoreEsterno[];
};

export type MenuEsterno = {
  externalId: string;
  nome: string;
  categorie: CategoriaEsterna[];
  prodotti: ProdottoEsterno[];
};

export type AliquotaEsterna = {
  externalId: string;
  descrizione: string;
  /** Percentuale: 10 per il 10%. */
  percentuale: number | null;
  inclusa: boolean | null;
};

export type MetodoPagamentoEsterno = {
  externalId: string;
  nome: string;
  codice: string | null;
};

export type RigaOrdine = {
  /** Il codice del prodotto presso il fornitore (preso dalle mappature). */
  codiceProdotto: string;
  nome: string;
  quantita: number;
  prezzoUnitarioCents: number | null;
  note: string | null;
  /**
   * Quello che la cassa sa del prodotto, preso dalla mappatura (reparto,
   * aliquota, prezzo di listino). Serve ai fornitori che vogliono la riga
   * completa (Tilby: `department_id`, `vat_perc`) invece del solo codice.
   */
  datiProdotto?: Record<string, unknown> | null;
};

/** Un ordine che Foodtech manda a una cassa. */
export type OrdineDaInviare = {
  /**
   * Il riferimento di Foodtech, unico, che il fornitore rimanda indietro
   * negli eventi. È anche la chiave di idempotenza: rimandare lo stesso
   * ordine non ne crea due.
   */
  riferimento: string;
  tavolo: string | null;
  /**
   * L'identificativo del tavolo **presso il fornitore**, dalle mappature.
   * Chi ordina per etichetta (Lightspeed: `tableNumber`) usa `tavolo`; chi
   * ordina per identificativo (Cassa in Cloud: `idTable`) usa questo.
   */
  tavoloExternalId?: string | null;
  coperti: number | null;
  cliente: { nome: string; cognome: string | null; telefono: string | null; email: string | null } | null;
  righe: RigaOrdine[];
  nota: string | null;
};

export type StatoOrdineEsterno =
  | "ACCEPTED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "READY"
  | "CLOSED"
  | "CANCELLED"
  | "UNKNOWN";

/**
 * I totali di un conto **come li calcola la cassa** (Oracle Simphony:
 * `CheckTotals`). Foodtech non li ricalcola: quando la cassa è la fonte di
 * verità, si mostrano i suoi.
 */
export type TotaliEsterni = {
  subtotaleCents: number | null;
  scontiCents: number | null;
  serviziCents: number | null;
  tasseCents: number | null;
  pagatoCents: number | null;
  daPagareCents: number | null;
};

export type OrdineEsterno = {
  externalId: string | null;
  riferimento: string | null;
  stato: StatoOrdineEsterno;
  tavolo: string | null;
  totaleCents: number | null;
  righe: RigaOrdine[];
  /** Il dettaglio dei totali, quando la cassa lo espone (Oracle). */
  totali?: TotaliEsterni | null;
};

export type PagamentoEsterno = {
  externalId: string | null;
  riferimento: string | null;
  importoCents: number | null;
  mancia: number | null;
  metodo: string | null;
  riuscito: boolean;
};

export type ClienteEsterno = {
  externalId: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
};

export type PrenotazioneEsterna = {
  externalId: string;
  inizio: Date;
  persone: number;
  cliente: ClienteEsterno | null;
  note: string | null;
  stato: "CONFIRMED" | "CANCELLED" | "PENDING" | "UNKNOWN";
};

export type PersonaleEsterno = {
  externalId: string;
  nome: string;
  ruolo: string | null;
};

/* -------------------------------------------------------------------------- */
/*  Eventi normalizzati                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Un evento del fornitore tradotto. È ciò che arriva ai gestori di
 * `eventi.ts`: nessun gestore legge il payload originale.
 */
export type EventoNormalizzato =
  | {
      tipo: "pos.order.status";
      riferimento: string | null;
      externalId: string | null;
      stato: StatoOrdineEsterno;
      motivo: string | null;
      /**
       * Lo stato di preparazione come lo dice la cassa, parola per parola
       * (Oracle: `Submitted` = almeno un piatto mandato in cucina). Serve a
       * non dire «in cucina» finché la cassa non l'ha confermato.
       */
      preparazione?: string | null;
    }
  | {
      tipo: "pos.payment.status";
      riferimento: string | null;
      externalId: string | null;
      riuscito: boolean;
      motivo: string | null;
    }
  | {
      /**
       * Qualcosa del catalogo è cambiato presso il fornitore (prodotto,
       * categoria, aliquota): non si applica al volo, si chiede una
       * sincronizzazione — che scrive solo mappature, mai dati di Foodtech.
       */
      tipo: "catalogo.cambiato";
      risorsa: "menu" | "tax_rates" | "tables" | "payment_methods";
      externalId: string | null;
    }
  | {
      /** Una notifica che porta più entità insieme (Tilby: fino a 80 per lotto). */
      tipo: "multipli";
      eventi: EventoNormalizzato[];
    }
  | { tipo: "sconosciuto"; tipoOriginale: string };
