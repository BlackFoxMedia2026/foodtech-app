import type { StaffCapability, StaffDepartment, StaffPrimaryRole } from "@prisma/client";

/**
 * Pure constants, no `db` import — safe to pull into client components
 * (unlike src/server/waiters.ts, which drags in @/lib/db transitively).
 */

export const STAFF_PRIMARY_ROLES: { value: StaffPrimaryRole; label: string }[] = [
  { value: "RESTAURANT_MANAGER", label: "Restaurant Manager" },
  { value: "MAITRE", label: "Maître" },
  { value: "CHEF_DE_RANG", label: "Chef de rang" },
  { value: "CAMERIERE", label: "Cameriere" },
  { value: "COMMIS_SALA", label: "Commis di sala" },
  { value: "SOMMELIER", label: "Sommelier" },
  { value: "HEAD_SOMMELIER", label: "Head Sommelier" },
  { value: "RUNNER", label: "Runner" },
  { value: "BUSSER", label: "Busser" },
  { value: "HOST", label: "Host / Hostess" },
  { value: "BARTENDER", label: "Bartender" },
  { value: "EXECUTIVE_CHEF", label: "Executive Chef" },
  { value: "SOUS_CHEF", label: "Sous-chef" },
  { value: "CHEF_DE_PARTIE", label: "Chef de Partie" },
  { value: "COMMIS_CUCINA", label: "Commis di cucina" },
  { value: "LAVAPIATTI", label: "Lavapiatti" },
];

/**
 * Cosa fa ogni ruolo, in una riga. Si vede dove si sceglie il ruolo di una
 * persona, ed esiste perché «Chef de Partie» e «Commis» sono parole che chi
 * gestisce la sala non usa tutti i giorni — e sceglierne una a caso mette la
 * persona nel reparto sbagliato per sempre.
 */
export const STAFF_ROLE_DESCRIPTIONS: Partial<Record<StaffPrimaryRole, string>> = {
  RESTAURANT_MANAGER: "Responsabile del locale: squadra, turni, conti.",
  MAITRE: "Guida il servizio di sala e accoglie gli ospiti.",
  CHEF_DE_RANG: "Cameriere senior, responsabile del proprio rango di tavoli.",
  CAMERIERE: "Serve i tavoli assegnati durante il servizio.",
  COMMIS_SALA: "Figura junior di sala, affianca lo chef de rang.",
  SOMMELIER: "Cura la carta dei vini e il servizio al tavolo.",
  HEAD_SOMMELIER: "Responsabile della cantina e del reparto vini.",
  RUNNER: "Porta i piatti dalla cucina alla sala.",
  BUSSER: "Sparecchia e rimette a posto i tavoli fra un servizio e l'altro.",
  HOST: "Accoglie all'ingresso, gestisce arrivi e attesa.",
  BARTENDER: "Prepara cocktail e bevande al banco.",
  EXECUTIVE_CHEF: "Responsabile massimo della cucina: crea i menu, gestisce i fornitori e guida la brigata.",
  SOUS_CHEF: "Braccio destro dell'Executive Chef: lo sostituisce in sua assenza e coordina la linea.",
  CHEF_DE_PARTIE: "Capo partita, responsabile di un settore della cucina — primi, secondi, pasticceria, garde manger.",
  COMMIS_CUCINA: "Figura junior che assiste lo chef de partie e la brigata.",
  LAVAPIATTI: "Personale di supporto alla cucina.",
};

/**
 * **Il reparto si deduce dal ruolo, non si digita.**
 *
 * È la mappa che tiene insieme tutta la segmentazione della pagina Staff, e
 * sta qui in un posto solo per un motivo pratico: aggiungere «bar manager» o
 * «addetto delivery» domani deve costare una riga nell'enum e una riga qui,
 * non una fascia in più nell'elenco e una `if` sparsa in tre componenti.
 *
 * `Waiter.department` esiste come override nullable, ma è per i ruoli custom
 * futuri — quelli che avranno un reparto senza avere un valore d'enum. Per
 * tutti i ruoli conosciuti la verità è questa tabella.
 */
export const ROLE_DEPARTMENT: Record<StaffPrimaryRole, StaffDepartment> = {
  RESTAURANT_MANAGER: "DIREZIONE",
  MAITRE: "SALA",
  CHEF_DE_RANG: "SALA",
  CAMERIERE: "SALA",
  COMMIS_SALA: "SALA",
  SOMMELIER: "SALA",
  HEAD_SOMMELIER: "SALA",
  RUNNER: "SALA",
  BUSSER: "SALA",
  HOST: "SALA",
  BARTENDER: "BAR",
  EXECUTIVE_CHEF: "CUCINA",
  SOUS_CHEF: "CUCINA",
  CHEF_DE_PARTIE: "CUCINA",
  COMMIS_CUCINA: "CUCINA",
  LAVAPIATTI: "CUCINA",
};

