/**
 * Il vocabolario della piattaforma integrazioni.
 *
 * Sta in un file senza dipendenze (nessun Prisma, nessun `fetch`) perché lo
 * leggono tre mondi diversi: il catalogo, gli adattatori e l'interfaccia. Un
 * componente client che importa questo file non si porta dietro il database.
 *
 * Vedi `docs/INTEGRATION-PLATFORM.md` per il quadro intero.
 */

/* -------------------------------------------------------------------------- */
/*  Categorie                                                                 */
/* -------------------------------------------------------------------------- */

export const CATEGORIE = [
  "POS",
  "PAGAMENTI",
  "PRENOTAZIONI",
  "MARKETING",
  "ANALYTICS",
  "CRM",
  "PMS",
  "TELEFONIA",
  "FISCALE",
  "DELIVERY",
  "ALTRO",
] as const;

export type Categoria = (typeof CATEGORIE)[number];

export const ETICHETTA_CATEGORIA: Record<Categoria, string> = {
  POS: "Cassa (POS)",
  PAGAMENTI: "Pagamenti",
  PRENOTAZIONI: "Prenotazioni e portali",
  MARKETING: "Marketing e comunicazione",
  ANALYTICS: "Analytics",
  CRM: "CRM",
  PMS: "Hotel (PMS)",
  TELEFONIA: "Telefonia",
  FISCALE: "Fiscale",
  DELIVERY: "Delivery",
  ALTRO: "Altro",
};

/* -------------------------------------------------------------------------- */
/*  Due concetti che non vanno confusi                                        */
/* -------------------------------------------------------------------------- */

/**
 * **Quanto è vero il connettore.** Detto da chi l'ha scritto, non dal
 * marketing.
 *
 * - `IMPLEMENTED` — collegato e **provato contro il fornitore vero**. Solo
 *   allora. Un adattatore scritto seguendo la documentazione e mai provato
 *   con un account vero non lo è;
 * - `IN_DEVELOPMENT` — l'adattatore esiste, segue la documentazione ufficiale,
 *   ma manca la prova dal vivo (credenziali, accordo di partnership,
 *   ambiente di prova);
 * - `PLANNED` — c'è solo la voce di catalogo. Nessun codice parla con quel
 *   fornitore.
 */
export type StatoImplementazione = "IMPLEMENTED" | "IN_DEVELOPMENT" | "PLANNED";

/**
 * **Cosa può farne il ristoratore adesso.** È ciò che decide il pulsante
 * sulla scheda del catalogo.
 *
 * - `AVAILABLE` — si installa;
 * - `PREVIEW` — si installa, e la schermata dice a lettere che è
 *   un'anteprima. Ammessa solo per `IN_DEVELOPMENT`;
 * - `COMING_SOON` — si vede, non si installa, e non c'è un pulsante che
 *   finga il contrario.
 *
 * La coerenza fra le due cose la fissa un test (`integrazioni-catalogo`):
 * niente `AVAILABLE` senza `IMPLEMENTED`, niente installabile senza
 * adattatore.
 */
export type Disponibilita = "AVAILABLE" | "PREVIEW" | "COMING_SOON";

/* -------------------------------------------------------------------------- */
/*  Autenticazione                                                            */
/* -------------------------------------------------------------------------- */

export type ModalitaAutenticazione =
  | "OAUTH2"
  | "API_KEY"
  | "BASIC"
  | "TOKEN"
  | "CLIENT_CREDENTIALS"
  | "MANUAL"
  /** Gestita da un modulo Foodtech che esisteva prima della piattaforma. */
  | "NATIVE";

export const ETICHETTA_AUTENTICAZIONE: Record<ModalitaAutenticazione, string> = {
  OAUTH2: "Accesso con l'account del fornitore",
  API_KEY: "Chiave API",
  BASIC: "Utente e password",
  TOKEN: "Token di accesso",
  CLIENT_CREDENTIALS: "ID e segreto del client",
  MANUAL: "Configurazione manuale",
  NATIVE: "Collegamento integrato in Foodtech",
};

/* -------------------------------------------------------------------------- */
/*  Capacità                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Le cose che un'integrazione può fare per Foodtech, con lo stesso nome per
 * tutti i fornitori. Un adattatore **dichiara** quali supporta; il
 * ristoratore sceglie quali accendere. Non si dichiara una capacità che l'API
 * del fornitore non offre davvero — lo controlla un test contro i metodi
 * dell'adattatore.
 */
export const CAPACITA = {
  locations: { label: "Sedi", descrizione: "Legge le sedi dell'account." },
  tables: { label: "Tavoli", descrizione: "Legge sale e tavoli e li abbina a quelli di Foodtech." },
  menu: { label: "Menu e prodotti", descrizione: "Legge carta, categorie e prodotti." },
  tax_rates: { label: "Aliquote IVA", descrizione: "Legge le aliquote configurate in cassa." },
  payment_methods: { label: "Metodi di pagamento", descrizione: "Legge i metodi di pagamento della cassa." },
  "orders.read": { label: "Lettura ordini", descrizione: "Legge gli ordini dalla cassa." },
  "orders.write": { label: "Invio ordini", descrizione: "Manda gli ordini di Foodtech alla cassa." },
  "payments.read": { label: "Lettura pagamenti", descrizione: "Legge i pagamenti registrati." },
  "payments.write": { label: "Registrazione pagamenti", descrizione: "Registra un pagamento sulla cassa." },
  close_order: { label: "Chiusura conto", descrizione: "Chiude il conto sulla cassa." },
  customers: { label: "Clienti", descrizione: "Sincronizza l'anagrafica clienti." },
  reservations: { label: "Prenotazioni", descrizione: "Riceve o invia prenotazioni." },
  contacts: { label: "Contatti marketing", descrizione: "Sincronizza i contatti con consenso." },
  events: { label: "Eventi di analytics", descrizione: "Invia gli eventi di conversione." },
  calls: { label: "Chiamate", descrizione: "Riceve le chiamate e il numero di chi chiama." },
  charges: { label: "Incassi", descrizione: "Incassa pagamenti online." },
  profile: { label: "Profilo collegato", descrizione: "Verifica la pagina, il profilo o il numero collegato e ne legge nome e stato." },
} as const;

