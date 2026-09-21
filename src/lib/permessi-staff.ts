import type { StaffPrimaryRole, StaffRole } from "@prisma/client";
import { ROLE_DEPARTMENT } from "./staff-roles";

/**
 * **Chi può fare cosa nella Staff App.**
 *
 * ## Perché non basta `abilities.ts`
 *
 * `can(role, ability)` decide sul **ruolo d'accesso** (`StaffRole`: manager,
 * reception, cameriere, marketing, sola lettura). Sono cinque valori, pensati
 * per il back office: dicono se una persona può toccare le impostazioni del
 * locale o leggere gli incassi.
 *
 * Durante il servizio la domanda è un'altra, e la fa una persona che ha un
 * **mestiere**: un runner e un chef de rang hanno lo stesso `StaffRole`
 * (`WAITER`) e non fanno le stesse cose — uno porta i piatti, l'altro apre e
 * chiude i conti. Un sous-chef e un cameriere possono avere entrambe
 * l'etichetta `WAITER` per come è stato creato l'account, e non devono
 * vedere nemmeno la stessa homepage.
 *
 * Quindi qui la matrice è per `StaffPrimaryRole` — il mestiere, sedici valori,
 * quelli che il locale sceglie nella scheda del dipendente. Aggiungere
 * «bar manager» domani costa **una riga qui**, non una `if` sparsa in tre
 * componenti. È esattamente quello che chiede il §33 del brief: niente
 * `if (role === "waiter")`.
 *
 * ## Come si compongono i due livelli
 *
 * Non si sostituiscono, si **intersecano**, e l'ordine conta:
 *
 * 1. il mestiere (`StaffPrimaryRole`) dice cosa quella figura fa in servizio;
 * 2. il ruolo d'accesso (`StaffRole`) può solo **togliere**, mai aggiungere —
 *    tranne `MANAGER`, che vede e fa tutto perché è chi risponde del locale;
 * 3. `READ_ONLY` toglie ogni permesso di scrittura, qualunque sia il mestiere.
 *
 * Il senso della regola 2: un locale che ha messo un cameriere in sola
 * lettura l'ha fatto apposta, e il mestiere non deve poter scavalcare quella
 * decisione. Il contrario — un mestiere che concede più di quanto l'account
 * permetta — sarebbe un buco: basterebbe scrivere «maître» nella scheda per
 * ottenere poteri che nessuno ha dato.
 *
 * ## Dove si applica
 *
 * **Mai solo nell'interfaccia.** Ogni rotta della Staff App passa da
 * `requireStaffApi(permesso)` (`lib/staff-auth.ts`), che risolve la persona
 * dal suo account e verifica qui. Nascondere un pulsante non è un permesso:
 * è un suggerimento.
 */

/* -------------------------------------------------------------------------- */
/*  Il vocabolario                                                            */
/* -------------------------------------------------------------------------- */

export type PermessoStaff =
  /* Sé stessi — quello che chiunque abbia un account e un'anagrafica può fare. */
  | "view_own_shifts"
  | "view_own_documents"
  | "view_own_profile"
  | "request_leave"
  /* Sala */
  | "view_tables"
  /** Vedere anche i tavoli **non** propri: il maître sì, il commis no. */
  | "view_all_tables"
  /** Cambiare lo stato di un tavolo: accomodare, chiedere il conto, liberare. */
  | "manage_tables"
  /* Comande */
  | "create_orders"
  | "edit_orders"
  | "send_orders"
  | "cancel_orders"
  /* Cucina */
  | "view_kitchen_status"
  /** Muovere la coda di cucina: preso in carico, pronto. Non è questa fase. */
  | "manage_kitchen_queue"
  /* Conto */
  | "view_payments"
  | "manage_payments";

export const PERMESSI_STAFF: { value: PermessoStaff; label: string; descrizione: string }[] = [
  { value: "view_own_shifts", label: "I propri turni", descrizione: "Il calendario personale." },
  { value: "view_own_documents", label: "I propri documenti", descrizione: "Contratto, visita medica, attestati." },
  { value: "view_own_profile", label: "La propria scheda", descrizione: "Dati anagrafici e ruolo." },
  { value: "request_leave", label: "Chiedere ferie e permessi", descrizione: "Una richiesta che un responsabile approva." },
  { value: "view_tables", label: "Vedere i propri tavoli", descrizione: "Solo quelli assegnati durante il servizio." },
  { value: "view_all_tables", label: "Vedere tutta la sala", descrizione: "Anche i tavoli di altri camerieri." },
  { value: "manage_tables", label: "Cambiare lo stato dei tavoli", descrizione: "Accomodare, chiedere il conto, liberare." },
  { value: "create_orders", label: "Aprire una comanda", descrizione: "Battere piatti su un tavolo." },
  { value: "edit_orders", label: "Modificare una comanda", descrizione: "Quantità, note, variazioni prima dell'invio." },
  { value: "send_orders", label: "Inviare in cucina", descrizione: "Mandare la comanda alla brigata." },
  { value: "cancel_orders", label: "Annullare una comanda", descrizione: "Togliere una voce o annullare la tranche." },
  { value: "view_kitchen_status", label: "Vedere lo stato della cucina", descrizione: "In preparazione, pronto, servito." },
  { value: "manage_kitchen_queue", label: "Gestire la coda di cucina", descrizione: "Presa in carico e piatti pronti." },
  { value: "view_payments", label: "Vedere il conto", descrizione: "Totale, pagato, residuo." },
  { value: "manage_payments", label: "Gestire il conto", descrizione: "Chiedere il conto, chiuderlo, incassare." },
];

