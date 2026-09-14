import type { WorkShiftKind } from "@prisma/client";
import { db } from "@/lib/db";
import { durataNetta, lunediDi, giorniDellaSettimana } from "@/lib/turni";
import { shiftDateKey } from "@/lib/venue-time";

/**
 * Turni e presenze **di una persona**: una vista filtrata sul calendario, non
 * un secondo calendario.
 *
 * Le ore sono quelle **pianificate**: Tavolo non ha una timbratura, quindi
 * «lavorate» qui vuol dire «turni già passati», e la scheda lo scrive così.
 * Il giorno in cui ci sarà un orologio, il numero cambierà nome e fonte, non
 * posto.
 */

export type TurnoProssimo = {
  dateKey: string;
  kind: WorkShiftKind;
  startMinute: number | null;
  endMinute: number | null;
  service: string | null;
};

export type Assenza = {
  kind: WorkShiftKind;
  /** Primo e ultimo giorno, inclusi. Uguali per un giorno solo. */
  dal: string;
  al: string;
  giorni: number;
};

export type RiepilogoPresenze = {
  settimana: {
    lunedi: string;
    minutiProgrammati: number;
    minutiSvolti: number;
    turni: number;
    assenze: number;
  };
  prossimi: TurnoProssimo[];
  anno: {
    anno: number;
    ferieUsate: number;
    feriePianificate: number;
    permessi: number;
    malattia: number;
  };
  storicoAssenze: Assenza[];
};

const ASSENZE: WorkShiftKind[] = ["VACATION", "LEAVE", "SICK_LEAVE"];

function giornoUtc(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/** Giorni consecutivi dello stesso tipo diventano un intervallo: «12–15
 * agosto · Ferie» e non quattro righe uguali. */
export function raggruppaAssenze(
  righe: { dateKey: string; kind: WorkShiftKind }[],
): Assenza[] {
  const ordinate = [...righe].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const gruppi: Assenza[] = [];
  for (const r of ordinate) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.kind === r.kind && shiftDateKey(ultimo.al, 1) === r.dateKey) {
      ultimo.al = r.dateKey;
      ultimo.giorni += 1;
    } else {
      gruppi.push({ kind: r.kind, dal: r.dateKey, al: r.dateKey, giorni: 1 });
    }
  }
  return gruppi.reverse();
}

export async function riepilogoPresenze(venueId: string, waiterId: string, oggi: string): Promise<RiepilogoPresenze> {
  const lunedi = lunediDi(oggi);
  const giorni = giorniDellaSettimana(lunedi);
  const anno = Number(oggi.slice(0, 4));
  const inizioAnno = `${anno}-01-01`;
  const fineAnno = `${anno}-12-31`;
  const fineProssimi = shiftDateKey(oggi, 13);

  // Un'interrogazione sola, dall'inizio dell'anno alle due settimane a venire:
  // copre la settimana, i prossimi turni e il conto delle assenze.
  const dal = inizioAnno < lunedi ? inizioAnno : lunedi;
  const al = fineAnno > fineProssimi ? fineAnno : fineProssimi;
  const righe = await db.workShift.findMany({
    where: { venueId, waiterId, date: { gte: giornoUtc(dal), lte: giornoUtc(al) } },
    orderBy: { date: "asc" },
    select: { date: true, kind: true, startMinute: true, endMinute: true, breakMinutes: true, service: true },
  });
  const turni = righe.map((r) => ({ ...r, dateKey: r.date.toISOString().slice(0, 10) }));

  const settimana = turni.filter((t) => t.dateKey >= giorni[0] && t.dateKey <= giorni[6]);
  let minutiProgrammati = 0;
  let minutiSvolti = 0;
  let nTurni = 0;
  let nAssenze = 0;
  for (const t of settimana) {
    if (t.kind === "WORK" && t.startMinute != null && t.endMinute != null) {
      const minuti = durataNetta(t.startMinute, t.endMinute, t.breakMinutes);
      minutiProgrammati += minuti;
      if (t.dateKey < oggi) minutiSvolti += minuti;
      nTurni++;
    } else if (ASSENZE.includes(t.kind)) {
      nAssenze++;
    }
  }

  const prossimi: TurnoProssimo[] = turni
    .filter((t) => t.dateKey >= oggi && t.dateKey <= shiftDateKey(oggi, 6))
    .map((t) => ({ dateKey: t.dateKey, kind: t.kind, startMinute: t.startMinute, endMinute: t.endMinute, service: t.service }));

  const assenzeAnno = turni.filter((t) => ASSENZE.includes(t.kind) && t.dateKey >= inizioAnno && t.dateKey <= fineAnno);
  const conta = (kind: WorkShiftKind, filtro?: (dateKey: string) => boolean) =>
    assenzeAnno.filter((t) => t.kind === kind && (!filtro || filtro(t.dateKey))).length;

  return {
    settimana: { lunedi, minutiProgrammati, minutiSvolti, turni: nTurni, assenze: nAssenze },
    prossimi,
    anno: {
      anno,
      ferieUsate: conta("VACATION", (d) => d < oggi),
      feriePianificate: conta("VACATION", (d) => d >= oggi),
      permessi: conta("LEAVE"),
      malattia: conta("SICK_LEAVE"),
    },
    storicoAssenze: raggruppaAssenze(assenzeAnno.filter((t) => t.dateKey <= oggi)).slice(0, 12),
  };
}
