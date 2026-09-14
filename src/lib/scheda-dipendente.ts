import { differenceInCalendarDays, startOfDay } from "date-fns";
import type {
  StaffDocumentCategory,
  StaffMedicalFitness,
  StaffPermission,
  StaffRole,
  StaffTrainingKind,
} from "@prisma/client";

/**
 * La scheda del dipendente: costanti e logica pura, senza `db`.
 *
 * Sta qui e non nei componenti per lo stesso motivo di `staff-roles.ts`:
 * la scheda si legge in tre posti — la pagina della persona, la card
 * nell'elenco Staff, il seed — e ognuno deve dire la stessa cosa sulla stessa
 * scadenza. Una soglia scritta due volte è una soglia che prima o poi
 * diverge.
 */

/* -------------------------------------------------------------------------- */
/*  Età                                                                       */
/* -------------------------------------------------------------------------- */

/** L'età, dalla data di nascita. `null` se la data manca o non è una data. */
export function calcolaEta(nascita: Date | string | null | undefined, oggi: Date = new Date()): number | null {
  if (!nascita) return null;
  const dob = new Date(nascita);
  if (Number.isNaN(dob.getTime())) return null;
  let eta = oggi.getFullYear() - dob.getFullYear();
  const mesi = oggi.getMonth() - dob.getMonth();
  if (mesi < 0 || (mesi === 0 && oggi.getDate() < dob.getDate())) eta--;
  return eta >= 0 ? eta : null;
}

/* -------------------------------------------------------------------------- */
/*  Scadenze                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sotto quanti giorni una scadenza «si avvicina».
 *
 * Sessanta per corsi, visite e documenti, e non i trenta dei contratti: un
 * corso di aggiornamento va prenotato con l'ente e un medico competente
 * riceve su appuntamento — trenta giorni prima è tardi. I contratti tengono
 * la loro soglia in `staff-contracts.ts`, perché là ci sono già i promemoria
 * a 30/15/7 giorni che si accordano su quella.
 */
export const GIORNI_SCADENZA_VICINA = 60;

export type StatoScadenza = "valido" | "in_scadenza" | "scaduto" | "assente";

export const STATO_SCADENZA_LABEL: Record<StatoScadenza, string> = {
  valido: "Valido",
  in_scadenza: "In scadenza",
  scaduto: "Scaduto",
  assente: "Non presente",
};

/** I toni del Badge, uno per stato: verde regolare, oro vicino, rosso
 * scaduto, spento quando manca. Nessun colore fuori tavolozza. */
export const STATO_SCADENZA_TONE: Record<StatoScadenza, "success-soft" | "warning" | "danger" | "neutral"> = {
  valido: "success-soft",
  in_scadenza: "warning",
  scaduto: "danger",
  assente: "neutral",
};

/** Giorni di calendario fra oggi e la scadenza, entrambi a mezzanotte —
 * stessa disciplina di `getContractDaysRemaining`, per non far cambiare
 * stato a una scadenza attraversando un cambio d'ora. */
export function giorniAllaScadenza(scadenza: Date, oggi: Date = new Date()): number {
  return differenceInCalendarDays(startOfDay(scadenza), startOfDay(oggi));
}

export function statoScadenza(
  scadenza: Date | null | undefined,
  oggi: Date = new Date(),
  soglia: number = GIORNI_SCADENZA_VICINA,
): StatoScadenza {
  if (!scadenza) return "valido";
  const giorni = giorniAllaScadenza(scadenza, oggi);
  if (giorni < 0) return "scaduto";
  if (giorni <= soglia) return "in_scadenza";
  return "valido";
}

/** «tra 65 giorni», «scade oggi», «scaduto da 12 giorni». */
export function descriviScadenza(scadenza: Date, oggi: Date = new Date()): string {
  const giorni = giorniAllaScadenza(scadenza, oggi);
  if (giorni === 0) return "Scade oggi";
  if (giorni === 1) return "Scade domani";
  if (giorni > 1) return `Tra ${giorni} giorni`;
  if (giorni === -1) return "Scaduto ieri";
  return `Scaduto da ${-giorni} giorni`;
}

/**
 * Una scadenza come la legge la Panoramica: di cosa si tratta, quando, e
 * quanto è urgente. `ordine` serve a metterle in fila — scadute per prime,
 * poi le più vicine.
 */
