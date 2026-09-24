import type { VoceCatalogo } from "./registry";
import type { FaseRilascio } from "./certificazione/livelli";
import { richiedeAccessoBeta } from "./certificazione/livelli";
import type { Capacita, CampoConfigurazione, Categoria, Salute, StatoInstallazione } from "./tipi";

/**
 * **L'integrazione vista dal ristoratore.** Funzioni pure.
 *
 * Internamente una voce ha molti stati — implementazione, disponibilità,
 * fase di rilascio, livello di certificazione, accesso beta, stato
 * dell'installazione, salute — e servono tutti a Foodtech. Al cliente ne
 * arrivano cinque, e un pulsante:
 *
 * | stato            | quando                                                      |
 * | ---------------- | ----------------------------------------------------------- |
 * | `DISPONIBILE`    | aperta a tutti (disponibilità generale)                      |
 * | `ANTEPRIMA`      | installabile solo in beta, o nelle beta                      |
 * | `COLLEGATA`      | installata e in salute                                       |
 * | `ATTENZIONE`     | installata, ma qualcosa va fatto (ricollegare, riattivare…)  |
 * | `PROSSIMAMENTE`  | nessun adattatore: solo catalogo                              |
 *
 * Nessuna parola di qui — PREVIEW, PRIVATE_BETA, TESTED_WITH_FIXTURE,
 * adattatore — esce verso il browser del cliente: la vista
 * (`vista-cliente.ts`) manda solo il risultato di queste funzioni, e un test
 * (`integrazioni-esperienza-cliente`) lo controlla sul JSON serializzato.
 */

export type StatoCliente = "DISPONIBILE" | "ANTEPRIMA" | "COLLEGATA" | "ATTENZIONE" | "PROSSIMAMENTE";

export const ETICHETTA_STATO_CLIENTE: Record<StatoCliente, string> = {
  DISPONIBILE: "Disponibile",
  ANTEPRIMA: "In anteprima",
  COLLEGATA: "Collegata",
  ATTENZIONE: "Richiede attenzione",
  PROSSIMAMENTE: "Prossimamente",
};

/**
 * Il pulsante della scheda. `RIPRENDI` è un collegamento iniziato e non
 * finito; `RICHIESTA_INVIATA` e `AVVISO_ATTIVO` sono lo stesso pulsante dopo
 * il clic, spento, perché chiedere due volte non serve a niente.
 */
export type AzioneCliente =
  | "COLLEGA"
  | "RIPRENDI"
  | "GESTISCI"
  | "RICHIEDI_ATTIVAZIONE"
  | "RICHIESTA_INVIATA"
  | "AVVISAMI"
  | "AVVISO_ATTIVO";

export type TipoRichiesta = "ACCESS" | "NOTIFY";
export type StatoRichiesta = "PENDING" | "APPROVED" | "DISMISSED";

/** Perché questa voce non si installa, per la parte tecnica (`motivoNonInstallabile`). */
export type MotivoTecnico = "native" | "coming_soon" | "platform_not_configured" | "encryption_unavailable" | null;

export type IngressoStato = {
  nativa: { collegata: boolean } | null;
  motivoTecnico: MotivoTecnico;
  fase: FaseRilascio;
  betaAbilitata: boolean;
  installazione: { status: StatoInstallazione; salute: Salute; sospesa: boolean } | null;
  richiesta: { kind: TipoRichiesta; status: StatoRichiesta } | null;
};

export type EsitoStato = {
  stato: StatoCliente;
  azione: AzioneCliente;
  /**
   * Foodtech non ha ancora ciò che serve dalla sua parte (il client OAuth
   * presso il fornitore, la custodia delle credenziali): al cliente non si
   * mostra il modulo, ma «in fase di attivazione».
   */
  inAttivazione: boolean;
};

/** Gli stati in cui un collegamento è iniziato ma non finito: si riprende dal wizard. */
export const NEL_WIZARD = new Set<StatoInstallazione>(["INSTALLING", "NEEDS_CONFIGURATION", "CONNECTED"]);