/* -------------------------------------------------------------------------- */
/*  I mattoncini della matrice                                                */
/* -------------------------------------------------------------------------- */

/**
 * Quello che ha **chiunque lavori qui e abbia un account**: i propri turni,
 * i propri documenti, la propria scheda. Non è un permesso concesso — è la
 * definizione di avere un profilo personale, e toglierlo significherebbe dare
 * a qualcuno un account che non gli mostra niente di suo.
 */
const SE_STESSI: PermessoStaff[] = [
  "view_own_shifts",
  "view_own_documents",
  "view_own_profile",
  "request_leave",
];

/** Il minimo per stare in sala: guardare i propri tavoli e leggerne lo stato. */
const SALA_BASE: PermessoStaff[] = [...SE_STESSI, "view_tables", "view_kitchen_status"];

/** Chi prende la comanda e la manda in cucina. Il cuore del profilo cameriere. */
const SALA_COMANDA: PermessoStaff[] = [
  ...SALA_BASE,
  "manage_tables",
  "create_orders",
  "edit_orders",
  "send_orders",
  "cancel_orders",
  "view_payments",
];

/** Chi risponde della sala intera: vede tutti i tavoli e chiude i conti. */
const SALA_RESPONSABILE: PermessoStaff[] = [
  ...SALA_COMANDA,
  "view_all_tables",
  "manage_payments",
];

/**
 * La cucina, in questa fase, **non ha la postazione** (il KDS è un'altra cosa
 * e arriverà dopo): l'account personale di uno chef è turni, documenti,
 * scheda. Nient'altro — §32 del brief è esplicito su cosa non deve vedere.
 *
 * `view_kitchen_status` non c'è di proposito: guardare la coda dalla propria
 * scheda personale non serve a nessuno finché non c'è una postazione da cui
 * agirci. Il giorno in cui ci sarà, si aggiunge qui.
 */
const CUCINA: PermessoStaff[] = [...SE_STESSI];

/* -------------------------------------------------------------------------- */
/*  La matrice                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Una riga per mestiere. Scritta per esteso e non per gruppi calcolati: chi
 * deve rispondere a «un runner può inviare in cucina?» legge una riga, non
 * ricostruisce un'ereditarietà.
 */
export const PERMESSI_PER_RUOLO: Record<StaffPrimaryRole, PermessoStaff[]> = {
  RESTAURANT_MANAGER: SALA_RESPONSABILE,
  MAITRE: SALA_RESPONSABILE,
  CHEF_DE_RANG: [...SALA_COMANDA, "view_all_tables"],
  CAMERIERE: SALA_COMANDA,
  COMMIS_SALA: [...SALA_BASE, "manage_tables", "create_orders", "edit_orders"],
  SOMMELIER: [...SALA_COMANDA, "view_all_tables"],
  HEAD_SOMMELIER: SALA_RESPONSABILE,
  /* Il runner porta i piatti: vede la sala e segna «servito», non batte
     comande. Dargli `create_orders` significherebbe farlo comparire fra chi
     può aprire un conto su un tavolo che non sta seguendo. */
  RUNNER: [...SALA_BASE, "view_all_tables"],
  BUSSER: [...SALA_BASE, "manage_tables"],
  HOST: [...SALA_BASE, "view_all_tables", "manage_tables"],
  BARTENDER: [...SALA_BASE, "create_orders", "edit_orders", "send_orders"],
  EXECUTIVE_CHEF: CUCINA,
  SOUS_CHEF: CUCINA,
  CHEF_DE_PARTIE: CUCINA,
  COMMIS_CUCINA: CUCINA,
  LAVAPIATTI: CUCINA,
};

/**
 * Cosa il **ruolo d'accesso** consente al massimo.
 *
 * `null` = nessun tetto, vale quello che dice il mestiere. È il caso di
 * `WAITER` e `RECEPTION`, i due ruoli con cui si danno gli account di sala:
 * lì la parola definitiva ce l'ha la scheda della persona.
 *
 * `MANAGER` non ha tetto e in più riceve tutto (vedi `permessiStaff`): è chi
 * risponde del locale, e un manager che non può chiudere un conto è un
 * manager che alle undici di sera deve svegliare qualcuno.
 */