export type Scadenza = {
  chiave: string;
  titolo: string;
  /** Dove si va per sistemarla: la tab della scheda. */
  tab: TabScheda;
  scadeIl: Date | null;
  stato: StatoScadenza;
  dettaglio: string;
  giorni: number | null;
};

export function ordinaScadenze(scadenze: Scadenza[]): Scadenza[] {
  const peso: Record<StatoScadenza, number> = { scaduto: 0, in_scadenza: 1, valido: 2, assente: 3 };
  return [...scadenze].sort((a, b) => {
    const p = peso[a.stato] - peso[b.stato];
    if (p !== 0) return p;
    return (a.giorni ?? Number.MAX_SAFE_INTEGER) - (b.giorni ?? Number.MAX_SAFE_INTEGER);
  });
}

/**
 * L'unica scadenza che vale la pena scrivere sulla card della persona
 * nell'elenco Staff. Solo scadute o vicine: una card che dice «tutto
 * regolare» su venti persone insegna a non leggere le card.
 */
export function scadenzaDaSegnalare(scadenze: Scadenza[]): Scadenza | null {
  const urgente = ordinaScadenze(scadenze).find((s) => s.stato === "scaduto" || s.stato === "in_scadenza");
  return urgente ?? null;
}

/** «HACCP scaduto», «Visita medica tra 15 giorni». Corto: sta su una card. */
export function testoAvvisoScadenza(s: Scadenza): string {
  if (s.stato === "scaduto") return `${s.titolo} scaduto`;
  if (s.giorni === 0) return `${s.titolo} scade oggi`;
  if (s.giorni === 1) return `${s.titolo} scade domani`;
  return `${s.titolo} tra ${s.giorni} giorni`;
}

/* -------------------------------------------------------------------------- */
/*  Le tab della scheda                                                       */
/* -------------------------------------------------------------------------- */

export const TAB_SCHEDA = [
  { chiave: "panoramica", label: "Panoramica" },
  { chiave: "personali", label: "Dati personali" },
  { chiave: "lavoro", label: "Lavoro" },
  { chiave: "documenti", label: "Documenti" },
  { chiave: "formazione", label: "Formazione e sicurezza" },
  { chiave: "presenze", label: "Turni e presenze" },
  { chiave: "account", label: "Account" },
  { chiave: "note", label: "Note e storico" },
] as const;

export type TabScheda = (typeof TAB_SCHEDA)[number]["chiave"];

export function eTabScheda(valore: string | undefined): valore is TabScheda {
  return TAB_SCHEDA.some((t) => t.chiave === valore);
}

/* -------------------------------------------------------------------------- */
/*  Documenti                                                                 */
/* -------------------------------------------------------------------------- */

export const CATEGORIE_DOCUMENTO: { value: StaffDocumentCategory; label: string }[] = [
  { value: "CONTRATTO", label: "Contratto di lavoro" },
  { value: "CARTA_IDENTITA", label: "Carta d'identità" },
  { value: "CODICE_FISCALE", label: "Codice fiscale" },
  { value: "PERMESSO_SOGGIORNO", label: "Permesso di soggiorno" },
  { value: "CERTIFICAZIONE", label: "Certificazione" },
  { value: "ATTESTATO", label: "Attestato" },
  { value: "CERTIFICATO_MEDICO", label: "Certificato medico" },
  { value: "BUSTA_PAGA", label: "Busta paga" },
  { value: "ALTRO", label: "Altro documento" },
];

export function categoriaDocumentoLabel(c: StaffDocumentCategory): string {
  return CATEGORIE_DOCUMENTO.find((x) => x.value === c)?.label ?? c;
}

/* -------------------------------------------------------------------------- */
/*  Formazione                                                                */
/* -------------------------------------------------------------------------- */

export const TIPI_CORSO: { value: StaffTrainingKind; label: string; obbligatorio: boolean }[] = [
  { value: "SICUREZZA_LAVORO", label: "Corso sicurezza sul lavoro", obbligatorio: true },
  { value: "HACCP", label: "HACCP", obbligatorio: true },
  { value: "ANTINCENDIO", label: "Antincendio", obbligatorio: false },
  { value: "PRIMO_SOCCORSO", label: "Primo soccorso", obbligatorio: false },
  { value: "ALTRO", label: "Altro corso", obbligatorio: false },
];