export function statoPerIlCliente(x: IngressoStato): EsitoStato {
  const no = { inAttivazione: false };

  if (x.nativa) {
    return x.nativa.collegata ? { stato: "COLLEGATA", azione: "GESTISCI", ...no } : { stato: "DISPONIBILE", azione: "COLLEGA", ...no };
  }

  const base: StatoCliente = x.fase === "GENERAL_AVAILABILITY" ? "DISPONIBILE" : "ANTEPRIMA";
  const i = x.installazione;
  if (i && i.status !== "NOT_INSTALLED") {
    if (i.sospesa) return { stato: "ATTENZIONE", azione: "GESTISCI", ...no };
    if (NEL_WIZARD.has(i.status)) return { stato: base, azione: "RIPRENDI", ...no };
    if (
      i.status === "REAUTH_REQUIRED" ||
      i.status === "ERROR" ||
      i.status === "DISABLED" ||
      i.salute === "DEGRADED" ||
      i.salute === "ERROR" ||
      i.salute === "AUTH_REQUIRED"
    ) {
      return { stato: "ATTENZIONE", azione: "GESTISCI", ...no };
    }
    return { stato: "COLLEGATA", azione: "GESTISCI", ...no };
  }

  const inviata = (k: TipoRichiesta) => x.richiesta?.kind === k && x.richiesta.status === "PENDING";

  if (x.motivoTecnico === "coming_soon") {
    return { stato: "PROSSIMAMENTE", azione: inviata("NOTIFY") ? "AVVISO_ATTIVO" : "AVVISAMI", ...no };
  }
  if (x.motivoTecnico === "platform_not_configured" || x.motivoTecnico === "encryption_unavailable") {
    return { stato: base, azione: inviata("ACCESS") ? "RICHIESTA_INVIATA" : "RICHIEDI_ATTIVAZIONE", inAttivazione: true };
  }
  if (richiedeAccessoBeta(x.fase) && !x.betaAbilitata) {
    return { stato: "ANTEPRIMA", azione: inviata("ACCESS") ? "RICHIESTA_INVIATA" : "RICHIEDI_ATTIVAZIONE", ...no };
  }
  return { stato: base, azione: "COLLEGA", ...no };
}

/* -------------------------------------------------------------------------- */
/*  Categorie, dette come le dice un ristoratore                              */
/* -------------------------------------------------------------------------- */

export const CATEGORIA_CLIENTE: Record<Categoria, string> = {
  POS: "Cassa e POS",
  PAGAMENTI: "Pagamenti",
  PRENOTAZIONI: "Prenotazioni e portali",
  MARKETING: "Marketing",
  ANALYTICS: "Statistiche",
  CRM: "Clienti",
  PMS: "Hotel",
  TELEFONIA: "Telefonia",
  FISCALE: "Fiscale",
  DELIVERY: "Delivery",
  ALTRO: "Altro",
};

/* -------------------------------------------------------------------------- */
/*  Che cosa sincronizzare: gruppi al posto delle capacità                    */
/* -------------------------------------------------------------------------- */

/**
 * Le capacità della piattaforma sono sedici e parlano da sviluppatori
 * («payments.read», «tax_rates»). Il cliente sceglie fra pochi interruttori,
 * ognuno dei quali accende le capacità che servono **e che il fornitore
 * offre davvero**: un gruppo senza capacità offerte non si mostra.
 *
 * Restano fuori di proposito:
 * - `orders.write` — l'invio delle comande alla cassa non è ancora collegato
 *   alla sala (`fornitore-integrazione.ts`): un interruttore che non fa niente
 *   sarebbe una promessa falsa;
 * - `payments.write`, `close_order` — possono avere un effetto fiscale, e si
 *   provano solo dalla console di certificazione;
 * - `customers` — l'anagrafica ha le sue regole di consenso.
 *
 * Quelle accese da Foodtech restano accese quando il cliente salva i suoi
 * interruttori (`capacitaDaGruppi`).
 */
export type GruppoSync = {
  chiave: string;
  etichetta: string;
  descrizione: string;
  /** La riga «Con questa integrazione puoi…». */
  vantaggio: string;
  capacita: Capacita[];
};

export const GRUPPI_SYNC: GruppoSync[] = [
  {
    chiave: "tavoli",
    etichetta: "Tavoli",
    descrizione: "Sale e tavoli della cassa, collegati a quelli di Foodtech.",
    vantaggio: "Sincronizzare sale e tavoli",
    capacita: ["tables"],
  },
  {
    chiave: "menu",
    etichetta: "Menu e prodotti",
    descrizione: "Categorie, prodotti e prezzi della cassa.",
    vantaggio: "Importare menu e prodotti",
    capacita: ["menu", "tax_rates"],
  },
  {
    chiave: "ordini",
    etichetta: "Ordini",
    descrizione: "Gli ordini registrati in cassa.",
    vantaggio: "Collegare gli ordini della cassa",
    capacita: ["orders.read"],
  },
  {
    chiave: "vendite",
    etichetta: "Vendite e pagamenti",
    descrizione: "Incassi e metodi di pagamento.",
    vantaggio: "Sincronizzare i dati di vendita",
    capacita: ["payments.read", "payment_methods"],
  },
];