const TETTO_PER_ACCESSO: Record<StaffRole, PermessoStaff[] | null> = {
  MANAGER: null,
  RECEPTION: null,
  WAITER: null,
  /* Il marketing non sta in servizio: se ha un'anagrafica, ha la sua scheda. */
  MARKETING: SE_STESSI,
  /* Sola lettura vuol dire sola lettura: si guarda, non si tocca niente. */
  READ_ONLY: [
    "view_own_shifts",
    "view_own_documents",
    "view_own_profile",
    "view_tables",
    "view_kitchen_status",
    "view_payments",
  ],
};

/** Tutti i permessi esistenti. Serve al manager e ai test. */
export const TUTTI_I_PERMESSI: PermessoStaff[] = PERMESSI_STAFF.map((p) => p.value);

/**
 * I permessi effettivi di una persona nella Staff App.
 *
 * Senza mestiere (`primaryRole` nullo) restano quelli di sé stessi: sono le
 * anagrafiche storiche, create prima che il ruolo strutturato esistesse. Dare
 * loro i poteri di sala per difetto vorrebbe dire concedere in base a un dato
 * mancante, che è il modo più silenzioso di aprire un buco.
 */
export function permessiStaff(persona: {
  primaryRole: StaffPrimaryRole | null;
  accesso: StaffRole;
}): PermessoStaff[] {
  if (persona.accesso === "MANAGER") return [...TUTTI_I_PERMESSI];

  const dalMestiere = persona.primaryRole
    ? PERMESSI_PER_RUOLO[persona.primaryRole]
    : SE_STESSI;

  const tetto = TETTO_PER_ACCESSO[persona.accesso];
  if (!tetto) return [...new Set(dalMestiere)];

  const ammessi = new Set(tetto);
  return [...new Set(dalMestiere)].filter((p) => ammessi.has(p));
}

/** Vero se questo elenco di permessi contiene quello richiesto. */
export function puo(permessi: readonly PermessoStaff[], richiesto: PermessoStaff): boolean {
  return permessi.includes(richiesto);
}

/* -------------------------------------------------------------------------- */
/*  Il profilo: quale Staff App si apre                                       */
/* -------------------------------------------------------------------------- */

/**
 * Quale delle Staff App vede questa persona.
 *
 * Non è un permesso: è **quale prodotto si apre**. Un cameriere e uno chef
 * hanno due homepage, due navigazioni e due vocabolari diversi, e la scelta
 * non si fa contando i permessi uno per uno — si fa dal reparto, che è il
 * dato che il locale compila già oggi nella scheda.
 *
 * `SALA` include il bar: un bartender prende comande e le manda, e la sua
 * giornata assomiglia a quella di un cameriere molto più che a quella di un
 * commis di cucina. Quando il bar avrà bisogno di una vista sua, questo è il
 * punto in cui si separa.
 */
export type ProfiloStaff = "SALA" | "CUCINA";

export function profiloStaff(persona: { primaryRole: StaffPrimaryRole | null }): ProfiloStaff {
  if (!persona.primaryRole) return "SALA";
  return ROLE_DEPARTMENT[persona.primaryRole] === "CUCINA" ? "CUCINA" : "SALA";
}

/* -------------------------------------------------------------------------- */
/*  Quale dei due ambienti è casa                                             */
/* -------------------------------------------------------------------------- */

/**
 * **Dove atterra questa persona entrando in Tavolo.**
 *
 * §48: il prodotto ha due ambienti, il back office e la Staff App, e non è il
 * dipendente a doversi ricordare l'indirizzo giusto. Questa funzione è la
 * regola, ed è scritta sul **ruolo d'accesso** e non sul mestiere per un
 * motivo preciso: è il ruolo che il locale sceglie creando l'account, cioè la
 * decisione esplicita di qualcuno, mentre il mestiere è un'etichetta
 * anagrafica che qualcun altro può cambiare in un altro momento per un'altra
 * ragione.
 *
 * - `WAITER` e `READ_ONLY` → **Staff App**. Sono i ruoli con cui si danno gli
 *   account a chi lavora durante il servizio, e sono già oggi quelli che nel
 *   back office trovano quasi tutto chiuso;
 * - `RECEPTION` → **back office**. Lavora a un computer con l'agenda aperta:
 *   la sua giornata è fatta di prenotazioni e telefono, non di tavoli;
 * - `MANAGER` e `MARKETING` → **back office**, con la Staff App raggiungibile
 *   dal menu del profilo quando hanno anche un'anagrafica.
 *
 * Il giorno in cui questa regola non basterà — un maître che vuole entrare
 * direttamente in sala pur essendo manager — la cosa da aggiungere è una
 * preferenza sull'account, non un'eccezione qui.
 */
export function staffAppEHome(accesso: StaffRole): boolean {
  return accesso === "WAITER" || accesso === "READ_ONLY";
}
