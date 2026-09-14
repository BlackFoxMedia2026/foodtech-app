import { z } from "zod";
import { StaffDepartment, WorkShiftKind } from "@prisma/client";
import { db } from "@/lib/db";
import { fieldDiff, recordAudit, type AuditActor } from "./audit";
import { MINUTI_MASSIMI, giorniDellaSettimana, haOrario } from "@/lib/turni";

/**
 * I turni: chi lavora, quando.
 *
 * Da non confondere con le due cose che esistevano già e che continuano a
 * esistere:
 *
 *   Shift            = le fasce di apertura del locale (lun, 19:00–23:00, 80 coperti)
 *   StaffAssignment  = **dove** sta una persona in un servizio (sala B, tavoli T1–T7)
 *   WorkShift        = **quando** lavora una persona, o non lavora
 *
 * Assegnare una zona a chi non è in turno resta possibile, e non è un difetto
 * da correggere qui: la sala si riorganizza durante il servizio, e un
 * gestionale che glielo impedisse alle 21:15 verrebbe aggirato con un foglio.
 */

const OrarioMinuti = z.number().int().min(0).max(MINUTI_MASSIMI);

export const WorkShiftInput = z
  .object({
    waiterId: z.string().min(1, "required"),
    /** `YYYY-MM-DD`. Il turno è di un giorno, anche quando finisce il giorno dopo. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date"),
    kind: z.nativeEnum(WorkShiftKind).default("WORK"),
    startMinute: OrarioMinuti.nullable().optional(),
    endMinute: OrarioMinuti.nullable().optional(),
    breakMinutes: z.number().int().min(0).max(480).nullable().optional(),
    department: z.nativeEnum(StaffDepartment).nullable().optional(),
    service: z.string().trim().max(60).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    /*
      Le regole sull'orario stanno **qui**, non nel form.

      Un controllo che vive solo nell'interfaccia è un controllo che non c'è:
      questa stessa rotta la può chiamare chiunque abbia una sessione e sappia
      scrivere una fetch. E le tre regole sono quelle che rendono un turno un
      turno: un orario, nell'ordine giusto, e una pausa che ci sta dentro.
    */
    if (!haOrario(data.kind)) return;
    if (data.startMinute == null || data.endMinute == null) {
      ctx.addIssue({ code: "custom", path: ["startMinute"], message: "orario_richiesto" });
      return;
    }
    if (data.endMinute <= data.startMinute) {
      ctx.addIssue({ code: "custom", path: ["endMinute"], message: "fine_prima_dell_inizio" });
      return;
    }
    if ((data.breakMinutes ?? 0) >= data.endMinute - data.startMinute) {
      ctx.addIssue({ code: "custom", path: ["breakMinutes"], message: "pausa_troppo_lunga" });
    }
  });

export type WorkShiftPayload = z.infer<typeof WorkShiftInput>;

/** Un riposo non ha orari, reparto o servizio: se arrivano lo stesso —
 * perché chi compilava aveva scelto «lavoro» e poi ha cambiato idea — si
 * buttano qui, una volta sola, invece di fidarsi che il form si sia pulito. */
function normalizza(data: WorkShiftPayload) {
  const conOrario = haOrario(data.kind);
  return {
    kind: data.kind,
    startMinute: conOrario ? data.startMinute ?? null : null,
    endMinute: conOrario ? data.endMinute ?? null : null,
    breakMinutes: conOrario ? data.breakMinutes ?? null : null,
    department: conOrario ? data.department ?? null : null,
    service: conOrario ? data.service || null : null,
    notes: data.notes || null,
  };
}

/** Le date in colonna `@db.Date` si scrivono a mezzanotte UTC: qualunque altra
 * ora e Postgres arrotonda al giorno sbagliato in mezzo mondo. */
function giornoUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export type TurnoDellaSettimana = {
  id: string;
  waiterId: string;
  dateKey: string;
  kind: WorkShiftKind;
  startMinute: number | null;
  endMinute: number | null;
  breakMinutes: number | null;
  department: StaffDepartment | null;
  service: string | null;
  notes: string | null;
};

/**
 * I turni di una settimana, già ridotti a quello che serve allo schermo.
 *
 * Torna un elenco piatto e non una mappa per persona: chi disegna la griglia
 * ha bisogno di indicizzarli per `waiterId|giorno`, e costruire quella mappa
 * è una riga dove serve. Restituire qui una struttura annidata obbligherebbe
 * anche la vista del giorno, che vuole l'ordine opposto, a disfarla.
 */
export async function listShiftsForWeek(venueId: string, lunedi: string): Promise<TurnoDellaSettimana[]> {
  const giorni = giorniDellaSettimana(lunedi);
  return listShiftsForRange(venueId, giorni[0], giorni[6]);
}

/**
 * Gli stessi turni, su un intervallo qualsiasi di giorni.
 *
 * Il calendario non guarda più solo la settimana: la vista «Giorno» ne vuole
 * uno, quella «Mese» ne vuole trentacinque o quarantadue. Estremi **inclusi**,
 * perché sono giorni e non istanti — `dal` e `al` sono due caselle del
 * calendario, e chi chiede «dal 7 al 13» si aspetta dentro anche il 13.
 */