/** Accese sempre, se il fornitore le ha: senza le sedi non si sceglie il punto vendita. */
const SEMPRE: Capacita[] = ["locations"];

/** Tutte le capacità che il cliente può toccare dai suoi interruttori. */
const DEL_CLIENTE = new Set<Capacita>([...SEMPRE, ...GRUPPI_SYNC.flatMap((g) => g.capacita)]);

export function gruppiDi(offerte: readonly string[]): GruppoSync[] {
  return GRUPPI_SYNC.filter((g) => g.capacita.some((c) => offerte.includes(c)));
}

/** Gli interruttori accesi, da ciò che è acceso sull'installazione. */
export function gruppiAccesi(offerte: readonly string[], accese: readonly string[]): string[] {
  return gruppiDi(offerte)
    .filter((g) => g.capacita.some((c) => offerte.includes(c) && accese.includes(c)))
    .map((g) => g.chiave);
}

/**
 * Dagli interruttori alle capacità da salvare: quelle dei gruppi scelti che
 * il fornitore offre, le sedi, e — intatte — quelle fuori dalla portata del
 * cliente che erano già accese. Un gruppo sconosciuto si ignora.
 */
export function capacitaDaGruppi(offerte: readonly string[], gruppi: readonly string[], attuali: readonly string[] = []): Capacita[] {
  const scelte = new Set<Capacita>();
  for (const g of GRUPPI_SYNC) {
    if (!gruppi.includes(g.chiave)) continue;
    for (const c of g.capacita) if (offerte.includes(c)) scelte.add(c);
  }
  if (scelte.size) for (const c of SEMPRE) if (offerte.includes(c)) scelte.add(c);
  for (const c of attuali) {
    if (!DEL_CLIENTE.has(c as Capacita) && offerte.includes(c)) scelte.add(c as Capacita);
  }
  return [...scelte];
}

/* -------------------------------------------------------------------------- */
/*  La voce per il cliente                                                    */
/* -------------------------------------------------------------------------- */

export type CampoCliente = {
  chiave: string;
  etichetta: string;
  aiuto: string | null;
  segnaposto: string | null;
  tipo: CampoConfigurazione["tipo"];
  obbligatorio: boolean;
  opzioniDa: CampoConfigurazione["opzioniDa"] | null;
  opzioni: { value: string; label: string }[] | null;
  avanzato: boolean;
  predefinito: string | null;
  dividi: [string, string] | null;
  filtraPer: string | null;
};

export type VoceCliente = {
  slug: string;
  nome: string;
  categoria: string;
  descrizione: string;
  monogramma: string;
  /** Come si entra: la pagina del fornitore (`oauth`), un modulo, o la pagina Foodtech che lo gestisce già. */
  accesso: "oauth" | "modulo" | "nativa";
  hrefNativa: string | null;
  vantaggi: string[];
  credenziali: string | null;
  aiuto: { titolo: string; paragrafi: string[] } | null;
  /** Il primo passo del wizard. */
  campiAccesso: CampoCliente[];
  /** Il passo della sede (e ciò che va con lei). */
  campiSede: CampoCliente[];
  titoloSede: string;
  gruppi: { chiave: string; etichetta: string; descrizione: string }[];
  /** Cassa in Cloud: gli aggiornamenti istantanei si attivano dal pannello del fornitore. */
  aggiornamentiManuali: boolean;
};

function campoCliente(c: CampoConfigurazione, voce: VoceCatalogo): CampoCliente {
  const p = voce.cliente?.campi?.[c.chiave];
  return {
    chiave: c.chiave,
    etichetta: p?.etichetta ?? c.etichetta,
    // L'aiuto tecnico del catalogo non passa: solo quello scritto per il cliente.
    aiuto: p?.aiuto ?? null,
    segnaposto: p?.segnaposto ?? null,
    tipo: c.tipo,
    obbligatorio: c.obbligatorio,
    opzioniDa: c.opzioniDa ?? null,
    opzioni: c.opzioni ? c.opzioni.map((o) => ({ value: o.value, label: p?.opzioni?.[o.value] ?? o.label })) : null,
    avanzato: !!p?.avanzato,
    predefinito: p?.predefinito ?? null,
    dividi: p?.dividi ?? null,
    filtraPer: p?.filtraPer ?? null,
  };
}

