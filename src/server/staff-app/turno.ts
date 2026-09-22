import type { StaffDepartment, WorkShiftKind } from "@prisma/client";
import { db } from "@/lib/db";
import { dateKeyInVenue, shiftDateKey } from "@/lib/venue-time";
import { minutiAOrario } from "@/lib/turni";
import { avanzamentoTurno } from "@/lib/avanzamento-turno";

/**
 * **Il turno di chi sta guardando lo schermo.**
 *
 * Il back office ha già `server/work-shifts.ts`, che legge la settimana di
 * tutti per il planning. Qui si legge **una persona**, e la domanda è quella
 * che si fa scendendo dal motorino: «oggi quando lavoro, dove, e con quanti
 * tavoli».
 *
 * Non ci sono tabelle nuove: `WorkShift` dice quando, `StaffAssignment` dove.
 * Le due non si guardano — sono scritte da due schermate diverse del back
 * office — e questo modulo è il primo posto in cui vengono messe in fila, che
 * è esattamente quello che chiede il §4 del brief.
 *
 * ## I minuti, non le date
 *
 * `WorkShift` tiene gli orari come minuti da mezzanotte, e 1440 significa
 * «mezzanotte di domani»: «18:00 → 00:00» si scrive 1080 → 1440. Il perché sta
 * in `lib/turni.ts`. Qui si eredita quella scelta e si converte solo all'ultimo
 * momento, quando serve dire se il turno è cominciato.
 */

export type TurnoStaff = {
  /** La data in forma `2026-09-18`, nel fuso del locale. */
  giorno: string;
  kind: WorkShiftKind;
  /** «18:00». Nullo per un riposo o un'assenza. */
  inizio: string | null;
  fine: string | null;
  inizioMinuti: number | null;
  fineMinuti: number | null;
  pausaMinuti: number | null;
  department: StaffDepartment | null;
  /** «Pranzo», «Cena»: il vocabolario delle fasce del locale. */
  servizio: string | null;
  note: string | null;
};

export type TurnoDiOggi = TurnoStaff & {
  /** Vero se adesso si è dentro l'intervallo. */
  inCorso: boolean;
  /** Minuti all'inizio. Negativo se è già cominciato, nullo per un riposo. */
  minutiAllInizio: number | null;
  /**
   * L'ora corrente in minuti da mezzanotte **nel fuso del locale**, grezza.
   *
   * Serve alla barra di avanzamento, che è un componente client e non può
   * rifare questo conto: nel browser `getHours()` dà il fuso del telefono,
   * che per un cameriere in trasferta o con l'orologio sbagliato non è
   * quello della sala. Si calcola una volta qui, dove il fuso del locale è
   * un dato e non un'ipotesi.
   */
  oraMinuti: number;
  /** Le sale in cui questa persona è assegnata oggi, senza ripetizioni. */
  aree: string[];
  /** Quanti tavoli le sono assegnati oggi. */
  tavoliAssegnati: number;
};

/** Un giorno senza riga: non è un riposo, è «non ancora pianificato». */
export type GiornoTurno = { giorno: string; turno: TurnoStaff | null };

function vista(w: {
  date: Date;
  kind: WorkShiftKind;
  startMinute: number | null;
  endMinute: number | null;
  breakMinutes: number | null;
  department: StaffDepartment | null;
  service: string | null;
  notes: string | null;
}): TurnoStaff {
  return {
    giorno: w.date.toISOString().slice(0, 10),
    kind: w.kind,
    inizio: w.startMinute === null ? null : minutiAOrario(w.startMinute),
    fine: w.endMinute === null ? null : minutiAOrario(w.endMinute),
    inizioMinuti: w.startMinute,
    fineMinuti: w.endMinute,
    pausaMinuti: w.breakMinutes,
    department: w.department,
    servizio: w.service,
    note: w.notes,
  };
}

/** La data a mezzanotte UTC, come la scrive `WorkShift.date` (`@db.Date`). */
function giornoUtc(chiave: string): Date {
  return new Date(`${chiave}T00:00:00.000Z`);
}

/**
 * Minuti da mezzanotte **nel fuso del locale**.
 *
 * Non si usa `getHours()` del server: il server è UTC, il locale è a Roma, e a
 * mezzanotte di differenza un turno serale risulterebbe non ancora cominciato
 * per due ore. Lo stesso motivo per cui esiste `lib/venue-time.ts`.
 */
