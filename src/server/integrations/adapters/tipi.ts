import type { Capacita, TipoEntita } from "../tipi";
import type {
  AliquotaEsterna,
  CategoriaEsterna,
  ClienteEsterno,
  EventoNormalizzato,
  MenuEsterno,
  MetodoPagamentoEsterno,
  OrdineDaInviare,
  OrdineEsterno,
  PagamentoEsterno,
  ProdottoEsterno,
  SalaEsterna,
  SedeEsterna,
  TavoloEsterno,
} from "../dominio";
import type { ClientFornitore } from "./http";
import type { TotaliEsterni } from "../dominio";

export type { TotaliEsterni } from "../dominio";

/** Un documento emesso dalla cassa per un ordine: scontrino, fattura, documento non fiscale. */
export type DocumentoEsterno = {
  externalId: string;
  tipo: string;
  numero: string | null;
  data: string | null;
  /** L'indirizzo pubblico del documento, quando la cassa lo genera. */
  url: string | null;
};

/**
 * **Il contratto di un adattatore.**
 *
 * ```
 * Foodtech → servizio integrazioni → IntegrationAdapter → fornitore
 * ```
 *
 * Un adattatore **traduce e basta**. Non scrive nel database, non decide lo
 * stato dell'installazione, non tocca le mappature: riceve un contesto con le
 * credenziali già fresche e un client HTTP già configurato, parla con il
 * fornitore e restituisce oggetti del modello normalizzato (`dominio.ts`).
 * Tutto il resto — cifrare, rinnovare token, registrare, riprovare, mappare —
 * lo fa la piattaforma, una volta per tutti i fornitori.
 *
 * È ciò che permette di aggiungere Cassa in Cloud o Tilby scrivendo **un
 * file**, senza toccare né le rotte né l'interfaccia.
 *
 * Non tutti i metodi sono obbligatori: un fornitore che non ha webhook non
 * implementa `riceviWebhook`. Ma ciò che un adattatore implementa deve
 * corrispondere a ciò che il catalogo dichiara (lo controlla un test).
 */

/** Quello che l'adattatore sa dell'installazione. Mai credenziali qui. */
export type InstallazioneVista = {
  id: string;
  venueId: string;
  configuration: Record<string, unknown>;
  enabledCapabilities: string[];
  externalAccountId: string | null;
  externalLocationId: string | null;
  webhookKey: string;
  /** I metadati dell'installazione (per esempio gli id dei webhook registrati presso il fornitore). */
  metadata?: Record<string, unknown> | null;
};

/** Le credenziali in chiaro. Esistono solo in memoria, dentro una chiamata. */
export type Segreti = Record<string, string>;

