import { z } from "zod";
import { db } from "@/lib/db";
import {
  descrizioneGiorni,
  fineInMinuti,
  orarioAMinuti,
  ordinaGiorni,
  type FasciaServizio,
} from "@/lib/turni";

/**
 * I turni di servizio: **quando si prenota**, non chi lavora.
 *
 * Da non confondere con `server/work-shifts.ts`, che è il turno della persona.
 * Qui si configura la fascia in cui il locale accetta clienti — «Cena,
 * 19:00–23:00, 90 coperti, un orario ogni quarto d'ora» — e da queste righe
 * dipendono il modulo pubblico, la disponibilità, la mappa della sala e il
 * vocabolario dei servizi («Pranzo», «Cena») che si vede nei turni dello staff.
 *
 * Fino al 15 settembre queste righe **le scriveva solo il seed**: la pagina
 * Impostazioni le mostrava e basta, e un locale con orari diversi da quelli
 * della demo non aveva nessun modo di dirlo. Un'impostazione che si legge e
 * non si tocca è peggio di un'impostazione che non c'è: promette un controllo
 * che non esiste.
 *
 * **Una fascia, non sette righe.** Nel database ogni giorno ha la sua riga,
 * perché la disponibilità si interroga per giorno. Ma nessuno configura sette
 * cene: ne configura una e dice in che giorni si fa. Qui le righe identiche si
 * raccolgono in una fascia, e un salvataggio le riscrive tutte — comprese
 * quelle da creare per un giorno aggiunto e quelle da togliere per un giorno
 * tolto. Se un locale ha davvero il sabato diverso dagli altri giorni, quelle
 * righe non si raccolgono con le altre e restano una fascia a parte: è la
 * verità del dato, e si legge come tale.
 */

/** Un nome già usato in quel giorno: non un dato malformato, un conflitto. */
class ConflittoFascia extends Error {
  readonly code = "conflict";
}

/** Dati che non stanno in piedi fra loro: l'ora di fine prima di quella di
 *  inizio, un turno più corto di uno slot. Lo `status` è quello di Zod. */
class FasciaNonValida extends Error {
  readonly code = "validation_failed";
}

export const FasciaInput = z.object({
  /** Le righe da cui arriva questa fascia. Vuoto quando è nuova. */
  ids: z.array(z.string().min(1)).default([]),
  nome: z.string().trim().min(1, "required").max(40),
  /** «19:00». Minuti da mezzanotte li fa il server, non il browser. */
  inizio: z.string().trim(),
  fine: z.string().trim(),
  coperti: z.coerce.number().int().min(1).max(5_000),
  minutiSlot: z.coerce.number().int().min(5).max(240),
  giorni: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
});

export type FasciaInputType = z.infer<typeof FasciaInput>;

/* -------------------------------------------------------------------------- */
/*  Lettura                                                                   */
/* -------------------------------------------------------------------------- */

export async function listFasceServizio(venueId: string): Promise<FasciaServizio[]> {
  const righe = await db.shift.findMany({
    where: { venueId },
    orderBy: [{ startMinute: "asc" }, { name: "asc" }],
  });

  const perChiave = new Map<string, FasciaServizio>();
  for (const r of righe) {
    const chiave = [r.name, r.startMinute, r.endMinute, r.capacity, r.slotMinutes].join("|");
    const fascia = perChiave.get(chiave);
    if (fascia) {
      fascia.ids.push(r.id);
      fascia.giorni.push(r.weekday);
      continue;
    }
    perChiave.set(chiave, {
      ids: [r.id],
      nome: r.name,
      inizioMinuti: r.startMinute,
      fineMinuti: r.endMinute,
      coperti: r.capacity,
      minutiSlot: r.slotMinutes,
      giorni: [r.weekday],
    });
  }

  return [...perChiave.values()]
    .map((f) => ({ ...f, giorni: ordinaGiorni(f.giorni) }))
    .sort((a, b) => a.inizioMinuti - b.inizioMinuti || a.nome.localeCompare(b.nome, "it"));
}