export function tipoCorsoLabel(k: StaffTrainingKind): string {
  return TIPI_CORSO.find((t) => t.value === k)?.label ?? k;
}

/** Il nome con cui si legge un corso: quello scritto, altrimenti il tipo. */
export function nomeCorso(c: { kind: StaffTrainingKind; name: string | null }): string {
  return c.name?.trim() || tipoCorsoLabel(c.kind);
}

/** Corto, per la Panoramica e le card: «Sicurezza», non «Corso sicurezza sul lavoro». */
export const TIPO_CORSO_BREVE: Record<StaffTrainingKind, string> = {
  SICUREZZA_LAVORO: "Corso sicurezza",
  HACCP: "HACCP",
  ANTINCENDIO: "Antincendio",
  PRIMO_SOCCORSO: "Primo soccorso",
  ALTRO: "Corso",
};

/* -------------------------------------------------------------------------- */
/*  Visita medica                                                             */
/* -------------------------------------------------------------------------- */

export const IDONEITA: { value: StaffMedicalFitness; label: string; tone: "success-soft" | "warning" | "danger" | "neutral" }[] = [
  { value: "IDONEO", label: "Idoneo", tone: "success-soft" },
  { value: "IDONEO_CON_LIMITAZIONI", label: "Idoneo con limitazioni", tone: "warning" },
  { value: "NON_IDONEO", label: "Non idoneo", tone: "danger" },
  { value: "IN_ATTESA", label: "In attesa di giudizio", tone: "neutral" },
];

export function idoneitaLabel(f: StaffMedicalFitness): string {
  return IDONEITA.find((i) => i.value === f)?.label ?? f;
}

export function idoneitaTone(f: StaffMedicalFitness) {
  return IDONEITA.find((i) => i.value === f)?.tone ?? "neutral";
}

/* -------------------------------------------------------------------------- */
/*  Caratteristiche                                                           */
/* -------------------------------------------------------------------------- */

/** I tag suggeriti. Il locale ne può scrivere altri: sono testo libero. */
export const CARATTERISTICHE_SUGGERITE = [
  "Responsabile",
  "Sommelier",
  "Inglese",
  "Francese",
  "Cocktail",
  "Gestione cassa",
  "Apertura locale",
  "Chiusura locale",
  "Primo soccorso",
  "Antincendio",
  "Formatore",
  "Auto propria",
];

/* -------------------------------------------------------------------------- */
/*  Permessi nel gestionale                                                   */
/* -------------------------------------------------------------------------- */

export const PERMESSI: { value: StaffPermission; label: string; descrizione: string }[] = [
  { value: "VIEW_OWN_SHIFTS", label: "Visualizzare i propri turni", descrizione: "Il calendario, filtrato su di sé." },
  { value: "REQUEST_LEAVE", label: "Richiedere ferie e permessi", descrizione: "Manda una richiesta che un responsabile approva." },
  { value: "VIEW_ANNOUNCEMENTS", label: "Consultare le comunicazioni", descrizione: "Gli avvisi del locale alla squadra." },
  { value: "VIEW_BOOKINGS", label: "Visualizzare le prenotazioni", descrizione: "L'agenda del giorno e dei giorni a venire." },
  { value: "EDIT_BOOKINGS", label: "Modificare le prenotazioni", descrizione: "Creare, spostare, segnare arrivi e assenze." },
  { value: "VIEW_FLOOR", label: "Vedere la sala", descrizione: "La piantina con i tavoli e chi ci sta." },
  { value: "VIEW_GUESTS", label: "Vedere gli ospiti", descrizione: "Le schede dei clienti, con allergie e preferenze." },
  { value: "VIEW_REPORTS", label: "Vedere i report", descrizione: "Analisi, incassi e andamento del locale." },
  { value: "MANAGE_MENU", label: "Gestire il menu", descrizione: "Piatti, prezzi, allergeni, disponibilità." },
];

export function permessoLabel(p: StaffPermission): string {
  return PERMESSI.find((x) => x.value === p)?.label ?? p;
}

/**
 * Il preset per ruolo. È l'**equivalente leggibile** della matrice in
 * `abilities.ts`: un cameriere lavora sulle prenotazioni e sulla sala e vede
 * i propri turni; la reception vede in più gli ospiti; il manager tutto.
 *
 * Non la sostituisce: `can()` continua a decidere cosa una route accetta.
 * Questa lista è quella che un responsabile legge e ritocca dalla scheda; il
 * giorno in cui `can()` la leggerà, il posto da cui leggerla è
 * `permessiEffettivi()`.
 */