/** Il reparto di una persona: l'override se c'è, altrimenti quello del ruolo,
 * altrimenti ALTRO — che qui significa «anagrafica storica senza ruolo
 * strutturato», non «ruolo che non sapevamo dove mettere». */
export function staffDepartmentOf(staff: {
  primaryRole: StaffPrimaryRole | null;
  department?: StaffDepartment | null;
}): StaffDepartment {
  if (staff.department) return staff.department;
  if (staff.primaryRole) return ROLE_DEPARTMENT[staff.primaryRole];
  return "ALTRO";
}

export const STAFF_CAPABILITIES: { value: StaffCapability; label: string }[] = [
  { value: "TABLE_RESPONSIBLE", label: "Responsabile tavolo" },
  { value: "TABLE_SUPPORT", label: "Supporto / Commis" },
  { value: "SOMMELIER", label: "Sommelier" },
  { value: "RUNNER", label: "Runner" },
  { value: "BUSSER", label: "Busser" },
  { value: "ROOM_SUPERVISOR", label: "Responsabile sala" },
  { value: "SERVICE_MANAGER", label: "Responsabile servizio" },
  { value: "MAITRE", label: "Maître" },
  { value: "HOST", label: "Accoglienza" },
  { value: "BARTENDER", label: "Bar / Cocktail" },
];

/** Capabilities suggested by default when a primary role is picked — the
 * user can still check/uncheck freely afterwards, these are just a starting
 * point (brief section 5).
 *
 * I ruoli di cucina non ne hanno **nessuna**, e non è una dimenticanza: le
 * capability dicono a cosa una persona può essere assegnata *in sala* (un
 * tavolo, un rango, la cantina). Un sous-chef non copre tavoli, e riempirgli
 * la scheda di caselle spuntate lo farebbe comparire fra i candidati quando
 * il maître assegna il servizio. */
export const DEFAULT_CAPABILITIES_BY_ROLE: Record<StaffPrimaryRole, StaffCapability[]> = {
  RESTAURANT_MANAGER: ["SERVICE_MANAGER"],
  MAITRE: ["ROOM_SUPERVISOR", "SERVICE_MANAGER", "TABLE_RESPONSIBLE", "MAITRE"],
  CHEF_DE_RANG: ["TABLE_RESPONSIBLE", "TABLE_SUPPORT", "RUNNER"],
  CAMERIERE: ["TABLE_RESPONSIBLE", "TABLE_SUPPORT", "RUNNER"],
  COMMIS_SALA: ["TABLE_SUPPORT", "RUNNER"],
  SOMMELIER: ["SOMMELIER"],
  HEAD_SOMMELIER: ["SOMMELIER", "ROOM_SUPERVISOR"],
  RUNNER: ["RUNNER"],
  BUSSER: ["BUSSER", "RUNNER"],
  HOST: ["HOST"],
  BARTENDER: ["BARTENDER"],
  EXECUTIVE_CHEF: [],
  SOUS_CHEF: [],
  CHEF_DE_PARTIE: [],
  COMMIS_CUCINA: [],
  LAVAPIATTI: [],
};

export function staffPrimaryRoleLabel(role: StaffPrimaryRole) {
  return STAFF_PRIMARY_ROLES.find((r) => r.value === role)?.label ?? role;
}

export function staffCapabilityLabel(capability: StaffCapability) {
  return STAFF_CAPABILITIES.find((c) => c.value === capability)?.label ?? capability;
}

/** The 4 capabilities assignable on a single table (brief section 9) — in
 * priority order, matching how they're shown in the assign-staff dialog and
 * on the floor plan node. */
export const TABLE_ASSIGNABLE_CAPABILITIES = ["TABLE_RESPONSIBLE", "SOMMELIER", "TABLE_SUPPORT", "RUNNER"] as const satisfies readonly StaffCapability[];

export const TABLE_ROLE_LABELS: Record<(typeof TABLE_ASSIGNABLE_CAPABILITIES)[number], string> = {
  TABLE_RESPONSIBLE: "Responsabile tavolo",
  SOMMELIER: "Sommelier",
  TABLE_SUPPORT: "Supporto",
  RUNNER: "Runner",
};
