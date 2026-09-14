import type { StaffDepartment, WorkShiftKind } from "@prisma/client";
import { MINUTI_MASSIMI } from "@/lib/turni";

/**
 * La geometria del calendario dei turni, senza React.
 *
 * Qui dentro non si disegna niente: si risponde a tre domande che la griglia
 * non può risolvere mentre renderizza — dove sta una card, quanto è larga
 * quando ce ne sono altre nella stessa fascia, e quante persone ci sono in
 * un dato momento. Sono le tre cose che rendono un calendario leggibile o
 * illeggibile, quindi vivono in un modulo puro e testabile invece che dentro
 * un `useMemo`.
 */

/** Il passo con cui si conta la copertura: mezz'ora. Al quarto d'ora il
 * grafico diventa rumore, all'ora sparisce il buco fra pranzo e cena. */
export const PASSO_COPERTURA = 30;

/** A quanto si arrotonda un orario trascinato. Quindici minuti è il passo in
 * cui i turni si scrivono davvero: nessuno mette un cameriere alle 18:07. */
export const PASSO_TRASCINAMENTO = 15;

export const ORA_APERTURA_PREDEFINITA = 8;
export const ORA_CHIUSURA_PREDEFINITA = 24;

export type TurnoPosizionabile = { id: string; startMinute: number; endMinute: number };

export type Collocazione<T> = {
  turno: T;
  /** Da quale corsia parte, 0-based. */
  colonna: number;
  /** Quante corsie ha il gruppo a cui appartiene. */
  colonne: number;
  /** Quante corsie occupa: 1 di norma, di più quando alla sua destra è
   * libero — è quello che impedisce alle card di restare sottili per colpa
   * di un turno corto che non le sfiora nemmeno. */
  ampiezza: number;
};

export type BloccoTurni<T> = {
  /** `inizio-fine`: è già univoco dentro un giorno, ed è stabile fra un
   * render e l'altro — serve come chiave di React. */
  id: string;
  startMinute: number;
  endMinute: number;
  turni: T[];
};

/**
 * Prima delle corsie: **chi ha lo stesso identico orario sta in una card
 * sola**.
 *
 * Questo pezzo è nato guardando dei dati veri. In un ristorante la brigata
 * non ha undici orari diversi: ha *un servizio*, e undici persone che lo
 * fanno dalle 18 alle 24. Con una card a testa quel giorno diventa undici
 * corsie da dieci pixel — undici strisce di colore senza una parola dentro,
 * cioè esattamente la tabella illeggibile da cui si veniva, in verticale.
 *
 * Raggruppati, gli stessi undici turni sono **una card larga quanto la
 * colonna** che dice l'orario una volta e sotto elenca i nomi. È più
 * informazione, non meno: prima non si leggeva nessun nome, adesso si
 * leggono tutti quelli che ci stanno.
 *
 * Il caso del brief — «09–17 Nicola, 09–15 Luca» — resta due card affiancate,
 * perché gli orari sono diversi. Si unisce solo ciò che è identico, che è
 * anche l'unica cosa che si può scrivere una volta sola senza mentire.
 */
export function raggruppaPerOrario<T extends TurnoPosizionabile>(turni: T[]): BloccoTurni<T>[] {
  const per = new Map<string, T[]>();
  for (const turno of turni) {
    const chiave = `${turno.startMinute}-${turno.endMinute}`;
    const lista = per.get(chiave);
    if (lista) lista.push(turno);
    else per.set(chiave, [turno]);
  }
  return [...per.entries()].map(([id, lista]) => ({
    id,
    startMinute: lista[0].startMinute,
    endMinute: lista[0].endMinute,
    turni: lista,
  }));
}

/**
 * Le corsie: turni che si sovrappongono si affiancano, non si coprono.
 *
 * L'algoritmo è quello dei calendari (Google, Outlook, tutti): si ordinano
 * per inizio, si raccolgono in **gruppi** di sovrapposizione — un gruppo si
 * chiude quando arriva un turno che comincia dopo la fine di tutti quelli
 * dentro — e dentro ogni gruppo ognuno prende la prima corsia libera.
 *
 * Il passaggio in più è `ampiezza`. Senza, tre turni in un gruppo valgono
 * sempre un terzo di colonna ciascuno, anche il 09–17 che incrocia solo il
 * primo dei due. Con l'allargamento a destra, un turno si prende lo spazio
 * che nessuno gli contende: nel caso normale — due lunghi e uno corto — si
 * vedono due card larghe invece di tre strisce.
 */
