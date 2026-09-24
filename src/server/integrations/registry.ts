import type {
  Capacita,
  CampoConfigurazione,
  Categoria,
  Disponibilita,
  ModalitaAutenticazione,
  PresentazioneCliente,
  StatoImplementazione,
} from "./tipi";

/**
 * **Il catalogo delle integrazioni. L'unica fonte di verità.**
 *
 * Chi vuole sapere quali integrazioni esistono, cosa fanno e se funzionano
 * legge qui — l'interfaccia, le rotte, il motore di sincronizzazione. Nessun
 * nome di fornitore, nessuna capacità, nessuna frase di marketing scritta a
 * mano in un componente.
 *
 * ## Perché nel codice e non nel database
 *
 * Una voce del catalogo dice **cosa sa fare un adattatore**, e quello cambia
 * con un rilascio, non con una riga scritta da un pannello. Tenerla in
 * tabella vorrebbe dire poter dichiarare in produzione una capacità che il
 * codice non ha. Nel database c'è solo ciò che un locale ha installato
 * (`IntegrationInstallation`), che si riferisce a una voce per `slug`.
 *
 * ## La regola di onestà
 *
 * Esserci nel catalogo **non** vuol dire funzionare. Ogni voce porta due
 * informazioni separate (vedi `tipi.ts`):
 *
 * - `implementazione`: quanto è vero il connettore;
 * - `disponibilita`: se il ristoratore può installarla adesso.
 *
 * Una voce `PLANNED` si vede e non si installa. Una `IN_DEVELOPMENT` si può
 * mettere in `PREVIEW`, e la schermata lo dice. `IMPLEMENTED` si scrive solo
 * dopo una prova contro il fornitore vero, con un account vero. Il test
 * `integrazioni-catalogo` impedisce le combinazioni che mentono.
 *
 * ## I loghi
 *
 * Nessun logo di terzi nel repository (vedi README: il progetto non riusa
 * asset commerciali). Ogni scheda mostra un **monogramma**; il giorno in cui
 * c'è un accordo che permette di usare il marchio, si aggiunge `logo.src`.
 */

export type VoceCatalogo = {
  /** Identificativo stabile della voce. Non cambia mai, nemmeno se cambia lo slug. */
  id: string;
  /** Ciò che finisce nell'indirizzo e in `IntegrationInstallation.integrationSlug`. */
  slug: string;
  nome: string;
  /** L'azienda che fa il prodotto. */
  fornitore: string;
  categoria: Categoria;
  /** Una riga, per la scheda del catalogo. */
  descrizione: string;
  logo: { monogramma: string; src?: string };
  implementazione: StatoImplementazione;
  disponibilita: Disponibilita;
  autenticazione: {
    modalita: ModalitaAutenticazione;
    /**
     * Vero se la modalità è stata letta nella documentazione ufficiale. Falso
     * per le voci pianificate: lì è la modalità che ci aspettiamo, non una
     * che abbiamo verificato.
     */
    verificata: boolean;
    /** I permessi (scope) chiesti al fornitore: i minimi per le capacità dichiarate. */
    scope?: string[];
  };
  /** Le capacità che l'adattatore offre **davvero**. Vuoto per le voci pianificate. */
  capacita: Capacita[];
  webhook: {
    /** Gli eventi che l'adattatore sa ricevere. */
    eventi: string[];
    /** Come il fornitore prova che la chiamata è sua. */
    autenticazione: string | null;
    /**
     * Il webhook non lo registra Foodtech: lo configura il ristoratore nel
     * pannello del fornitore, incollando l'indirizzo che gli mostriamo e
     * riportando qui il segreto che il fornitore gli dà (Cassa in Cloud).
     * Solo per queste voci l'interfaccia mostra l'indirizzo dei webhook.
     */
    configurazioneManuale?: boolean;
  };
  /**
   * Una frase in più nel percorso di installazione, per un requisito che sta
   * dalla parte del cliente (un piano del fornitore, un'abilitazione). Mai un
   * prezzo: cambia, e una cifra scritta qui diventerebbe falsa in silenzio.
   */
  notaInstallazione?: string;
  /**
   * Le frasi d'errore dette **con le parole del fornitore**, quando quelle
   * generiche non bastano («il piano non consente…»). Solo titolo e
   * spiegazione: l'azione suggerita resta quella del codice.
   */
  messaggi?: Partial<Record<string, { titolo: string; spiegazione: string }>>;
  /**
   * La matrice delle risorse: per ognuna, cosa l'API documentata permette,
   * in che direzione si sincronizza, chi è la fonte di verità, e quanto è
   * verificato. È documentazione **eseguibile**: il test del catalogo la
   * confronta con le capacità dichiarate.
   */
  risorse?: RisorsaFornitore[];
  /** I campi che il percorso di installazione chiede al passo «Configurazione». */
  configurazione: CampoConfigurazione[];
  /**
   * Come la voce si presenta al ristoratore (`server/integrations/cliente.ts`):
   * le stesse domande di `configurazione`, con parole sue, e l'aiuto «Dove
   * trovo…?». Tutto il resto di questa voce è per la vista interna.
   */
  cliente?: PresentazioneCliente;
  /** Per il primo passo del percorso: cosa collega, cosa legge, cosa scrive. */
  dati: { legge: string[]; scrive: string[]; permessi: string[] };
  documentazione: string | null;
  /** La versione dell'adattatore, `null` se non c'è adattatore. */
  versioneAdattatore: string | null;
  /**
   * Le variabili d'ambiente **della piattaforma** senza cui l'installazione
   * non parte (per esempio il client OAuth di Foodtech presso il fornitore).
   * Mai i valori: solo i nomi, e solo lato server.
   */
  requisitiPiattaforma: string[];
  /**
   * Cosa manca, detto in chiaro, perché questa integrazione funzioni. Vuoto
   * solo per `IMPLEMENTED`.
   */
  mancaPerOperare: string[];
  /**
   * Il collegamento è gestito da un modulo Foodtech nato prima della
   * piattaforma (Stripe Connect). La scheda porta lì invece di aprire il
   * percorso generico: due modi di collegare lo stesso conto sarebbero due
   * verità.
   */
  nativa?: { href: string };
};

/**
 * Una riga della matrice delle risorse di un fornitore.
 *
 * - `api`: cosa la **documentazione ufficiale** offre per questa risorsa —
 *   non cosa fa il prodotto del fornitore, che è un'altra cosa;
 * - `direzione`: da dove a dove si muovono i dati in Foodtech;
 * - `fonteDiVerita`: chi vince se le due parti non sono d'accordo;
 * - `verifica`: `DOCUMENTATA` (letta nella documentazione, mai provata con
 *   un account vero), `DA_VERIFICARE` (la documentazione lascia un dubbio che
 *   solo un account vero scioglie), `NON_SUPPORTATA` (l'API documentata non
 *   la offre), `VERIFICATA` (provata contro l'API vera).
 */