export async function listShiftsForRange(
  venueId: string,
  dal: string,
  al: string,
): Promise<TurnoDellaSettimana[]> {
  const righe = await db.workShift.findMany({
    where: {
      venueId,
      date: { gte: giornoUtc(dal), lte: giornoUtc(al) },
    },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
  });

  return righe.map((r) => ({
    id: r.id,
    waiterId: r.waiterId,
    dateKey: r.date.toISOString().slice(0, 10),
    kind: r.kind,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    breakMinutes: r.breakMinutes,
    department: r.department,
    service: r.service,
    notes: r.notes,
  }));
}

export class WorkShiftError extends Error {
  constructor(readonly code: "not_found" | "staff_not_found" | "duplicato") {
    super(code);
    this.name = "WorkShiftError";
  }
}

export async function createWorkShift(venueId: string, raw: unknown, actor?: AuditActor) {
  const data = WorkShiftInput.parse(raw);

  // Il locale attivo lo decide la sessione, mai il corpo della richiesta: senza
  // questo controllo si potrebbe scrivere un turno sul personale di un altro
  // ristorante passandone l'id.
  const persona = await db.waiter.findFirst({ where: { id: data.waiterId, venueId }, select: { id: true } });
  if (!persona) throw new WorkShiftError("staff_not_found");

  /*
    Un turno per persona al giorno.

    Non è un vincolo del database perché il doppio turno (pranzo e cena in due
    righe) è una cosa che prima o poi servirà, e un indice unico andrebbe poi
    tolto con una migrazione distruttiva. È invece un controllo qui, perché nel
    frattempo due righe sullo stesso giorno sarebbero solo un doppio clic: la
    casella del calendario ne mostra una, e l'altra resterebbe invisibile e
    incancellabile.
  */
  const esistente = await db.workShift.findFirst({
    where: { venueId, waiterId: data.waiterId, date: giornoUtc(data.date) },
    select: { id: true },
  });
  if (esistente) throw new WorkShiftError("duplicato");

  const creato = await db.workShift.create({
    data: { venueId, waiterId: data.waiterId, date: giornoUtc(data.date), ...normalizza(data) },
  });
  await recordAudit(actor, "shift.create", "work_shift", creato.id, {
    giorno: data.date,
    tipo: creato.kind,
  });
  return creato;
}

export async function updateWorkShift(venueId: string, id: string, raw: unknown, actor?: AuditActor) {
  const esistente = await db.workShift.findFirst({ where: { id, venueId } });
  if (!esistente) throw new WorkShiftError("not_found");

  /*
    La persona e il giorno **si spostano**, e non è un di più.

    Prima erano bloccati, con la nota «per spostarlo si cancella e si
    ricrea». Nel calendario nuovo spostare è il gesto principale — si prende
    la card del giovedì e la si porta al venerdì — e farlo con DELETE + POST
    significa che, se il POST fallisce (per esempio perché quella persona un
    turno il venerdì ce l'ha già), il turno di partenza **è già stato
    cancellato**. Un trascinamento che perde dati non si può offrire.

    Qui è un UPDATE solo: o riesce, o non è successo niente.
  */
  const corpo = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const data = WorkShiftInput.parse({
    ...corpo,
    waiterId: typeof corpo.waiterId === "string" && corpo.waiterId ? corpo.waiterId : esistente.waiterId,
    date: typeof corpo.date === "string" && corpo.date ? corpo.date : esistente.date.toISOString().slice(0, 10),
  });

  const giorno = giornoUtc(data.date);
  const spostato = data.waiterId !== esistente.waiterId || giorno.getTime() !== esistente.date.getTime();
  if (spostato) {
    // Stesse due guardie della creazione: il locale lo decide la sessione, e
    // resta un turno per persona al giorno.
    const persona = await db.waiter.findFirst({ where: { id: data.waiterId, venueId }, select: { id: true } });
    if (!persona) throw new WorkShiftError("staff_not_found");
    const collisione = await db.workShift.findFirst({
      where: { venueId, waiterId: data.waiterId, date: giorno, NOT: { id } },
      select: { id: true },
    });
    if (collisione) throw new WorkShiftError("duplicato");
  }

  const aggiornato = await db.workShift.update({
    where: { id },
    data: { waiterId: data.waiterId, date: giorno, ...normalizza(data) },
  });
  const diff = fieldDiff(esistente, aggiornato);
  if (diff) await recordAudit(actor, "shift.update", "work_shift", id, diff);
  return aggiornato;
}

export async function deleteWorkShift(venueId: string, id: string, actor?: AuditActor) {
  const esistente = await db.workShift.findFirst({ where: { id, venueId } });
  if (!esistente) throw new WorkShiftError("not_found");
  await db.workShift.delete({ where: { id } });
  await recordAudit(actor, "shift.delete", "work_shift", id, {
    giorno: esistente.date.toISOString().slice(0, 10),
    tipo: esistente.kind,
  });
}