export type CredenzialiNuove = {
  kind: "OAUTH2" | "API_KEY" | "BASIC" | "TOKEN" | "CLIENT_CREDENTIALS" | "MANUAL";
  segreti: Segreti;
  scopes: string[];
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

export type ContestoAdattatore = {
  installazione: InstallazioneVista;
  segreti: Segreti;
  http: ClientFornitore;
  correlationId: string;
  /** L'indirizzo pubblico di questa installazione di Foodtech. */
  origine: string;
};

export type EsitoProva = {
  account: { externalId: string; nome: string } | null;
  sedi: SedeEsterna[];
  /** Cose da dire anche se la prova è riuscita («nessuna sede trovata»). */
  avvisi: string[];
};

/** Le scelte per il passo «Configurazione», lette dal fornitore. */
export type OpzioniConfigurazione = {
  locations?: { value: string; label: string }[];
  floors?: { value: string; label: string }[];
  tax_rates?: { value: string; label: string }[];
  payment_methods?: { value: string; label: string }[];
  /** Tipi d'ordine della cassa (Oracle Simphony: `orderTypes` del revenue center). */
  order_types?: { value: string; label: string }[];
};

/**
 * Cosa ha trovato una sincronizzazione: entità da scrivere nelle mappature.
 * L'adattatore non scrive — descrive. Il motore (`sync.ts`) confronta con le
 * mappature esistenti e abbina.
 */
export type RisultatoSincronizzazione = {
  entita: {
    tipo: TipoEntita;
    externalId: string;
    etichetta: string;
    metadata?: Record<string, unknown>;
  }[];
  /** Elementi che il fornitore ha restituito e non si sono potuti leggere. */
  scartati: { motivo: string; externalId?: string }[];
};

export type OperazioneSync = "full" | "tables" | "menu" | "tax_rates" | "payment_methods";

export type WebhookRicevuto = {
  /** Il corpo esattamente come è arrivato: serve alle firme. */
  corpo: string;
  intestazioni: Headers;
};

export type WebhookLetto = {
  /** L'identificativo con cui si scartano i duplicati. */
  idEvento: string;
  tipo: string;
  evento: EventoNormalizzato;
  /**
   * Il riferimento alla sede che il fornitore mette nell'evento, quando c'è.
   * Il servizio lo confronta con quella dell'installazione: un evento di
   * un'altra sede arrivato all'indirizzo sbagliato non si lavora.
   */
  sedeExternalId: string | null;
};

export interface IntegrationAdapter {
  readonly slug: string;
  readonly versione: string;

  /* --- Autenticazione --------------------------------------------------- */

  /** OAuth: l'indirizzo a cui mandare il ristoratore. */
  iniziaAutorizzazione?(input: { state: string; redirectUri: string }): { url: string };
  /** OAuth: dal codice di ritorno alle credenziali. */
  completaAutorizzazione?(input: { code: string; redirectUri: string; http: ClientFornitore }): Promise<CredenzialiNuove>;
  /** Chiave API, utente e password: dai campi del modulo alle credenziali. */
  connetti?(input: { campi: Record<string, string>; http: ClientFornitore }): Promise<CredenzialiNuove>;
  /** Rinnova l'accesso. Restituisce credenziali nuove, che sostituiscono le vecchie. */
  rinnovaAutenticazione?(ctx: ContestoAdattatore): Promise<CredenzialiNuove>;
  /** Revoca presso il fornitore, se il fornitore lo permette. */
  disconnetti?(ctx: ContestoAdattatore): Promise<void>;

  /* --- Salute ----------------------------------------------------------- */

  /** Una chiamata vera al fornitore. Solleva `ErroreIntegrazione` se non va. */
  provaConnessione(ctx: ContestoAdattatore): Promise<EsitoProva>;
  opzioniConfigurazione?(ctx: ContestoAdattatore): Promise<OpzioniConfigurazione>;
  /** Da chiamare all'attivazione (registrare webhook, …). */
  attiva?(ctx: ContestoAdattatore): Promise<{ segretiAggiunti?: Segreti; metadata?: Record<string, unknown> }>;

  /* --- Sincronizzazione ------------------------------------------------- */

  sincronizza?(ctx: ContestoAdattatore, operazione: OperazioneSync): Promise<RisultatoSincronizzazione>;
  /** Ogni quanti minuti conviene una sincronizzazione programmata. Assente = mai. */
  readonly minutiSyncProgrammata?: number;

  /* --- Webhook ---------------------------------------------------------- */

  /* --- Ordini ----------------------------------------------------------- */

  /**
   * Da una mappatura prodotto al codice con cui quel prodotto si ordina.
   * Assente = l'`externalId` della mappatura (Lightspeed: lo sku). Solleva
   * `ErroreIntegrazione` quando il prodotto non si può ordinare così.
   */
  codiceProdottoPerOrdine?(mappatura: { externalId: string; metadata: Record<string, unknown> | null }): string;

  /** Vero se la chiamata viene davvero dal fornitore. */
  verificaWebhook?(ctx: ContestoAdattatore, w: WebhookRicevuto): boolean;
  riceviWebhook?(ctx: ContestoAdattatore, w: WebhookRicevuto): WebhookLetto;
}

/**
 * **Le operazioni di una cassa.** Tutte facoltative: il fornitore dichiara
 * quelle che la sua API permette davvero, e nessuna si simula. Il nome è lo
 * stesso per tutte le casse; la traduzione è dell'adattatore.
 */
export interface OperazioniPos {
  getLocations?(ctx: ContestoAdattatore): Promise<SedeEsterna[]>;
  getFloors?(ctx: ContestoAdattatore): Promise<SalaEsterna[]>;
  getTables?(ctx: ContestoAdattatore): Promise<TavoloEsterno[]>;
  getTable?(ctx: ContestoAdattatore, externalId: string): Promise<TavoloEsterno | null>;
  getMenu?(ctx: ContestoAdattatore): Promise<MenuEsterno[]>;
  getProducts?(ctx: ContestoAdattatore): Promise<ProdottoEsterno[]>;
  getCategories?(ctx: ContestoAdattatore): Promise<CategoriaEsterna[]>;
  getTaxRates?(ctx: ContestoAdattatore): Promise<AliquotaEsterna[]>;
  getPaymentMethods?(ctx: ContestoAdattatore): Promise<MetodoPagamentoEsterno[]>;
  getOrders?(ctx: ContestoAdattatore, filtro: { da: Date; a: Date }): Promise<OrdineEsterno[]>;
  getOrder?(ctx: ContestoAdattatore, externalId: string): Promise<OrdineEsterno | null>;
  /** Asincrono presso molti fornitori: l'esito vero arriva con un webhook. */
  createOrder?(ctx: ContestoAdattatore, ordine: OrdineDaInviare): Promise<{ accettato: boolean; externalId: string | null }>;
  updateOrder?(ctx: ContestoAdattatore, externalId: string, ordine: OrdineDaInviare): Promise<void>;
  sendOrder?(ctx: ContestoAdattatore, externalId: string): Promise<void>;
  getPayments?(ctx: ContestoAdattatore, filtro: { da: Date; a: Date }): Promise<PagamentoEsterno[]>;
  createPayment?(
    ctx: ContestoAdattatore,
    pagamento: {
      riferimentoOrdine: string;
      importoCents: number;
      manciaCents: number;
      /** Il metodo di pagamento presso la cassa (dalle mappature), quando il fornitore lo chiede. */
      metodo?: { externalId: string; nome: string; tipoId?: string | null; tipoNome?: string | null };
      /**
       * Un identificativo **stabile** di questa operazione di pagamento: lo
       * stesso a ogni nuovo tentativo. Obbligatorio per le casse che hanno
       * un'idempotenza nativa (Oracle: `idempotencyId`).
       */
      idOperazione?: string;
    },
  ): Promise<void>;
  closeOrder?(ctx: ContestoAdattatore, externalId: string): Promise<void>;
  /** Annulla un ordine aperto presso la cassa. */
  cancelOrder?(ctx: ContestoAdattatore, externalId: string): Promise<void>;
  /** I documenti emessi per un ordine (scontrino, fattura), quando la cassa li espone. */
  getReceipt?(ctx: ContestoAdattatore, externalId: string): Promise<DocumentoEsterno[]>;
  syncCustomers?(ctx: ContestoAdattatore): Promise<ClienteEsterno[]>;
  /**
   * I totali che la cassa calcolerebbe per questo ordine, **senza crearlo**
   * (Oracle: `POST /checks/calculator`). Anteprima, non un conto.
   */
  calculateOrder?(ctx: ContestoAdattatore, ordine: OrdineDaInviare): Promise<TotaliEsterni>;
  /**
   * Il testo della stampa del conto come lo produce la cassa (Oracle:
   * `GET /checks/{checkRef}/printed`, 40 colonne). **Non** è un documento
   * fiscale: per quello c'è `getReceipt`.
   */
  getPrintedCheck?(ctx: ContestoAdattatore, externalId: string): Promise<string[]>;
}

export interface PosIntegrationAdapter extends IntegrationAdapter {
  readonly pos: OperazioniPos;
}

export function eAdattatorePos(a: IntegrationAdapter): a is PosIntegrationAdapter {
  return "pos" in a && typeof (a as PosIntegrationAdapter).pos === "object";
}

/**
 * Quale metodo deve esistere per poter dichiarare una capacità. È la tabella
 * con cui il test del catalogo controlla che nessun adattatore prometta
 * qualcosa che non sa fare.
 */
export const METODI_PER_CAPACITA: Partial<Record<Capacita, (keyof OperazioniPos)[]>> = {
  locations: ["getLocations"],
  tables: ["getTables"],
  menu: ["getMenu"],
  tax_rates: ["getTaxRates"],
  payment_methods: ["getPaymentMethods"],
  "orders.read": ["getOrders"],
  "orders.write": ["createOrder"],
  "payments.read": ["getPayments"],
  "payments.write": ["createPayment"],
  close_order: ["closeOrder"],
  customers: ["syncCustomers"],
};