/** Il campo va nel primo passo: segreti, dati di accesso, e ciò che la presentazione chiede lì. */
export function eCampoDiAccesso(c: CampoConfigurazione, voce: VoceCatalogo): boolean {
  return c.tipo === "segreto" || c.fase === "autenticazione" || voce.cliente?.campi?.[c.chiave]?.passo === "accesso";
}

export function vistaVoceCliente(voce: VoceCatalogo): VoceCliente {
  const gruppi = gruppiDi(voce.capacita);
  return {
    slug: voce.slug,
    nome: voce.nome,
    categoria: CATEGORIA_CLIENTE[voce.categoria],
    descrizione: voce.descrizione,
    monogramma: voce.logo.monogramma,
    accesso: voce.nativa ? "nativa" : voce.autenticazione.modalita === "OAUTH2" ? "oauth" : "modulo",
    hrefNativa: voce.nativa?.href ?? null,
    vantaggi: gruppi.map((g) => g.vantaggio),
    credenziali: voce.cliente?.credenziali ?? null,
    aiuto: voce.cliente?.aiuto ?? null,
    campiAccesso: voce.configurazione.filter((c) => eCampoDiAccesso(c, voce)).map((c) => campoCliente(c, voce)),
    campiSede: voce.configurazione.filter((c) => !eCampoDiAccesso(c, voce)).map((c) => campoCliente(c, voce)),
    titoloSede: voce.cliente?.titoloSede ?? "Sede",
    gruppi: gruppi.map((g) => ({ chiave: g.chiave, etichetta: g.etichetta, descrizione: g.descrizione })),
    aggiornamentiManuali: !!voce.webhook.configurazioneManuale,
  };
}

/* -------------------------------------------------------------------------- */
/*  L'installazione per il cliente                                            */
/* -------------------------------------------------------------------------- */

/** Una parola sola per ciò che il cliente deve sapere dell'installazione. */
export type Condizione =
  | "in_configurazione"
  | "attiva"
  | "in_sincronizzazione"
  | "da_controllare"
  | "da_ricollegare"
  | "errore"
  | "in_pausa"
  | "sospesa";

export function condizioneDi(status: StatoInstallazione, salute: Salute, sospesa: boolean): Condizione {
  if (sospesa) return "sospesa";
  if (NEL_WIZARD.has(status)) return "in_configurazione";
  if (status === "REAUTH_REQUIRED") return "da_ricollegare";
  if (status === "ERROR") return "errore";
  if (status === "DISABLED") return "in_pausa";
  if (salute === "DEGRADED" || salute === "ERROR") return "da_controllare";
  if (status === "SYNCING") return "in_sincronizzazione";
  return "attiva";
}

/**
 * Da quale passo del wizard si riprende (0 accesso, 1 verifica, 2 sede,
 * 3 sincronizzazione). Lo decide lo stato sul server, non la memoria del
 * browser: chi chiude la scheda a metà riparte da dove era.
 */
export function passoDaRiprendere(i: { status: StatoInstallazione; credenzialiPresenti: boolean }): number {
  if (i.status === "INSTALLING" || i.status === "REAUTH_REQUIRED" || !i.credenzialiPresenti) return 0;
  // Da configurare: si rilegge dal fornitore (verifica) e si sceglie la sede.
  if (i.status === "NEEDS_CONFIGURATION") return 1;
  // Provata (CONNECTED) o già attiva e riaperta: resta da scegliere cosa sincronizzare.
  return 3;
}

/* -------------------------------------------------------------------------- */
/*  La prova di connessione, detta al cliente                                 */
/* -------------------------------------------------------------------------- */

type EsitoProva =
  | { ok: true; account: string | null; sede: string | null; avvisi: string[]; avvisiGruppo: string[] }
  | { ok: false; titolo: string; spiegazione: string; azione: string | null; correlationId: string };

/**
 * Gli avvisi dell'adattatore («STS risponde, ma…», «connectionStatus») e il
 * riferimento di correlazione restano nel registro e nella console: al
 * cliente arrivano solo quelli scritti per lui (la sede condivisa nel
 * gruppo), e un segno che c'è qualcosa da controllare.
 */
export function provaPerIlCliente(e: EsitoProva) {
  return e.ok
    ? { ok: true as const, account: e.account, sede: e.sede, avvisi: e.avvisiGruppo, daControllare: e.avvisi.length > e.avvisiGruppo.length }
    : { ok: false as const, titolo: e.titolo, spiegazione: e.spiegazione, azione: e.azione };
}
