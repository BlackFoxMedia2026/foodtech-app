import type { WorkShiftKind } from "@prisma/client";
import { shiftDateKey } from "@/lib/venue-time";

/**
 * Il vocabolario dei turni, senza `db`: lo usano sia le pagine sia il browser.
 *
 * Gli orari sono **minuti da mezzanotte**, come già `Shift.startMinute` delle
 * fasce di apertura. La ragione sta tutta nel turno serale: «18:00 → 00:00» si
 * scrive 1080 → 1440, e 1440 significa «mezzanotte di domani» senza che nessuno
 * debba ragionarci. Con due `DateTime` lo stesso turno avrebbe la fine su un
 * giorno diverso dall'inizio, e ogni interrogazione sulla settimana dovrebbe
 * saperlo — cioè ogni interrogazione sulla settimana potrebbe sbagliarlo.
 */

/** Oltre la mezzanotte si può arrivare, ma non all'infinito: un turno che
 * durasse più di un giorno intero è quasi sempre un errore di battitura. */
export const MINUTI_MASSIMI = 2 * 24 * 60;

export function minutiAOrario(minuti: number): string {
  const m = ((minuti % MINUTI_MASSIMI) + MINUTI_MASSIMI) % MINUTI_MASSIMI;
  const ore = Math.floor(m / 60) % 24;
  return `${String(ore).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** `"18:30"` → 1110. Restituisce null su qualunque cosa non sia un orario. */
export function orarioAMinuti(orario: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(orario.trim());
  if (!match) return null;
  const ore = Number(match[1]);
  const minuti = Number(match[2]);
  if (ore > 23 || minuti > 59) return null;
  return ore * 60 + minuti;
}

/**
 * La fine di un turno, dato l'inizio.
 *
 * Se l'orario di fine è minore o uguale a quello di inizio, il turno **passa
 * la mezzanotte**: 18:00 → 00:00 diventa 1080 → 1440, non 1080 → 0. È il caso
 * normale di una cena, non l'eccezione, e chiedere all'utente di dire «e poi
 * è il giorno dopo» sarebbe chiedergli di fare un lavoro che sappiamo fare noi.
 */
export function fineInMinuti(inizioMinuti: number, fineOrario: string): number | null {
  const fine = orarioAMinuti(fineOrario);
  if (fine === null) return null;
  return fine <= inizioMinuti ? fine + 24 * 60 : fine;
}

/**
 * L'intervallo in forma **corta**: «17–24» invece di «17:00–00:00».
 *
 * Serve a una cosa sola, e misurata: la testata di una card in una corsia da
 * settanta pixel. «17:00–00:00» sono undici caratteri che non ci stanno, e
 * troncati diventano «17:00–0…», cioè un orario che non dice più quando
 * finisce. Cinque caratteri ci stanno.
 *
 * Si applica **solo a orari tondi**, che in un ristorante sono la quasi
 * totalità; con i minuti si torna alla forma piena, perché «17:30–24» misto
 * si legge peggio di quello che risolve. La mezzanotte si scrive 24 e non 00:
 * in una fascia che comincia alle 17, «00» sembra l'inizio e non la fine.
 */
export function intervalloCompatto(inizioMinuti: number, fineMinuti: number): string {
  if (inizioMinuti % 60 !== 0 || fineMinuti % 60 !== 0) {
    return `${minutiAOrario(inizioMinuti)}–${minutiAOrario(fineMinuti)}`;
  }
  const ora = (minuti: number) => {
    const h = Math.floor(minuti / 60);
    return String(h > 24 ? h - 24 : h).padStart(2, "0");
  };
  return `${ora(inizioMinuti)}–${ora(fineMinuti)}`;
}

/** `1080 → 1440` diventa «18:00 → 00:00». */
export function intervalloLeggibile(inizioMinuti: number, fineMinuti: number): string {
  return `${minutiAOrario(inizioMinuti)} → ${minutiAOrario(fineMinuti)}`;
}

/** Quanto si lavora davvero, pausa tolta. In minuti. */
export function durataNetta(inizioMinuti: number, fineMinuti: number, pausaMinuti: number | null): number {
  return Math.max(0, fineMinuti - inizioMinuti - (pausaMinuti ?? 0));
}

export function oreLeggibili(minuti: number): string {
  const ore = Math.floor(minuti / 60);
  const resto = minuti % 60;
  if (resto === 0) return `${ore} h`;
  return `${ore} h ${resto}′`;
}

/**
 * I tipi di turno.
 *
 * `WORK` è l'unico con un orario; tutti gli altri sono modi diversi di **non**
 * lavorare, e stanno nella stessa tabella di proposito: in un calendario «non
 * lavora» deve occupare una casella. Una casella vuota vuol dire «non ancora
 * pianificato», che è una cosa diversa e che il responsabile deve poter
 * distinguere a colpo d'occhio il venerdì sera.
 */
export const TIPI_TURNO: {
  value: WorkShiftKind;
  label: string;
  /** Come si legge nella casella del calendario, quando non c'è un orario. */
  breve: string;
  tone: "work" | "rest" | "warning" | "danger";
}[] = [
  { value: "WORK", label: "Turno di lavoro", breve: "Lavoro", tone: "work" },
  { value: "REST", label: "Riposo", breve: "Riposo", tone: "rest" },
  { value: "VACATION", label: "Ferie", breve: "Ferie", tone: "warning" },
  { value: "LEAVE", label: "Permesso", breve: "Permesso", tone: "warning" },
  { value: "SICK_LEAVE", label: "Malattia", breve: "Malattia", tone: "danger" },
  { value: "UNAVAILABLE", label: "Non disponibile", breve: "Non disp.", tone: "rest" },
];

const TIPO_PER_VALORE = new Map(TIPI_TURNO.map((t) => [t.value, t]));

export function tipoTurnoLabel(kind: WorkShiftKind): string {
  return TIPO_PER_VALORE.get(kind)?.label ?? kind;
}

export function tipoTurnoBreve(kind: WorkShiftKind): string {
  return TIPO_PER_VALORE.get(kind)?.breve ?? kind;
}

export function tipoTurnoTone(kind: WorkShiftKind) {
  return TIPO_PER_VALORE.get(kind)?.tone ?? "rest";
}

/** Solo `WORK` porta un orario: sugli altri i campi ora restano nulli. */
export function haOrario(kind: WorkShiftKind): boolean {
  return kind === "WORK";
}

/** 0 = domenica, come `Shift.weekday` e `Date.getUTCDay()`. */
export function weekdayDiDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/**
 * Il lunedì della settimana che contiene questo giorno.
 *
 * Stessa regola di `lunediDella` in `server/booking-week.ts` — le settimane del
 * prodotto cominciano di lunedì, e due calendari che cominciano in due giorni
 * diversi sarebbero un difetto. Qui è riscritta invece che importata perché
 * quel modulo tira dentro `db`, e questa funzione serve anche nel browser.
 */
export function lunediDi(dateKey: string): string {
  const weekday = weekdayDiDateKey(dateKey);
  // Domenica è 0: da domenica si torna indietro di sei giorni, non di zero.
  const indietro = weekday === 0 ? 6 : weekday - 1;
  return shiftDateKey(dateKey, -indietro);
}

export function giorniDellaSettimana(lunedi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftDateKey(lunedi, i));
}

const NOMI_GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

export function nomeGiornoBreve(dateKey: string): string {
  return NOMI_GIORNI[weekdayDiDateKey(dateKey)];
}

export function numeroGiorno(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
}

/** «12 – 18 settembre», oppure «29 settembre – 5 ottobre» a cavallo di mese. */
export function etichettaSettimana(lunedi: string): string {
  const giorni = giorniDellaSettimana(lunedi);
  const primo = new Date(`${giorni[0]}T12:00:00`);
  const ultimo = new Date(`${giorni[6]}T12:00:00`);
  const g = (d: Date) => d.toLocaleDateString("it-IT", { day: "numeric" });
  const m = (d: Date) => d.toLocaleDateString("it-IT", { month: "long" });
  return primo.getMonth() === ultimo.getMonth()
    ? `${g(primo)} – ${g(ultimo)} ${m(ultimo)}`
    : `${g(primo)} ${m(primo)} – ${g(ultimo)} ${m(ultimo)}`;
}

/** «giovedì 11 settembre», per la vista del giorno sul telefono. */
export function etichettaGiornoLunga(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/* ------------------------------------------------------------------ *
 *  Il mese: serve al mini-calendario della barra laterale e alla vista
 *  «Mese» del planning. Stesse regole della settimana — si comincia di
 *  lunedì — e stesse date pure, senza mai costruire un `Date` locale che
 *  al cambio dell'ora sposterebbe il giorno.
 * ------------------------------------------------------------------ */

/** Il primo giorno del mese che contiene questa data. */
export function primoDelMese(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

/** Avanti o indietro di N mesi, restando sul primo del mese. Il giorno non si
 * conserva di proposito: «31 marzo + 1 mese» non ha una risposta giusta, e
 * qui serve solo a muovere la testata del mini-calendario. */
export function spostaMese(dateKey: string, delta: number): string {
  const anno = Number(dateKey.slice(0, 4));
  const mese = Number(dateKey.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(anno, mese, 1));
  return d.toISOString().slice(0, 10);
}

export function stessoMese(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/**
 * Le caselle di un mese: dal lunedì della settimana in cui cade il primo, alla
 * domenica della settimana in cui cade l'ultimo. Quattro, cinque o sei righe —
 * non sempre sei: una riga di giorni di un altro mese in fondo alla schermata
 * è spazio tolto a quella che si sta guardando.
 */
export function grigliaMese(dateKey: string): string[] {
  const primo = primoDelMese(dateKey);
  const inizio = lunediDi(primo);
  const ultimo = shiftDateKey(spostaMese(primo, 1), -1);
  const fine = shiftDateKey(lunediDi(ultimo), 6);

  const giorni: string[] = [];
  for (let g = inizio; g <= fine; g = shiftDateKey(g, 1)) giorni.push(g);
  return giorni;
}

/** «Settembre 2026», con l'iniziale maiuscola: è una testata, non una frase. */
export function etichettaMese(dateKey: string): string {
  const testo = new Date(`${primoDelMese(dateKey)}T12:00:00`).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

/** «gio 11 set», l'etichetta corta che sta in una pillola. */
export function etichettaGiornoBreve(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Le iniziali dei sette giorni, per la testata del mini-calendario. */
export const INIZIALI_GIORNI = ["L", "M", "M", "G", "V", "S", "D"];