function minutiAdesso(timeZone: string, adesso: Date): number {
  const parti = new Intl.DateTimeFormat("it-IT", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(adesso);
  const ore = Number(parti.find((p) => p.type === "hour")?.value ?? "0");
  const minuti = Number(parti.find((p) => p.type === "minute")?.value ?? "0");
  return ore * 60 + minuti;
}

/**
 * Il turno di oggi, con dove si sta e quanti tavoli si hanno.
 *
 * `null` quando per oggi non c'è nessuna riga: **non** è un riposo. Un riposo
 * è una riga con `kind: REST`, cioè una decisione presa; nessuna riga vuol dire
 * che la settimana non è ancora stata pianificata, e chi legge deve poter dire
 * due cose diverse.
 */
export async function turnoDiOggi(
  venueId: string,
  waiterId: string,
  timeZone: string,
  adesso = new Date(),
): Promise<TurnoDiOggi | null> {
  const chiave = dateKeyInVenue(adesso, timeZone);
  const giorno = giornoUtc(chiave);

  const [turno, assegnazioni] = await Promise.all([
    db.workShift.findFirst({ where: { venueId, waiterId, date: giorno } }),
    db.staffAssignment.findMany({
      where: { venueId, waiterId, date: giorno, scope: "TABLE" },
      select: { tableId: true, room: { select: { name: true } }, table: { select: { room: { select: { name: true } } } } },
    }),
  ]);

  if (!turno) return null;

  const base = vista(turno);
  const ora = minutiAdesso(timeZone, adesso);

  /*
    «Sono dentro il turno?» e «a che punto sono?» sono la stessa domanda, e
    fino a oggi erano due conti diversi scritti in due posti diversi — con la
    mezzanotte normalizzata in due modi che non coincidevano nei minuti di
    coda. Adesso rispondono tutte e due da `lib/avanzamento-turno.ts`, che è
    l'unico posto con delle prove sopra.
  */
  const avanzamento = avanzamentoTurno(base.inizioMinuti, base.fineMinuti, ora);
  const inCorso = base.kind === "WORK" && avanzamento?.stato === "in-corso";

  const aree = [
    ...new Set(
      assegnazioni
        .map((a) => a.room?.name ?? a.table?.room?.name ?? null)
        .filter((n): n is string => !!n),
    ),
  ];

  return {
    ...base,
    inCorso,
    minutiAllInizio: avanzamento?.stato === "prima" ? avanzamento.minutiRimanenti : null,
    oraMinuti: ora,
    aree,
    tavoliAssegnati: assegnazioni.filter((a) => a.tableId).length,
  };
}

/**
 * I turni di un intervallo di giorni, **buchi compresi**.
 *
 * Restituisce una casella per ogni giorno, anche vuota: un calendario in cui i
 * giorni non pianificati semplicemente non compaiono si legge come se quella
 * settimana fosse più corta.
 */
export async function turniNelPeriodo(
  venueId: string,
  waiterId: string,
  dal: string,
  giorni: number,
): Promise<GiornoTurno[]> {
  const chiavi = Array.from({ length: giorni }, (_, i) => shiftDateKey(dal, i));
  const righe = await db.workShift.findMany({
    where: {
      venueId,
      waiterId,
      date: { gte: giornoUtc(chiavi[0]), lte: giornoUtc(chiavi[chiavi.length - 1]) },
    },
    orderBy: { date: "asc" },
  });

  const perGiorno = new Map(righe.map((r) => [r.date.toISOString().slice(0, 10), vista(r)]));
  return chiavi.map((g) => ({ giorno: g, turno: perGiorno.get(g) ?? null }));
}

/**
 * Il prossimo turno di lavoro dopo oggi.
 *
 * Serve alla home dello chef (§32), dove «quando torno» è metà
 * dell'informazione che si cerca. I riposi non contano: «il prossimo giorno in
 * cui non lavori» non è una risposta utile a quella domanda.
 */
export async function prossimoTurno(
  venueId: string,
  waiterId: string,
  timeZone: string,
  adesso = new Date(),
): Promise<TurnoStaff | null> {
  const domani = giornoUtc(shiftDateKey(dateKeyInVenue(adesso, timeZone), 1));
  const riga = await db.workShift.findFirst({
    where: { venueId, waiterId, kind: "WORK", date: { gte: domani } },
    orderBy: { date: "asc" },
  });
  return riga ? vista(riga) : null;
}