export type Capacita = keyof typeof CAPACITA;

/* -------------------------------------------------------------------------- */
/*  Configurazione richiesta                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Un campo che il percorso di installazione chiede. `segreto: true` vuol dire
 * che finisce in `IntegrationCredential` cifrato, e non torna mai indietro
 * verso il browser; gli altri finiscono in `configuration`.
 */
export type CampoConfigurazione = {
  chiave: string;
  etichetta: string;
  aiuto?: string;
  tipo: "testo" | "segreto" | "scelta";
  obbligatorio: boolean;
  /** Per `scelta`: da dove arrivano le opzioni (le chiede l'adattatore). */
  opzioniDa?: "locations" | "floors" | "tax_rates" | "payment_methods" | "order_types";
  /** Per `scelta` con opzioni fisse, che non vengono dal fornitore (l'ambiente: prova o produzione). */
  opzioni?: { value: string; label: string }[];
  /**
   * `"autenticazione"`: il campo si chiede nel passo di autenticazione e va
   * all'adattatore insieme ai segreti (Oracle Simphony: indirizzi, Client ID,
   * utente dell'API account). Non finisce in `configuration`: l'adattatore
   * lo conserva, cifrato, fra le credenziali.
   */
  fase?: "autenticazione";
};

/* -------------------------------------------------------------------------- */
/*  Come si presenta al ristoratore                                           */
/* -------------------------------------------------------------------------- */

/**
 * Le parole con cui un campo si mostra **al cliente**. L'etichetta e l'aiuto
 * di `CampoConfigurazione` restano quelli tecnici (li legge la vista interna
 * di Foodtech); qui c'è la stessa domanda detta a chi gestisce un ristorante.
 */
export type CampoPerIlCliente = {
  etichetta: string;
  aiuto?: string;
  segnaposto?: string;
  /** Il campo si chiede nel primo passo, insieme alle credenziali (l'ambiente di Tilby). */
  passo?: "accesso";
  /** Nascosto sotto «Altre opzioni», con il valore predefinito già scelto. */
  avanzato?: boolean;
  predefinito?: string;
  /** Per `scelta` con opzioni fisse: come si chiamano per il cliente. */
  opzioni?: Record<string, string>;
  /**
   * Una scelta che il fornitore restituisce come «A · B» (Oracle: sede e
   * revenue center) si presenta come due domande, una dopo l'altra.
   */
  dividi?: [string, string];
  /** Le opzioni valgono solo per il valore scelto in un altro campo (prefisso `valore:`). */
  filtraPer?: string;
};

/**
 * Tutto ciò che la pagina del cliente dice di un'integrazione, oltre a nome e
 * descrizione. Mai documentazione, endpoint, licenze tecniche o stati di
 * certificazione: quelli stanno nella vista interna.
 */
export type PresentazioneCliente = {
  /** Sotto il pulsante «Collega»: che cosa gli servirà. */
  credenziali?: string;
  /** Il riquadro «Dove trovo…?». */
  aiuto?: { titolo: string; paragrafi: string[] };
  campi?: Record<string, CampoPerIlCliente>;
  /** Il titolo del passo in cui si sceglie la sede («Punto vendita», «Sede»…). */
  titoloSede?: string;
};

/* -------------------------------------------------------------------------- */
/*  Stati                                                                     */
/* -------------------------------------------------------------------------- */

/** Gli stessi valori dell'enum Prisma, ripetuti per il codice client. */
export const STATI_INSTALLAZIONE = [
  "NOT_INSTALLED",
  "INSTALLING",
  "NEEDS_CONFIGURATION",
  "CONNECTED",
  "SYNCING",
  "ACTIVE",
  "ERROR",
  "DISABLED",
  "REAUTH_REQUIRED",
] as const;

export type StatoInstallazione = (typeof STATI_INSTALLAZIONE)[number];

export type Salute = "HEALTHY" | "DEGRADED" | "ERROR" | "AUTH_REQUIRED" | "UNKNOWN";

/** Tipi delle entità mappate: gli stessi valori di `ExternalEntityMapping.entityType`. */
export const TIPI_ENTITA = [
  "LOCATION",
  "FLOOR",
  "TABLE",
  "MENU",
  "CATEGORY",
  "PRODUCT",
  /** Listino (modalità di vendita di Cassa in Cloud): prezzi diversi per lo stesso prodotto. */
  "PRICE_LIST",
  "MODIFIER",
  /** Sconti e maggiorazioni di servizio configurati sulla cassa (Oracle Simphony): solo letti. */
  "DISCOUNT",
  "SERVICE_CHARGE",
  "TAX_RATE",
  "PAYMENT_METHOD",
  "CUSTOMER",
  "ORDER",
  "PAYMENT",
  "RESERVATION",
  "STAFF",
] as const;

export type TipoEntita = (typeof TIPI_ENTITA)[number];