export type RisorsaFornitore = {
  risorsa: string;
  api: { lettura: boolean; scrittura: boolean; webhook: boolean };
  direzione: "FORNITORE_A_FOODTECH" | "FOODTECH_A_FORNITORE" | "BIDIREZIONALE" | "NESSUNA";
  fonteDiVerita: "FORNITORE" | "FOODTECH" | "NESSUNA";
  /** Se Foodtech la usa davvero oggi (e con quale capacità). */
  usataDa: Capacita | null;
  verifica: "DOCUMENTATA" | "DA_VERIFICARE" | "NON_SUPPORTATA" | "VERIFICATA";
  note?: string;
};

/* -------------------------------------------------------------------------- */
/*  Frasi che si ripetono                                                     */
/* -------------------------------------------------------------------------- */

const SERVE_PARTNERSHIP = "Un accordo di partnership con il fornitore e l'accesso alle sue API.";
const SERVE_ADATTATORE = "L'adattatore: nessun codice parla ancora con questo fornitore.";
const SERVE_PROVA = "Una prova dal vivo con un account vero del fornitore.";

/** Una voce pianificata: solo il catalogo, niente codice, niente pulsante. */
function pianificata(
  v: Pick<VoceCatalogo, "id" | "slug" | "nome" | "fornitore" | "categoria" | "descrizione"> & {
    monogramma: string;
    modalita: ModalitaAutenticazione;
    documentazione?: string | null;
    manca?: string[];
    legge?: string[];
    scrive?: string[];
  },
): VoceCatalogo {
  return {
    id: v.id,
    slug: v.slug,
    nome: v.nome,
    fornitore: v.fornitore,
    categoria: v.categoria,
    descrizione: v.descrizione,
    logo: { monogramma: v.monogramma },
    implementazione: "PLANNED",
    disponibilita: "COMING_SOON",
    autenticazione: { modalita: v.modalita, verificata: false },
    capacita: [],
    webhook: { eventi: [], autenticazione: null },
    configurazione: [],
    dati: { legge: v.legge ?? [], scrive: v.scrive ?? [], permessi: [] },
    documentazione: v.documentazione ?? null,
    versioneAdattatore: null,
    requisitiPiattaforma: [],
    mancaPerOperare: v.manca ?? [SERVE_PARTNERSHIP, SERVE_ADATTATORE],
  };
}

/* -------------------------------------------------------------------------- */
/*  Il catalogo                                                               */
/* -------------------------------------------------------------------------- */

