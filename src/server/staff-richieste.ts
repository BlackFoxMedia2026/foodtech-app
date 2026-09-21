import { z } from "zod";
import type { StaffRequestStatus, StaffRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { NOME_TIPO_RICHIESTA, TIPI_RICHIESTA } from "@/lib/richieste-personale";
import { recordAudit, type AuditActor } from "@/server/audit";

/**
 * Le richieste del personale: ferie, cambio turno, indisponibilità.
 *
 * ## Cosa c'era
 *
 * `StaffRequest` stava nello schema con **ventinove righe** — due enum, gli
 * orari, la nota di chi decide, l'indice per stato — e nessuna riga di codice
 * la toccava. Intanto le ferie si chiedono a voce, si segnano su un foglio, e
 * il giorno del turno nessuno ricorda chi aveva chiesto cosa.
 *
 * ## Le tre decisioni
 *
 * **1. Chi decide non è chi chiede.** Approvare richiede `manage_shifts`: è
 * la stessa capacità che serve a spostare un turno, perché approvare una ferie
 * **è** spostare i turni di quella settimana.
 *
 * **2. Una richiesta approvata non si modifica.** Si ritira o si rifiuta: se
 * si potesse riscrivere dopo l'approvazione, «te l'avevo chiesto» e «non me
 * l'hai approvato» diventerebbero due verità diverse sullo stesso foglio. Le
 * decisioni si aggiungono, non si sovrascrivono.
 *
 * **3. Le date sono giorni, non istanti.** `requestedFrom` e `requestedTo`
 * sono colonne `@db.Date`: una ferie dal 24 al 26 non ha un'ora, e
 * confrontarla coi millisecondi la farebbe cominciare o finire un giorno
 * prima a seconda del fuso del server. Si scrivono a mezzanotte UTC, come già
 * fa `work-shifts.ts`.
 */

/* I nomi stanno in `lib/richieste-personale.ts`: li legge anche la schermata,
   che è client, e una seconda copia qui divergerebbe al primo rinominamento. */
export { NOME_TIPO_RICHIESTA, TIPI_RICHIESTA } from "@/lib/richieste-personale";

export const NOME_STATO_RICHIESTA: Record<StaffRequestStatus, string> = {
  PENDING: "Da decidere",
  APPROVED: "Approvata",
  REJECTED: "Rifiutata",
  WITHDRAWN: "Ritirata",
};

/** Solo un giorno, senza ora: `2026-12-24`. */
const Giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Serve un giorno come 2026-12-24");

export const RichiestaInput = z
  .object({
    waiterId: z.string().min(1),
    type: z.enum(TIPI_RICHIESTA),
    dal: Giorno,
    /** Assente = un giorno solo. */
    al: Giorno.optional(),
    /** Solo per il cambio turno: minuti dalla mezzanotte. */
    dalleMinuti: z.number().int().min(0).max(2880).optional(),
    alleMinuti: z.number().int().min(0).max(2880).optional(),
    motivo: z.string().trim().max(1000).optional(),
    shiftId: z.string().min(1).optional(),
  })
  .refine((d) => !d.al || d.al >= d.dal, {
    message: "Il giorno di fine non può venire prima di quello d'inizio",
    path: ["al"],
  })
  .refine(
    (d) => d.dalleMinuti == null || d.alleMinuti == null || d.alleMinuti > d.dalleMinuti,
    { message: "L'orario di fine deve venire dopo quello d'inizio", path: ["alleMinuti"] },
  );

export type RichiestaInputType = z.infer<typeof RichiestaInput>;

export class RichiestaError extends Error {
  constructor(
    public code: "non_trovata" | "gia_decisa" | "persona_di_altro_locale" | "sovrapposta",
  ) {
    super(code);
  }
}

/** Mezzanotte UTC del giorno: le colonne sono `@db.Date`. */
function giorno(d: string): Date {
  return new Date(`${d}T00:00:00.000Z`);
}

export async function creaRichiesta(
  venueId: string,
  raw: unknown,
  actor?: AuditActor,
) {
  const dati = RichiestaInput.parse(raw);

  const persona = await db.waiter.findFirst({
    where: { id: dati.waiterId, venueId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!persona) throw new RichiestaError("persona_di_altro_locale");

  const dal = giorno(dati.dal);
  const al = giorno(dati.al ?? dati.dal);

  /*
    Una richiesta aperta che copre gli stessi giorni non si duplica.

    Non è pignoleria: due ferie sovrapposte per la stessa persona sono due
    righe da decidere che dicono la stessa cosa, e chi approva la prima lascia
    la seconda in sospeso per sempre. Le decise non contano — una ferie
    rifiutata si può richiedere, ed è il caso normale quando si sposta di una
    settimana.
  */
  const sovrapposta = await db.staffRequest.findFirst({
    where: {
      waiterId: persona.id,
      status: "PENDING",
      type: dati.type,
      requestedFrom: { lte: al },
      requestedTo: { gte: dal },
    },
    select: { id: true },
  });
  if (sovrapposta) throw new RichiestaError("sovrapposta");

  const creata = await db.staffRequest.create({
    data: {
      venueId,
      waiterId: persona.id,
      type: dati.type,
      requestedFrom: dal,
      requestedTo: al,
      ...(dati.dalleMinuti != null ? { requestedStartMinute: dati.dalleMinuti } : {}),
      ...(dati.alleMinuti != null ? { requestedEndMinute: dati.alleMinuti } : {}),
      ...(dati.motivo ? { reason: dati.motivo } : {}),
      ...(dati.shiftId ? { shiftId: dati.shiftId } : {}),
    },
  });

  await recordAudit(actor, "staff.richiesta", "waiter", persona.id, {
    richiesta: creata.id,
    tipo: dati.type,
    dal: dati.dal,
    al: dati.al ?? dati.dal,
  });

  return creata;
}

/**
 * Decide una richiesta: approvata, rifiutata, o ritirata da chi l'ha chiesta.
 *
 * La condizione sta **dentro** la scrittura: due responsabili che decidono la
 * stessa richiesta nello stesso istante non possono scrivere due decisioni
 * diverse, perché il secondo non trova più una richiesta da decidere. Un
 * «leggi lo stato, poi scrivi» li farebbe passare entrambi, e il registro
 * direbbe una cosa mentre la persona ne ha sentita un'altra.
 */
export async function decidiRichiesta(
  venueId: string,
  richiestaId: string,
  decisione: { stato: Extract<StaffRequestStatus, "APPROVED" | "REJECTED" | "WITHDRAWN">; nota?: string },
  actor?: AuditActor,
) {
  const presa = await db.staffRequest.updateMany({
    where: { id: richiestaId, venueId, status: "PENDING" },
    data: {
      status: decisione.stato,
      reviewedAt: new Date(),
      ...(actor?.userId ? { reviewedByUserId: actor.userId } : {}),
      ...(decisione.nota ? { reviewNote: decisione.nota.slice(0, 1000) } : {}),
    },
  });

  if (presa.count === 0) {
    /* O non esiste, o l'ha già decisa qualcun altro: le due cose si
       distinguono con una lettura, perché «non esiste» e «è già stata
       approvata» sono due risposte diverse per chi ha premuto il pulsante. */
    const esiste = await db.staffRequest.findFirst({
      where: { id: richiestaId, venueId },
      select: { status: true },
    });
    throw new RichiestaError(esiste ? "gia_decisa" : "non_trovata");
  }

  await recordAudit(actor, "staff.richiesta_decisa", "waiter", richiestaId, {
    stato: decisione.stato,
  });

  return db.staffRequest.findUniqueOrThrow({ where: { id: richiestaId } });
}

export type RichiestaVista = {
  id: string;
  tipo: StaffRequestType;
  tipoNome: string;
  stato: StaffRequestStatus;
  statoNome: string;
  dal: Date;
  al: Date;
  dalleMinuti: number | null;
  alleMinuti: number | null;
  motivo: string | null;
  notaDecisione: string | null;
  decisaIl: Date | null;
  persona: { id: string; nome: string } | null;
};

function vista(r: {
  id: string;
  type: StaffRequestType;
  status: StaffRequestStatus;
  requestedFrom: Date | null;
  requestedTo: Date | null;
  requestedStartMinute: number | null;
  requestedEndMinute: number | null;
  reason: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  waiter?: { id: string; firstName: string; lastName: string | null } | null;
}): RichiestaVista {
  return {
    id: r.id,
    tipo: r.type,
    tipoNome: NOME_TIPO_RICHIESTA[r.type],
    stato: r.status,
    statoNome: NOME_STATO_RICHIESTA[r.status],
    /* `requestedFrom` è nullo solo per righe scritte a mano: si mostra il
       giorno di creazione invece di una casella vuota che sembra un guasto. */
    dal: r.requestedFrom ?? new Date(0),
    al: r.requestedTo ?? r.requestedFrom ?? new Date(0),
    dalleMinuti: r.requestedStartMinute,
    alleMinuti: r.requestedEndMinute,
    motivo: r.reason,
    notaDecisione: r.reviewNote,
    decisaIl: r.reviewedAt,
    persona: r.waiter
      ? {
          id: r.waiter.id,
          nome: `${r.waiter.firstName}${r.waiter.lastName ? ` ${r.waiter.lastName}` : ""}`,
        }
      : null,
  };
}

const CAMPI = {
  id: true,
  type: true,
  status: true,
  requestedFrom: true,
  requestedTo: true,
  requestedStartMinute: true,
  requestedEndMinute: true,
  reason: true,
  reviewNote: true,
  reviewedAt: true,
  waiter: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Le richieste da decidere, le più vecchie in cima: aspettano da più tempo. */
export async function daDecidere(venueId: string): Promise<RichiestaVista[]> {
  const righe = await db.staffRequest.findMany({
    where: { venueId, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: CAMPI,
  });
  return righe.map(vista);
}

/** Tutte le richieste di una persona, la più recente in cima. */
export async function richiesteDi(
  venueId: string,
  waiterId: string,
  limite = 50,
): Promise<RichiestaVista[]> {
  const righe = await db.staffRequest.findMany({
    where: { venueId, waiterId },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: CAMPI,
  });
  return righe.map(vista);
}