export const PERMESSI_PREDEFINITI: Record<StaffRole, StaffPermission[]> = {
  MANAGER: PERMESSI.map((p) => p.value),
  RECEPTION: ["VIEW_OWN_SHIFTS", "REQUEST_LEAVE", "VIEW_ANNOUNCEMENTS", "VIEW_BOOKINGS", "EDIT_BOOKINGS", "VIEW_FLOOR", "VIEW_GUESTS"],
  WAITER: ["VIEW_OWN_SHIFTS", "REQUEST_LEAVE", "VIEW_ANNOUNCEMENTS", "VIEW_BOOKINGS", "EDIT_BOOKINGS", "VIEW_FLOOR"],
  MARKETING: ["VIEW_OWN_SHIFTS", "VIEW_ANNOUNCEMENTS", "VIEW_GUESTS", "VIEW_REPORTS"],
  READ_ONLY: ["VIEW_OWN_SHIFTS", "VIEW_ANNOUNCEMENTS"],
};

export function permessiEffettivi(m: {
  role: StaffRole;
  permissions: StaffPermission[];
  customPermissions: boolean;
}): StaffPermission[] {
  return m.customPermissions ? m.permissions : PERMESSI_PREDEFINITI[m.role];
}

/** Vero se l'elenco coincide con il preset del ruolo: allora non serve
 * salvarlo come personalizzato, e cambiare ruolo domani lo seguirà. */
export function coincideConPreset(role: StaffRole, permissions: StaffPermission[]): boolean {
  const preset = new Set(PERMESSI_PREDEFINITI[role]);
  if (preset.size !== permissions.length) return false;
  return permissions.every((p) => preset.has(p));
}

export const RUOLI_ACCESSO: { value: StaffRole; label: string; descrizione: string }[] = [
  { value: "MANAGER", label: "Manager", descrizione: "Gestisce il locale: squadra, turni, contratti, impostazioni." },
  { value: "RECEPTION", label: "Reception", descrizione: "Prenotazioni e accoglienza." },
  { value: "WAITER", label: "Cameriere", descrizione: "Prenotazioni e servizio in sala." },
  { value: "MARKETING", label: "Marketing", descrizione: "Campagne, ospiti e report." },
  { value: "READ_ONLY", label: "Sola lettura", descrizione: "Guarda, non cambia niente." },
];

export function ruoloAccessoLabel(r: StaffRole): string {
  return RUOLI_ACCESSO.find((x) => x.value === r)?.label ?? r;
}

/* -------------------------------------------------------------------------- */
/*  Giorni della settimana (contratto)                                        */
/* -------------------------------------------------------------------------- */

/** 0 = domenica, come `Shift.weekday`. In ordine da lunedì, come si legge. */
export const GIORNI_SETTIMANA: { value: number; label: string; breve: string }[] = [
  { value: 1, label: "Lunedì", breve: "Lun" },
  { value: 2, label: "Martedì", breve: "Mar" },
  { value: 3, label: "Mercoledì", breve: "Mer" },
  { value: 4, label: "Giovedì", breve: "Gio" },
  { value: 5, label: "Venerdì", breve: "Ven" },
  { value: 6, label: "Sabato", breve: "Sab" },
  { value: 0, label: "Domenica", breve: "Dom" },
];

export function giorniLavorativiLeggibili(giorni: number[]): string {
  if (giorni.length === 0) return "";
  return GIORNI_SETTIMANA.filter((g) => giorni.includes(g.value))
    .map((g) => g.breve)
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/*  Date, come le scrive la scheda                                            */
/* -------------------------------------------------------------------------- */

/** «12 marzo 2024»: la data lunga, per i dati che si leggono e non si
 * incolonnano. */
export function dataLunga(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

/** «12/03/2024»: la data corta, per gli elenchi. */
export function dataBreve(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("it-IT");
}

/** `<input type="date">` vuole «2026-09-11» e niente altro. */
export function perCampoData(d: Date | string | null | undefined): string {
  if (!d) return "";
  const data = new Date(d);
  if (Number.isNaN(data.getTime())) return "";
  return data.toISOString().slice(0, 10);
}