export const CATALOGO: readonly VoceCatalogo[] = [
  /* ------------------------------ POS ----------------------------------- */
  {
    id: "int_lightspeed_k",
    slug: "lightspeed-k",
    nome: "Lightspeed Restaurant",
    fornitore: "Lightspeed",
    categoria: "POS",
    descrizione: "Sincronizza sale, tavoli, menu e aliquote, e manda gli ordini alla cassa.",
    logo: { monogramma: "Ls" },
    /*
      K-Series è la linea Lightspeed per la ristorazione in Europa (l'ex
      iKentoo). L'adattatore segue la documentazione pubblica ufficiale
      (api-portal.lsk.lightspeed.app, api-docs.lsk.lightspeed.app) e non è
      mai stato provato contro un account vero: serve un client OAuth che
      Lightspeed rilascia ai partner. Finché quella prova non c'è, resta
      IN_DEVELOPMENT e si mostra come anteprima.
    */
    implementazione: "IN_DEVELOPMENT",
    disponibilita: "PREVIEW",
    autenticazione: {
      modalita: "OAUTH2",
      verificata: true,
      /*
        I minimi per quello che l'adattatore fa. `orders-api` copre sedi,
        piantine, menu, ordini e la configurazione dei webhook;
        `financial-api` le aliquote e i metodi di pagamento;
        `offline_access` porta il token di rinnovo da 25 minuti di sessione a
        40 giorni — senza, l'integrazione si scollegherebbe ogni notte.
        Non si chiedono `items`, `staff-api`, `propertymanagement`: non li usa
        niente.
      */
      scope: ["orders-api", "financial-api", "offline_access"],
    },
    capacita: ["locations", "tables", "menu", "tax_rates", "payment_methods", "orders.write"],
    webhook: {
      eventi: ["order.status", "payment.status"],
      autenticazione:
        "Autenticazione HTTP Basic con utente e password generati da Foodtech per ogni installazione.",
    },
    configurazione: [
      {
        chiave: "businessLocationId",
        etichetta: "Sede Lightspeed",
        aiuto: "La sede della cassa che corrisponde a questo locale.",
        tipo: "scelta",
        obbligatorio: true,
        opzioniDa: "locations",
      },
    ],
    cliente: {
      credenziali: "Ti basta accedere con il tuo account Lightspeed.",
      campi: { businessLocationId: { etichetta: "Sede" } },
      titoloSede: "Sede",
    },
    dati: {
      legge: [
        "L'account e le sedi",
        "Sale e tavoli",
        "Menu, categorie e prodotti con prezzo",
        "Aliquote IVA e metodi di pagamento",
        "Lo stato degli ordini inviati da Foodtech",
      ],
      scrive: ["Gli ordini al tavolo, solo se accendi «Invio ordini»"],
      permessi: ["orders-api", "financial-api", "offline_access"],
    },
    documentazione: "https://api-portal.lsk.lightspeed.app/",
    versioneAdattatore: "0.1.0",
    requisitiPiattaforma: ["LIGHTSPEED_K_CLIENT_ID", "LIGHTSPEED_K_CLIENT_SECRET"],
    mancaPerOperare: [
      "Il client OAuth di Foodtech presso Lightspeed (programma partner, api-portal.lsk.lightspeed.app).",
      "L'indirizzo di ritorno registrato presso Lightspeed: /api/integrations/oauth/callback/lightspeed-k, in HTTPS.",
      "Una prova completa sull'ambiente di prova di Lightspeed (trial) e poi su un locale vero.",
    ],
  },
  {
    id: "int_oracle_simphony",
    slug: "oracle-simphony",
    nome: "Oracle MICROS Simphony",
    fornitore: "Oracle",
    categoria: "POS",
    descrizione: "Collega Foodtech a Oracle Simphony per sincronizzare menu, tavoli, check e operazioni di vendita.",
    logo: { monogramma: "Os" },
    /*
      Adattatore scritto sulla guida ufficiale di Simphony Transaction
      Services Gen2 e sul suo swagger.json (2026.08.15). Mai provato: né su un
      ambiente Oracle (non esiste una sandbox pubblica) né su un POS. Resta
      IN_DEVELOPMENT. Solo la Cloud API: la Location API on-premises è nella
      rete del ristorante.
    */
    implementazione: "IN_DEVELOPMENT",
    disponibilita: "PREVIEW",
    autenticazione: {
      modalita: "BASIC",
      verificata: true,
      /* OpenID Connect, Authorization Code + PKCE con l'API account: niente
         client secret, solo lo scope `openid`. I permessi li decidono Client
         Scope e Authorization Scope dell'API account in Reporting and Analytics. */
    },
    capacita: ["locations", "tables", "menu", "tax_rates", "payment_methods", "orders.read", "orders.write", "payments.read", "payments.write"],
    webhook: {
      eventi: ["CheckNotification", "ConfigurationNotification", "OrganizationsNotification", "EmployeesNotification"],
      autenticazione:
        "Intestazioni Digest (HMAC-SHA256 Base64 del corpo, con la chiave registrata da Foodtech) e Key-Id. Oracle manda ogni notifica una volta sola, senza riprovare: HTTPS sulla porta 443, domini .com .net .org .edu .ca .io .site .se .sa.",
    },
    configurazione: [
      {
        chiave: "sts",
        etichetta: "Indirizzo dei servizi STS Gen2",
        aiuto: "In EMC: Enterprise Parameters → Applications → «Transaction Services Generation 2 Services». Solo HTTPS e solo domini Oracle ammessi.",
        tipo: "testo",
        obbligatorio: true,
        fase: "autenticazione",
      },
      {
        chiave: "auth",
        etichetta: "Indirizzo dell'OpenID Provider",
        aiuto: "In EMC: Enterprise Parameters → Applications → «OpenID Provider» (in Reporting and Analytics: «Authentication Server»).",
        tipo: "testo",
        obbligatorio: true,
        fase: "autenticazione",
      },
      {
        chiave: "clientId",
        etichetta: "Client ID dell'API account",
        aiuto: "Generato da Reporting and Analytics quando si crea l'API account di tipo «Simphony Transaction Services».",
        tipo: "testo",
        obbligatorio: true,
        fase: "autenticazione",
      },
      {
        chiave: "organizzazione",
        etichetta: "Organizzazione (Enterprise Short Name)",
        tipo: "testo",
        obbligatorio: true,
        fase: "autenticazione",
      },
      {
        chiave: "utente",
        etichetta: "Utente dell'API account",
        tipo: "testo",
        obbligatorio: true,
        fase: "autenticazione",
      },
      {
        chiave: "password",
        etichetta: "Password dell'API account",
        aiuto: "Serve solo per il primo accesso e non viene salvata: Foodtech conserva, cifrati, i token che Oracle rinnova. La password dell'API account scade dopo 60 giorni.",
        tipo: "segreto",
        obbligatorio: true,
      },
      {
        chiave: "destinazione",
        etichetta: "Location e revenue center",
        aiuto: "Dove arrivano i check di questo locale.",
        tipo: "scelta",
        obbligatorio: true,
        opzioniDa: "locations",
      },
      {
        chiave: "tipoOrdine",
        etichetta: "Tipo d'ordine",
        aiuto: "Dello stesso revenue center scelto sopra (per esempio «Eat In»).",
        tipo: "scelta",
        obbligatorio: true,
        opzioniDa: "order_types",
      },
      {
        chiave: "dipendente",
        etichetta: "Dipendente delle transazioni (numero oggetto)",
        aiuto: "Il dipendente dedicato alle transazioni API configurato in EMC: ogni check ne richiede uno (checkEmployeeRef).",
        tipo: "testo",
        obbligatorio: true,
      },
    ],
    cliente: {
      credenziali: "Ti serviranno i dati di accesso di Simphony che ti dà chi gestisce la cassa.",
      aiuto: {
        titolo: "Dove trovo questi dati?",
        paragrafi: [
          "Te li fornisce chi gestisce Simphony per il tuo ristorante: il reparto IT o il partner Oracle.",
          "Chiedi un accesso dedicato a Foodtech: riceverai Client ID, utente e password, insieme ai due indirizzi del vostro ambiente e al codice della vostra organizzazione.",
          "La password serve solo per collegarsi: Foodtech non la conserva.",
        ],
      },
      campi: {
        sts: { etichetta: "Indirizzo dell'ambiente Simphony", segnaposto: "https://…" },
        auth: { etichetta: "Indirizzo di accesso", segnaposto: "https://…" },
        organizzazione: { etichetta: "Codice organizzazione" },
        clientId: { etichetta: "Client ID" },
        utente: { etichetta: "Utente API" },
        password: { etichetta: "Password" },
        destinazione: { etichetta: "Sede", dividi: ["Sede", "Revenue center"] },
        tipoOrdine: { etichetta: "Tipo di servizio", aiuto: "Come arrivano in cassa gli ordini di Foodtech (per esempio «Al tavolo»).", filtraPer: "destinazione" },
        dipendente: {
          etichetta: "Numero del dipendente per Foodtech",
          aiuto: "Il dipendente di Simphony a cui intestare gli ordini di Foodtech. Chiedilo a chi gestisce la cassa.",
        },
      },
      titoloSede: "Sede e revenue center",
    },
    notaInstallazione:
      "Serve un ambiente Simphony Cloud con Transaction Services Gen2 attivo (opzione 74 del revenue center, workstation «POSAPI Client») e un API account dedicato a questo locale. Oracle non offre una sandbox pubblica.",
    messaggi: {
      AUTH_INVALID: {
        titolo: "Accesso a Simphony rifiutato",
        spiegazione: "Oracle non accetta Client ID, utente, password o organizzazione dell'API account, oppure la password è scaduta (dura 60 giorni) o l'account è bloccato per 30 minuti.",
      },
      AUTH_EXPIRED: {
        titolo: "Accesso a Simphony da rinnovare",
        spiegazione: "Oracle non rinnova più l'accesso (catena dei rinnovi interrotta o aggiornamento di Reporting and Analytics). Ricollegati con la password dell'API account.",
      },
      PERMISSION_DENIED: {
        titolo: "API account senza permesso",
        spiegazione: "L'API account non è autorizzato su questa organizzazione, location o revenue center (Authorization Scope in Reporting and Analytics).",
      },
      PROVIDER_UNAVAILABLE: {
        titolo: "Simphony non risponde",
        spiegazione: "STS Gen2 o il POS del revenue center non sono raggiungibili. Le comande restano in attesa e partono appena Simphony torna.",
      },
      INVALID_CONFIGURATION: {
        titolo: "Configurazione Simphony da rivedere",
        spiegazione: "Un indirizzo non è ammesso, oppure revenue center, tipo d'ordine o dipendente non esistono su Simphony.",
      },
    },
    dati: {
      legge: [
        "Organizzazione, location e revenue center autorizzati all'API account",
        "I tavoli e i tipi d'ordine del revenue center",
        "Menu: voci, definizioni, prezzi, famiglie, condimenti",
        "Voci non disponibili, tasse, tender, sconti e maggiorazioni",
        "Check: righe, totali calcolati da Simphony, tender, stato",
      ],
      scrive: [
        "Check nuovi al tavolo, solo se accendi «Invio ordini» (non ancora collegato alle comande)",
        "Round aggiunti allo stesso check",
      ],
      permessi: ["Client Scope e Authorization Scope dell'API account «Simphony Transaction Services»"],
    },
    documentazione: "https://docs.oracle.com/en/industries/food-beverage/simphony/omsstsg2api/",
    versioneAdattatore: "0.1.0",
    requisitiPiattaforma: [],
    mancaPerOperare: [
      "Un ambiente Simphony Cloud (di test) con STS Gen2 attivo, e il suo dominio aggiunto a ORACLE_SIMPHONY_DOMINI_CONSENTITI se non è oracleindustry.com.",
      "Un API account «Simphony Transaction Services» dedicato, con Client ID, utente e password.",
      "Una prova su quell'ambiente: check, round, calcolo, notifiche (TESTED_AGAINST_ORACLE_ENVIRONMENT).",
      "Una prova su un POS vero: stampa in cucina, pagamenti, chiusura (TESTED_REAL_POS) e, in Italia, documento commerciale e RT (TESTED_REAL_POS_ITALY).",
    ],
    risorse: [
      { risorsa: "Organizzazioni, location, revenue center", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "locations", verifica: "DOCUMENTATA", note: "Organization API: GET /organizations/…/locations/…/revenueCenters. Notifica OrganizationsNotification." },
      { risorsa: "Tavoli", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tables", verifica: "DOCUMENTATA", note: "RevenueCenter.tables: solo identificativi. Nessuna sala, nessun posto a sedere in STS Gen2." },
      { risorsa: "Voci di menu, definizioni, prezzi", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "GET /menus/summary e /menus/{menuId}. Ogni definizione si ordina con menuItemId + definitionSequence." },
      { risorsa: "Condimenti", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "Letti e mappati; non ancora inviati nelle comande. Un piatto con condimenti obbligatori non parte." },
      { risorsa: "Disponibilità delle voci", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "GET /menus/items/unavailable: solo lettura. Nessun endpoint per segnare un piatto esaurito." },
      { risorsa: "Tasse", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tax_rates", verifica: "DOCUMENTATA", note: "GET /taxes. Il calcolo lo fa Simphony." },
      { risorsa: "Tender", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "payment_methods", verifica: "DOCUMENTATA", note: "GET /tenders/collection: type payment o serviceTotal." },
      { risorsa: "Sconti e maggiorazioni", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "Letti; applicabili al check (discounts[], serviceCharges[]) ma non usati da Foodtech." },
      { risorsa: "Check: creazione e round", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FOODTECH_A_FORNITORE", fonteDiVerita: "FORNITORE", usataDa: "orders.write", verifica: "DA_VERIFICARE", note: "POST /checks e POST /checks/{checkRef}/round, con detect-duplicate-request e idempotencyId stabile. L'arrivo in cucina dipende dagli Order Devices della workstation POSAPI Client." },
      { risorsa: "Check: lettura e calcolo", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "orders.read", verifica: "DOCUMENTATA", note: "GET /checks (includeClosed), GET /checks/{checkRef}, POST /checks/calculator." },
      { risorsa: "Check: annullamento", api: { lettura: false, scrittura: true, webhook: false }, direzione: "FOODTECH_A_FORNITORE", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DA_VERIFICARE", note: "DELETE /checks/{checkRef}: «se in uno stato in cui l'annullamento è permesso»." },
      { risorsa: "Pagamenti (lettura)", api: { lettura: true, scrittura: false, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "payments.read", verifica: "DOCUMENTATA", note: "tenders[] e totals.paymentTotal dei check letti con GET /checks?includeClosed=true. Nessuna notifica di pagamento documentata." },
      { risorsa: "Pagamenti (tender sul check)", api: { lettura: true, scrittura: true, webhook: false }, direzione: "FOODTECH_A_FORNITORE", fonteDiVerita: "FORNITORE", usataDa: "payments.write", verifica: "DA_VERIFICARE", note: "tenders[] in un round. Il check è «closed» quando è pagato per intero. Implementato, non usato da nessuna schermata." },
      { risorsa: "Printed check", api: { lettura: true, scrittura: false, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DA_VERIFICARE", note: "GET /checks/{checkRef}/printed: testo a 40 colonne. Non è un documento fiscale." },
      { risorsa: "Documento commerciale / RT", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DA_VERIFICARE", note: "La guida STS Gen2 non parla di fiscalità italiana: da provare su un Simphony italiano reale." },
      { risorsa: "Dipendenti", api: { lettura: true, scrittura: false, webhook: true }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DOCUMENTATA", note: "GET /employees?EmployeeId: solo per verificare il dipendente delle transazioni." },
      { risorsa: "Split, merge, cambio tavolo", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "NESSUNA", usataDa: null, verifica: "NON_SUPPORTATA", note: "Nessun endpoint STS Gen2." },
    ],
  },
  pianificata({
    id: "int_icg",
    slug: "icg",
    nome: "ICG",
    fornitore: "ICG Software",
    categoria: "POS",
    descrizione: "Tavoli, prodotti e ordini dalla cassa ICG.",
    monogramma: "IC",
    modalita: "MANUAL",
  }),
  {
    id: "int_cassa_in_cloud",
    slug: "cassa-in-cloud",
    nome: "Cassa in Cloud",
    fornitore: "TeamSystem",
    categoria: "POS",
    descrizione: "Collega Foodtech alla cassa, agli ordini e ai dati del tuo punto vendita.",
    logo: { monogramma: "CC" },
    /*
      L'adattatore segue la documentazione ufficiale (api-doc.cassanova.com,
      letta il 23 settembre 2026) e non ha mai parlato con un account vero:
      le API esistono solo con le licenze Risto Enterprise o Retail
      Enterprise, e la chiave la rilascia Cassa in Cloud su richiesta.
      Resta IN_DEVELOPMENT finché non c'è quella prova.
    */
    implementazione: "IN_DEVELOPMENT",
    disponibilita: "PREVIEW",
    autenticazione: {
      modalita: "API_KEY",
      verificata: true,
      /* Nessuno scope da chiedere: la documentazione dice che i permessi
         (`scope`) sono decisi da Cassa in Cloud quando rilascia la chiave. */
    },
    capacita: ["locations", "tables", "menu", "tax_rates", "orders.read", "orders.write", "payments.read"],
    webhook: {
      eventi: [
        "ORDER/CREATE", "ORDER/EDIT", "ORDER/DELETE",
        "RECEIPT/CREATE", "BILL/CREATE",
        "PRODUCT/*", "CATEGORY/*", "TAX/*", "DEPARTMENT/*", "MODIFIER/*",
      ],
      autenticazione:
        "Firma HMAC-SHA1 di (segreto + corpo) nell'intestazione x-cn-signature; il segreto lo mostra Cassa in Cloud nel dettaglio del webhook.",
      configurazioneManuale: true,
    },
    configurazione: [
      {
        chiave: "apiKey",
        etichetta: "API Key Cassa in Cloud",
        aiuto:
          "La rilascia Cassa in Cloud (TeamSystem) per l'account del locale, secondo il piano e la configurazione del cliente.",
        tipo: "segreto",
        obbligatorio: true,
      },
      {
        chiave: "idSalesPoint",
        etichetta: "Punto vendita",
        aiuto: "Il punto vendita di Cassa in Cloud che corrisponde a questo locale.",
        tipo: "scelta",
        obbligatorio: true,
        opzioniDa: "locations",
      },
    ],
    cliente: {
      credenziali: "Ti servirà la API Key del tuo account Cassa in Cloud.",
      aiuto: {
        titolo: "Dove trovo la mia API Key?",
        paragrafi: [
          "La API Key la rilascia Cassa in Cloud per il tuo account: chiedila al tuo rivenditore o all'assistenza di Cassa in Cloud.",
          "È inclusa nei piani Cassa in Cloud che permettono di collegare altri programmi (Risto Enterprise e Retail Enterprise).",
          "Quando la ricevi, incollala qui. Resta protetta: nessuno potrà rileggerla, nemmeno da Foodtech.",
        ],
      },
      campi: {
        apiKey: { etichetta: "API Key", segnaposto: "Incolla qui la tua API Key" },
        idSalesPoint: { etichetta: "Punto vendita" },
      },
      titoloSede: "Punto vendita",
    },
    notaInstallazione:
      "Per collegare Cassa in Cloud è necessario un piano compatibile con l'accesso API (licenze Risto Enterprise o Retail Enterprise). La chiave API la rilascia Cassa in Cloud.",
    messaggi: {
      AUTH_INVALID: {
        titolo: "API Key non valida o non autorizzata",
        spiegazione: "Cassa in Cloud non riconosce la chiave salvata, o non la autorizza più. Controllala e inseriscila di nuovo.",
      },
      AUTH_EXPIRED: {
        titolo: "Credenziali Cassa in Cloud non valide o scadute",
        spiegazione: "La chiave API non è più autorizzata. Inseriscila di nuovo, o chiedine una nuova a Cassa in Cloud.",
      },
      PERMISSION_DENIED: {
        titolo: "Operazione non consentita",
        spiegazione: "Il piano o la chiave API non consente questa operazione, o il punto vendita non è abilitato per questa chiave.",
      },
      RATE_LIMITED: {
        titolo: "Troppe richieste",
        spiegazione: "Cassa in Cloud sta limitando temporaneamente le richieste. Riproviamo da soli fra qualche minuto.",
      },
      PROVIDER_UNAVAILABLE: {
        titolo: "Cassa in Cloud non risponde",
        spiegazione: "Il servizio non è raggiungibile in questo momento. Riproviamo da soli; puoi anche riprovare tu.",
      },
    },
    dati: {
      legge: [
        "I punti vendita abilitati per la chiave",
        "Sale e tavoli",
        "Categorie, prodotti con prezzo e listini (modalità di vendita)",
        "Aliquote IVA",
        "Ordini, e gli scontrini e i conti con i loro pagamenti",
      ],
      scrive: ["Gli ordini al tavolo, solo se accendi «Invio ordini» (non ancora collegato alle comande)"],
      permessi: ["Quelli concessi da Cassa in Cloud alla chiave API"],
    },
    documentazione: "https://api-doc.cassanova.com/",
    versioneAdattatore: "0.1.0",
    requisitiPiattaforma: [],
    mancaPerOperare: [
      "Una API Key vera, di un account con licenza Risto Enterprise o Retail Enterprise.",
      "Una prova completa: chiave, punti vendita, tavoli, prodotti, e un ordine al tavolo che compaia sulla cassa.",
      "I punti marcati DA VERIFICARE nella documentazione (docs/INTEGRATION-PLATFORM.md, sezione Cassa in Cloud).",
    ],
    risorse: [
      { risorsa: "Punti vendita", api: { lettura: true, scrittura: false, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "locations", verifica: "DOCUMENTATA", note: "GET /salespoint: solo quelli abilitati nella definizione della chiave." },
      { risorsa: "Sale", api: { lettura: true, scrittura: false, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tables", verifica: "DOCUMENTATA", note: "GET /risto/rooms. Nessuna scrittura documentata." },
      { risorsa: "Tavoli", api: { lettura: true, scrittura: false, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tables", verifica: "DOCUMENTATA", note: "GET /risto/tables (nome, posti, sala). Nessuna scrittura documentata." },
      { risorsa: "Categorie", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "La scrittura esiste nell'API; Foodtech non la usa: la cassa resta la fonte." },
      { risorsa: "Prodotti", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "Prezzi per modalità di vendita, varianti, modificatori, menu e composizioni." },
      { risorsa: "Listini (modalità di vendita)", api: { lettura: true, scrittura: true, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "GET /salesmodes." },
      { risorsa: "Modificatori (opzioni)", api: { lettura: true, scrittura: true, webhook: true }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DOCUMENTATA", note: "Arrivano dentro il prodotto; non ancora sincronizzati a parte." },
      { risorsa: "Aliquote IVA", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tax_rates", verifica: "DOCUMENTATA", note: "GET /taxes, `rate` già in percentuale." },
      { risorsa: "Reparti", api: { lettura: true, scrittura: true, webhook: true }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DOCUMENTATA", note: "Collegano prodotto e aliquota." },
      { risorsa: "Clienti", api: { lettura: true, scrittura: true, webhook: true }, direzione: "NESSUNA", fonteDiVerita: "NESSUNA", usataDa: null, verifica: "DOCUMENTATA", note: "Disponibili nell'API, non collegati: il CRM di Foodtech ha le sue regole di consenso." },
      { risorsa: "Ordini (lettura)", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "orders.read", verifica: "DOCUMENTATA", note: "GET /documents/orders (finestre di meno di 3 giorni, filtro per tavolo) e GET /documents/orders/:id. Nessun filtro per externalId." },
      { risorsa: "Ordini (creazione)", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FOODTECH_A_FORNITORE", fonteDiVerita: "FOODTECH", usataDa: "orders.write", verifica: "DA_VERIFICARE", note: "Solo CREAZIONE (POST /documents/orders/batch) e lettura. Nessun aggiornamento né chiusura documentati. Che un ordine esterno con deliveryMode TABLE compaia come comanda al tavolo sulla cassa è DA VERIFICARE." },
      { risorsa: "Pagamenti", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "payments.read", verifica: "DOCUMENTATA", note: "Solo dentro scontrini e conti (Document.payments). Scrivibile solo il prepagamento di un ordine (PUT /documents/orders/:id/prepayment)." },
      { risorsa: "Scontrini e conti (lettura)", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "payments.read", verifica: "DOCUMENTATA", note: "GET /documents/receipts e /documents/bills, con pagamenti e ordini collegati." },
      { risorsa: "Emissione del documento commerciale", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "NON_SUPPORTATA", note: "Nessun endpoint crea scontrini, conti o fatture: il documento lo emette la cassa (RT) quando l'operatore chiude il conto." },
      { risorsa: "Aggiornamento e chiusura ordine", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "NON_SUPPORTATA", note: "Nessun endpoint aggiorna righe o chiude un ordine; esiste solo PUT /documents/orders/:id/prepayment." },
      { risorsa: "Metodi di pagamento", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "NON_SUPPORTATA", note: "Nessun endpoint di elenco: esiste l'enum PaymentType e i CustomPayment arrivano dentro i pagamenti." },
      { risorsa: "Magazzino", api: { lettura: true, scrittura: true, webhook: true }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DOCUMENTATA", note: "Fuori ambito." },
      { risorsa: "Personale", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "NESSUNA", usataDa: null, verifica: "NON_SUPPORTATA", note: "Nessun endpoint del personale nella documentazione." },
    ],
  },
  {
    id: "int_tilby",
    slug: "tilby",
    nome: "Tilby",
    fornitore: "Tilby (Zucchetti)",
    categoria: "POS",
    descrizione: "Collega Foodtech al sistema di cassa Tilby per sincronizzare menu, tavoli e ordini.",
    logo: { monogramma: "Ti" },
    /*
      Adattatore scritto sul reference ufficiale (developer.tilby.com, OpenAPI
      di ogni endpoint) e sulla guida «Stampa automatica comande e scontrini»
      (PDF ufficiale, 5 aprile 2024). Mai provato: né in sandbox (serve il
      Developer Program) né su una cassa. Resta IN_DEVELOPMENT.
    */
    implementazione: "IN_DEVELOPMENT",
    disponibilita: "PREVIEW",
    autenticazione: {
      modalita: "TOKEN",
      verificata: true,
      /* Nessuno scope: i permessi li decide la certificazione del Client ID
         dell'integrazione, non la richiesta del token. */
    },
    capacita: [
      "locations", "tables", "menu", "tax_rates", "payment_methods", "customers",
      "orders.read", "orders.write", "payments.read", "payments.write",
    ],
    webhook: {
      eventi: [
        "sales/CREATED", "sales/UPDATED", "sales/CLOSED", "sales/DELETED",
        "items/CREATED", "items/UPDATED", "items/DELETED", "categories/UPDATED", "rooms/UPDATED",
      ],
      autenticazione:
        "Nessuna firma documentata: l'autenticità poggia sull'indirizzo segreto di ogni installazione (HTTPS). Registrati da Foodtech con POST /webhooks.",
    },
    configurazione: [
      {
        chiave: "token",
        etichetta: "Token statico Tilby",
        aiuto: "Lo genera Tilby per il negozio (sandbox o produzione) e lo consegna il proprietario del negozio. Vale per un solo negozio.",
        tipo: "segreto",
        obbligatorio: true,
      },
      {
        chiave: "ambiente",
        etichetta: "Ambiente",
        aiuto: "La sandbox è un negozio di prova di Tilby: niente di ciò che succede lì arriva su una cassa vera.",
        tipo: "scelta",
        obbligatorio: true,
        opzioni: [
          { value: "sandbox", label: "Sandbox Tilby (prova)" },
          { value: "production", label: "Produzione" },
        ],
      },
      {
        chiave: "shopId",
        etichetta: "Negozio Tilby",
        aiuto: "Il negozio a cui appartiene il token: è uno solo, e si conferma.",
        tipo: "scelta",
        obbligatorio: true,
        opzioniDa: "locations",
      },
    ],
    cliente: {
      credenziali: "Ti servirà il token di accesso del tuo negozio Tilby.",
      aiuto: {
        titolo: "Dove trovo il token?",
        paragrafi: [
          "Il token lo genera Tilby per il tuo negozio: chiedilo all'assistenza di Tilby o a chi gestisce il vostro account.",
          "Ogni token vale per un solo negozio. Se hai più negozi, collega ogni locale di Foodtech con il suo.",
        ],
      },
      campi: {
        token: { etichetta: "Token di accesso", segnaposto: "Incolla qui il token" },
        ambiente: {
          etichetta: "Tipo di negozio",
          passo: "accesso",
          avanzato: true,
          predefinito: "production",
          opzioni: { production: "Il mio negozio", sandbox: "Negozio di prova Tilby" },
        },
        shopId: { etichetta: "Negozio" },
      },
      titoloSede: "Negozio",
    },
    notaInstallazione:
      "L'accesso alle API di Tilby passa dal Developer Program: ogni richiesta è valutata da Tilby, l'uso delle API è a pagamento, e l'integrazione va certificata prima della produzione. Il token lo genera Tilby per il negozio.",
    messaggi: {
      AUTH_INVALID: {
        titolo: "Token Tilby non valido o revocato",
        spiegazione: "Tilby non riconosce il token salvato. Chiedi al proprietario del negozio un token nuovo e inseriscilo di nuovo.",
      },
      AUTH_EXPIRED: {
        titolo: "Token Tilby non più valido",
        spiegazione: "Il token del negozio è stato revocato o sostituito. Inseriscine uno nuovo.",
      },
      PERMISSION_DENIED: {
        titolo: "Operazione non consentita",
        spiegazione: "La certificazione dell'integrazione presso Tilby non comprende questa operazione.",
      },
      PROVIDER_UNAVAILABLE: {
        titolo: "Tilby non risponde",
        spiegazione: "Tilby non è temporaneamente disponibile. Le comande restano in attesa e partono appena torna.",
      },
    },
    dati: {
      legge: [
        "Il negozio del token",
        "Sale e tavoli",
        "Categorie, prodotti con reparto, aliquota e i dieci listini",
        "Aliquote IVA e metodi di pagamento",
        "Clienti (solo per l'abbinamento)",
        "Vendite: righe, pagamenti e documenti emessi",
      ],
      scrive: [
        "Le vendite aperte al tavolo, con stampa automatica della comanda, solo se accendi «Invio ordini» (non ancora collegato alle comande)",
        "Le aggiunte alla stessa vendita, con l'uscita successiva",
      ],
      permessi: ["Quelli della certificazione del Client ID presso Tilby"],
    },
    documentazione: "https://developer.tilby.com/",
    versioneAdattatore: "0.1.0",
    requisitiPiattaforma: [],
    mancaPerOperare: [
      "L'ammissione al Developer Program di Tilby e una sandbox.",
      "Una prova in sandbox di tutto il ciclo: vendita aperta al tavolo, aggiunte, pagamenti.",
      "La certificazione dell'integrazione presso Tilby (obbligatoria per la produzione).",
      "Una prova su una cassa vera: stampa della comanda nei centri di produzione e dello scontrino.",
    ],
    risorse: [
      { risorsa: "Negozio (sessione)", api: { lettura: true, scrittura: false, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "locations", verifica: "DOCUMENTATA", note: "GET /sessions/me: un token = un negozio." },
      { risorsa: "Sale e tavoli", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tables", verifica: "DOCUMENTATA", note: "GET /rooms con i tavoli dentro; la scrittura esiste (POST/PUT/DELETE /rooms), Foodtech non la usa." },
      { risorsa: "Prodotti, varianti, listini", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA", note: "GET /items: price1…price10 sono i listini, ognuno col suo reparto." },
      { risorsa: "Categorie", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "menu", verifica: "DOCUMENTATA" },
      { risorsa: "Aliquote IVA", api: { lettura: true, scrittura: true, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "tax_rates", verifica: "DOCUMENTATA", note: "GET /vat." },
      { risorsa: "Metodi di pagamento", api: { lettura: true, scrittura: true, webhook: false }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "payment_methods", verifica: "DOCUMENTATA", note: "GET /payment_methods: servono id e tipo per registrare un pagamento." },
      { risorsa: "Clienti", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "NESSUNA", usataDa: "customers", verifica: "DOCUMENTATA", note: "Solo anteprima per l'abbinamento: nessun dato scritto nel CRM di Foodtech." },
      { risorsa: "Vendite (lettura)", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "orders.read", verifica: "DOCUMENTATA", note: "GET /sales con filtri (external_id, uuid, status, date)." },
      { risorsa: "Vendite: creazione, aggiunte, cancellazione", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FOODTECH_A_FORNITORE", fonteDiVerita: "FOODTECH", usataDa: "orders.write", verifica: "DA_VERIFICARE", note: "POST /sales, PUT /sales/{id} (aggiunte con exit incrementata), DELETE /sales/{id}. La stampa in cucina richiede auto_print_order e una cassa con stampa automatica sempre connessa." },
      { risorsa: "Pagamenti (lettura)", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: "payments.read", verifica: "DOCUMENTATA", note: "payments[] della vendita; evento sales/CLOSED." },
      { risorsa: "Pagamenti (registrazione)", api: { lettura: true, scrittura: true, webhook: true }, direzione: "FOODTECH_A_FORNITORE", fonteDiVerita: "FORNITORE", usataDa: "payments.write", verifica: "DA_VERIFICARE", note: "payments[] con paid:true; pagamenti parziali e più metodi documentati. Implementato nell'adattatore, non usato da nessuna schermata." },
      { risorsa: "Scontrino / documento commerciale", api: { lettura: true, scrittura: false, webhook: true }, direzione: "FORNITORE_A_FOODTECH", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DA_VERIFICARE", note: "Nessun endpoint lo crea: lo stampa la cassa Tilby quando i pagamenti coprono il totale e la stampa automatica è attiva. Si legge da sale_documents[]." },
      { risorsa: "Stampanti e centri di produzione", api: { lettura: true, scrittura: true, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DOCUMENTATA", note: "GET /printers; la destinazione in cucina la decide la configurazione del negozio." },
      { risorsa: "Ordini (/orders)", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "NESSUNA", usataDa: null, verifica: "NON_SUPPORTATA", note: "Deprecato dal 1° luglio 2024: si usa /sales." },
      { risorsa: "Personale", api: { lettura: false, scrittura: false, webhook: false }, direzione: "NESSUNA", fonteDiVerita: "NESSUNA", usataDa: null, verifica: "NON_SUPPORTATA", note: "Nessun endpoint del personale." },
      { risorsa: "Magazzino", api: { lettura: true, scrittura: true, webhook: true }, direzione: "NESSUNA", fonteDiVerita: "FORNITORE", usataDa: null, verifica: "DOCUMENTATA", note: "Fuori ambito." },
    ],
  },
  pianificata({
    id: "int_passepartout",
    slug: "passepartout",
    nome: "Passepartout",
    fornitore: "Passepartout",
    categoria: "POS",
    descrizione: "Prodotti e vendite dal gestionale Passepartout.",
    monogramma: "Pp",
    modalita: "MANUAL",
  }),
  pianificata({
    id: "int_zucchetti",
    slug: "zucchetti",
    nome: "Zucchetti",
    fornitore: "Zucchetti",
    categoria: "POS",
    descrizione: "Prodotti, tavoli e ordini dalle casse Zucchetti.",
    monogramma: "Zu",
    modalita: "MANUAL",
  }),

  /* --------------------------- PAGAMENTI -------------------------------- */
  {
    id: "int_stripe",
    slug: "stripe",
    nome: "Stripe",
    fornitore: "Stripe",
    categoria: "PAGAMENTI",
    descrizione: "Caparre e pagamento al tavolo col QR, direttamente sul conto del ristorante.",
    logo: { monogramma: "St" },
    /*
      L'unica voce IMPLEMENTED, ed è vera: è Stripe Connect di
      `server/stripe-connect.ts`, in produzione da settembre 2026 con le
      caparre e il conto al tavolo. Non passa dall'adattatore generico — ha la
      sua pagina, e il catalogo porta lì (`nativa`). Rifarlo qui vorrebbe dire
      due modi di collegare lo stesso conto.
    */
    implementazione: "IMPLEMENTED",
    disponibilita: "AVAILABLE",
    autenticazione: { modalita: "NATIVE", verificata: true },
    capacita: ["charges"],
    webhook: { eventi: ["checkout.session.completed", "account.updated"], autenticazione: "Firma Stripe" },
    configurazione: [],
    dati: {
      legge: ["Lo stato dell'account (se accetta incassi)"],
      scrive: ["Le sessioni di pagamento di caparre e conti"],
      permessi: ["Account Stripe Connect del ristorante"],
    },
    documentazione: "https://docs.stripe.com/connect",
    versioneAdattatore: null,
    requisitiPiattaforma: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    mancaPerOperare: [],
    nativa: { href: "/settings/pagamenti" },
  },
  pianificata({
    id: "int_adyen",
    slug: "adyen",
    nome: "Adyen",
    fornitore: "Adyen",
    categoria: "PAGAMENTI",
    descrizione: "Incassi online e al tavolo sul conto Adyen del ristorante.",
    monogramma: "Ad",
    modalita: "API_KEY",
    documentazione: "https://docs.adyen.com/",
  }),
  pianificata({
    id: "int_google_pay",
    slug: "google-pay",
    nome: "Google Pay",
    fornitore: "Google",
    categoria: "PAGAMENTI",
    descrizione: "Pagare caparre e conti con Google Pay.",
    monogramma: "GP",
    modalita: "NATIVE",
    manca: [
      "Una verifica: nei pagamenti via Stripe Checkout Google Pay compare secondo le impostazioni dell'account Stripe, ma nessuno l'ha controllato su Foodtech.",
    ],
  }),
  pianificata({
    id: "int_apple_pay",
    slug: "apple-pay",
    nome: "Apple Pay",
    fornitore: "Apple",
    categoria: "PAGAMENTI",
    descrizione: "Pagare caparre e conti con Apple Pay.",
    monogramma: "AP",
    modalita: "NATIVE",
    manca: [
      "Una verifica: Apple Pay su Stripe Checkout richiede il dominio verificato presso Apple, e su Foodtech non è stato fatto.",
    ],
  }),
  pianificata({
    id: "int_paynopain",
    slug: "paynopain",
    nome: "PaynoPain",
    fornitore: "PaynoPain",
    categoria: "PAGAMENTI",
    descrizione: "Incassi e caparre con PaynoPain.",
    monogramma: "PnP",
    modalita: "API_KEY",
  }),

  /* -------------------- PRENOTAZIONI / CHANNEL MANAGER ------------------ */
  pianificata({
    id: "int_google_reserve",
    slug: "google",
    nome: "Prenota con Google",
    fornitore: "Google",
    categoria: "PRENOTAZIONI",
    descrizione: "Il pulsante «Prenota» sulla scheda Google del ristorante.",
    monogramma: "G",
    modalita: "MANUAL",
    documentazione: "https://developers.google.com/actions-center",
    manca: ["L'adesione di Foodtech come partner del Google Actions Center.", SERVE_ADATTATORE],
  }),
  pianificata({
    id: "int_google_maps",
    slug: "google-maps",
    nome: "Google Maps",
    fornitore: "Google",
    categoria: "PRENOTAZIONI",
    descrizione: "Prenotazioni dalla scheda del locale su Google Maps.",
    monogramma: "GM",
    modalita: "MANUAL",
    manca: ["L'adesione di Foodtech come partner del Google Actions Center.", SERVE_ADATTATORE],
  }),
  pianificata({
    id: "int_facebook",
    slug: "facebook",
    nome: "Facebook",
    fornitore: "Meta",
    categoria: "PRENOTAZIONI",
    descrizione: "Il pulsante di prenotazione sulla pagina Facebook del locale.",
    monogramma: "Fb",
    modalita: "OAUTH2",
  }),
  pianificata({
    id: "int_instagram",
    slug: "instagram",
    nome: "Instagram",
    fornitore: "Meta",
    categoria: "PRENOTAZIONI",
    descrizione: "Il pulsante «Prenota» sul profilo Instagram del locale.",
    monogramma: "Ig",
    modalita: "OAUTH2",
  }),
  pianificata({
    id: "int_opentable",
    slug: "opentable",
    nome: "OpenTable",
    fornitore: "OpenTable",
    categoria: "PRENOTAZIONI",
    descrizione: "Le prenotazioni arrivate da OpenTable, in agenda con le altre.",
    monogramma: "OT",
    modalita: "OAUTH2",
  }),
  pianificata({
    id: "int_resy",
    slug: "resy",
    nome: "Resy",
    fornitore: "Resy",
    categoria: "PRENOTAZIONI",
    descrizione: "Le prenotazioni arrivate da Resy, in agenda con le altre.",
    monogramma: "Re",
    modalita: "API_KEY",
  }),
  pianificata({
    id: "int_amadeus",
    slug: "amadeus",
    nome: "Amadeus",
    fornitore: "Amadeus",
    categoria: "PRENOTAZIONI",
    descrizione: "Prenotazioni dai sistemi di viaggio e hotel Amadeus.",
    monogramma: "Am",
    modalita: "MANUAL",
  }),
  pianificata({
    id: "int_simple_night",
    slug: "simple-night",
    nome: "Simple Night",
    fornitore: "Simple Night",
    categoria: "PRENOTAZIONI",
    descrizione: "Prenotazioni dalla piattaforma Simple Night.",
    monogramma: "SN",
    modalita: "MANUAL",
  }),
  pianificata({
    id: "int_petal_maps",
    slug: "petal-maps",
    nome: "Petal Maps",
    fornitore: "Huawei",
    categoria: "PRENOTAZIONI",
    descrizione: "Prenotazioni dalla scheda del locale su Petal Maps.",
    monogramma: "PM",
    modalita: "MANUAL",
  }),

  /* ---------------------------- MARKETING ------------------------------- */
  pianificata({
    id: "int_mailchimp",
    slug: "mailchimp",
    nome: "Mailchimp",
    fornitore: "Intuit Mailchimp",
    categoria: "MARKETING",
    descrizione: "I clienti con consenso nel pubblico Mailchimp del ristorante.",
    monogramma: "Mc",
    modalita: "OAUTH2",
    documentazione: "https://mailchimp.com/developer/",
  }),
  pianificata({
    id: "int_brevo",
    slug: "brevo",
    nome: "Brevo",
    fornitore: "Brevo",
    categoria: "MARKETING",
    descrizione: "I clienti con consenso nelle liste Brevo del ristorante.",
    monogramma: "Br",
    modalita: "API_KEY",
    documentazione: "https://developers.brevo.com/",
    /* Da non confondere con il Brevo che Foodtech usa per spedire: quello è
       un account della piattaforma (`server/marketing/brevo-adapter.ts`).
       Questa voce è l'account **del ristorante**, e non esiste ancora. */
    manca: [
      "L'adattatore per l'account Brevo del ristorante. Quello che esiste (server/marketing/brevo-adapter.ts) è l'account con cui spedisce Foodtech, non quello del locale.",
    ],
  }),

  /* ---------------------------- ANALYTICS ------------------------------- */
  pianificata({
    id: "int_ga4",
    slug: "ga4",
    nome: "Google Analytics 4",
    fornitore: "Google",
    categoria: "ANALYTICS",
    descrizione: "Le prenotazioni dal sito come conversioni in Analytics.",
    monogramma: "GA",
    modalita: "MANUAL",
    documentazione: "https://developers.google.com/analytics/devguides/collection/protocol/ga4",
    manca: ["L'invio degli eventi dal widget di prenotazione.", SERVE_PROVA],
  }),
  pianificata({
    id: "int_gtm",
    slug: "gtm",
    nome: "Google Tag Manager",
    fornitore: "Google",
    categoria: "ANALYTICS",
    descrizione: "Il contenitore Tag Manager del ristorante dentro il widget.",
    monogramma: "GTM",
    modalita: "MANUAL",
    documentazione: "https://developers.google.com/tag-platform/tag-manager",
    manca: ["Il caricamento del contenitore nel widget di prenotazione, con il consenso ai cookie.", SERVE_PROVA],
  }),

  /* ------------------------------- CRM ---------------------------------- */
  pianificata({
    id: "int_salesforce",
    slug: "salesforce",
    nome: "Salesforce",
    fornitore: "Salesforce",
    categoria: "CRM",
    descrizione: "Ospiti e visite nell'organizzazione Salesforce del gruppo.",
    monogramma: "SF",
    modalita: "OAUTH2",
    documentazione: "https://developer.salesforce.com/docs",
  }),

  /* ---------------------------- TELEFONIA ------------------------------- */
  pianificata({
    id: "int_jusan",
    slug: "jusan",
    nome: "Jusan",
    fornitore: "Jusan",
    categoria: "TELEFONIA",
    descrizione: "Le chiamate del centralino Jusan, con la scheda di chi chiama.",
    monogramma: "Ju",
    modalita: "MANUAL",
  }),
  pianificata({
    id: "int_gamma",
    slug: "gamma",
    nome: "Gamma",
    fornitore: "Gamma",
    categoria: "TELEFONIA",
    descrizione: "Le chiamate del centralino Gamma, con la scheda di chi chiama.",
    monogramma: "Ga",
    modalita: "MANUAL",
  }),
];

/* -------------------------------------------------------------------------- */
/*  Letture                                                                   */
/* -------------------------------------------------------------------------- */

const PER_SLUG = new Map(CATALOGO.map((v) => [v.slug, v]));

export function voceDi(slug: string): VoceCatalogo | null {
  return PER_SLUG.get(slug) ?? null;
}

/**
 * Solo per le prove: una voce finta, per far girare l'intero percorso con un
 * adattatore finto (`registraAdattatorePerProve`). Non entra in `CATALOGO`,
 * quindi non compare nell'interfaccia; e rifiuta gli slug veri, così una
 * prova non può ridefinire Lightspeed.
 */
export function registraVocePerProve(v: VoceCatalogo): () => void {
  if (process.env.NODE_ENV === "production") throw new Error("solo_nelle_prove");
  if (!v.slug.startsWith("prova-")) throw new Error("slug_di_prova_obbligatorio");
  PER_SLUG.set(v.slug, v);
  return () => PER_SLUG.delete(v.slug);
}

/**
 * Se le variabili della piattaforma che questa voce richiede ci sono.
 *
 * Restituisce **i nomi** di quelle che mancano, mai i valori: la risposta
 * finisce in una schermata, e un valore di una chiave in una schermata è una
 * chiave consegnata.
 */
export function requisitiMancanti(voce: VoceCatalogo, env: NodeJS.ProcessEnv = process.env): string[] {
  return voce.requisitiPiattaforma.filter((nome) => !env[nome]?.trim());
}