export function disponiInCorsie<T extends TurnoPosizionabile>(turni: T[]): Collocazione<T>[] {
  const ordinati = [...turni].sort(
    (a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute || a.id.localeCompare(b.id),
  );

  const esito: Collocazione<T>[] = [];
  let gruppo: { turno: T; colonna: number }[] = [];
  let fineGruppo = Number.NEGATIVE_INFINITY;

  function chiudiGruppo() {
    if (gruppo.length === 0) return;
    const colonne = Math.max(...gruppo.map((g) => g.colonna)) + 1;
    for (const membro of gruppo) {
      esito.push({
        turno: membro.turno,
        colonna: membro.colonna,
        colonne,
        ampiezza: ampiezzaLibera(membro, gruppo, colonne),
      });
    }
    gruppo = [];
    fineGruppo = Number.NEGATIVE_INFINITY;
  }

  for (const turno of ordinati) {
    if (turno.startMinute >= fineGruppo) chiudiGruppo();
    let colonna = 0;
    while (gruppo.some((g) => g.colonna === colonna && g.turno.endMinute > turno.startMinute)) colonna++;
    gruppo.push({ turno, colonna });
    fineGruppo = Math.max(fineGruppo, turno.endMinute);
  }
  chiudiGruppo();

  return esito;
}

function ampiezzaLibera<T extends TurnoPosizionabile>(
  soggetto: { turno: T; colonna: number },
  gruppo: { turno: T; colonna: number }[],
  colonne: number,
): number {
  let ampiezza = 1;
  for (let c = soggetto.colonna + 1; c < colonne; c++) {
    const occupata = gruppo.some(
      (altro) =>
        altro.colonna === c &&
        altro.turno.startMinute < soggetto.turno.endMinute &&
        soggetto.turno.startMinute < altro.turno.endMinute,
    );
    if (occupata) break;
    ampiezza++;
  }
  return ampiezza;
}

/** Quante persone sono in servizio in ogni fascia da mezz'ora. È il numero
 * che il responsabile cerca davvero: non «quanti turni oggi», ma «alle 20:30
 * quanti siamo». */
export function coperturaPerFascia(
  turni: TurnoPosizionabile[],
  da: number,
  a: number,
  passo: number = PASSO_COPERTURA,
): number[] {
  const fasce = Math.max(0, Math.ceil((a - da) / passo));
  const conta = new Array<number>(fasce).fill(0);
  for (const turno of turni) {
    const primo = Math.max(0, Math.floor((turno.startMinute - da) / passo));
    const ultimo = Math.min(fasce, Math.ceil((turno.endMinute - da) / passo));
    for (let i = primo; i < ultimo; i++) conta[i]++;
  }
  return conta;
}

/**
 * La fascia oraria da disegnare.
 *
 * Parte dalle 8 alle 24 — la giornata di un ristorante — e si allarga quanto
 * basta a contenere quello che c'è davvero. Il contrario (mostrare sempre le
 * 24 ore) vorrebbe dire otto ore di griglia vuota in cima a ogni schermata,
 * cioè costringere a scorrere per arrivare al servizio.
 */
export function fasciaVisibile(turni: TurnoPosizionabile[]): { da: number; a: number } {
  let da = ORA_APERTURA_PREDEFINITA * 60;
  let a = ORA_CHIUSURA_PREDEFINITA * 60;
  for (const turno of turni) {
    da = Math.min(da, Math.floor(turno.startMinute / 60) * 60);
    a = Math.max(a, Math.ceil(turno.endMinute / 60) * 60);
  }
  return {
    da: Math.max(0, da),
    a: Math.min(MINUTI_MASSIMI, Math.max(a, da + 60)),
  };
}

/** Le tacche orarie da etichettare nella colonna delle ore. */
export function orePiene(da: number, a: number): number[] {
  const ore: number[] = [];
  for (let m = Math.ceil(da / 60) * 60; m <= a; m += 60) ore.push(m);
  return ore;
}

export function arrotondaAlPasso(minuti: number, passo: number = PASSO_TRASCINAMENTO): number {
  return Math.round(minuti / passo) * passo;
}

/* ------------------------------------------------------------------ */

export type FamigliaTurno = "sala" | "cucina" | "bar" | "direzione" | "altro" | "riposo" | "assenza";

const FAMIGLIA_PER_REPARTO: Record<StaffDepartment, FamigliaTurno> = {
  SALA: "sala",
  CUCINA: "cucina",
  BAR: "bar",
  DIREZIONE: "direzione",
  ALTRO: "altro",
};

/**
 * A quale famiglia di colore appartiene un turno: **il reparto**.
 *
 * Era la fascia oraria — mattina, pranzo, sera. Il difetto era che il colore
 * diceva una cosa già detta due volte: da dove sta la card nella griglia, e
 * dall'orario scritto dentro. Il reparto invece non si vede da nessun'altra
 * parte, ed è la domanda che si fa per prima guardando una colonna piena:
 * *stasera in cucina siamo abbastanza?*
 *
 * Il reparto è quello del **turno**, non quello della persona, quando i due
 * differiscono: `WorkShift.department` è l'override che esiste apposta per la
 * sera in cui il commis di sala copre il bar, e in quella sera va contato nel
 * bar. Chi chiama passa già il valore risolto.
 *
 * I due modi di non lavorare restano due famiglie a sé — non hanno un reparto
 * addosso, hanno un'assenza.
 */
export function famigliaDiTurno(kind: WorkShiftKind, department: StaffDepartment): FamigliaTurno {
  if (kind === "REST" || kind === "UNAVAILABLE") return "riposo";
  if (kind !== "WORK") return "assenza";
  return FAMIGLIA_PER_REPARTO[department];
}