/* -------------------------------------------------------------------------- */
/*  Scrittura                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Crea o aggiorna una fascia, giorno per giorno.
 *
 * Lo stesso ingresso serve per entrambe: una fascia nuova è una fascia con
 * `ids` vuoto. Chi la salva dichiara **come deve essere alla fine**, non cosa
 * abbiamo cambiato — le righe che avanzano si cancellano qui.
 */
export async function salvaFasciaServizio(venueId: string, raw: unknown): Promise<FasciaServizio> {
  const input = FasciaInput.parse(raw);
  const nome = input.nome.trim();

  const inizio = orarioAMinuti(input.inizio);
  if (inizio === null) throw new FasciaNonValida("L'ora di inizio non è un orario valido.");

  // `fineInMinuti` porta da solo oltre la mezzanotte: una cena 19:00 → 00:00
  // diventa 1140 → 1440, e nessuno deve dire «e poi è il giorno dopo».
  const fine = fineInMinuti(inizio, input.fine);
  if (fine === null) throw new FasciaNonValida("L'ora di fine non è un orario valido.");

  if (fine - inizio < input.minutiSlot) {
    throw new FasciaNonValida(
      "Il turno è più corto dell'intervallo fra un orario e l'altro: non ci starebbe nessun orario da proporre.",
    );
  }

  const giorni = ordinaGiorni([...new Set(input.giorni)]);

  const esistenti = input.ids.length
    ? await db.shift.findMany({ where: { venueId, id: { in: input.ids } } })
    : [];
  if (esistenti.length !== new Set(input.ids).size) throw new Error("not_found");

  /*
    Due turni con lo stesso nome nello stesso giorno renderebbero ambiguo il
    servizio: `getShiftWindowForDate()` cerca la fascia per nome e giorno, e ne
    troverebbe due; nei turni dello staff «Cena» diventerebbe due cose diverse.
    È l'unico vincolo vero, e si controlla prima di scrivere.
  */
  const conflitti = await db.shift.findMany({
    where: {
      venueId,
      name: nome,
      weekday: { in: giorni },
      id: { notIn: esistenti.map((e) => e.id) },
    },
    select: { weekday: true },
  });
  if (conflitti.length > 0) {
    throw new ConflittoFascia(
      `C'è già un turno «${nome}» ${descrizioneGiorni(conflitti.map((c) => c.weekday))}. ` +
        "Due turni con lo stesso nome nello stesso giorno non si distinguono: cambia nome, o togli quel giorno.",
    );
  }

  const perGiorno = new Map(esistenti.map((e) => [e.weekday, e]));
  const dati = {
    name: nome,
    startMinute: inizio,
    endMinute: fine,
    capacity: input.coperti,
    slotMinutes: input.minutiSlot,
    active: true,
  };
  const daEliminare = esistenti.filter((e) => !giorni.includes(e.weekday)).map((e) => e.id);

  const scritte = await db.$transaction([
    ...giorni.map((weekday) => {
      const riga = perGiorno.get(weekday);
      return riga
        ? db.shift.update({ where: { id: riga.id }, data: dati })
        : db.shift.create({ data: { venueId, weekday, ...dati } });
    }),
    ...(daEliminare.length ? [db.shift.deleteMany({ where: { id: { in: daEliminare } } })] : []),
  ]);

  const righe = scritte.slice(0, giorni.length) as { id: string; weekday: number }[];
  return {
    ids: righe.map((r) => r.id),
    nome,
    inizioMinuti: inizio,
    fineMinuti: fine,
    coperti: input.coperti,
    minutiSlot: input.minutiSlot,
    giorni,
  };
}

/** Toglie una fascia intera: tutte le righe che la compongono, in un colpo. */
export async function eliminaFasciaServizio(venueId: string, ids: string[]) {
  const esistenti = await db.shift.findMany({ where: { venueId, id: { in: ids } }, select: { id: true } });
  if (esistenti.length === 0) throw new Error("not_found");
  await db.shift.deleteMany({ where: { venueId, id: { in: esistenti.map((e) => e.id) } } });
  return { eliminate: esistenti.length };
}
