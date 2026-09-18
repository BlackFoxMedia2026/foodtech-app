import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizzaE164, telefonoLeggibile } from "@/lib/telefono";
import { segnaEventoChiamata } from "@/server/chiamate";

/**
 * La coda delle persone da richiamare.
 *
 * ## Perché non basta l'elenco delle chiamate perse
 *
 * Perché una chiamata persa è un **fatto** e una richiamata è un **impegno**,
 * e i due non si comportano allo stesso modo. Il fatto resta per sempre;
 * l'impegno si chiude. Senza questa coda l'unico modo di dire «questa l'ho
 * già richiamata» era ricordarselo — e in quattro persone che lavorano sullo
 * stesso telefono nessuno se lo ricorda, quindi lo stesso cliente viene
 * richiamato due volte o nessuna.
 *
 * E c'è un secondo motivo: si finisce in coda anche **senza** una chiamata
 * persa. Uno chiama, c'è confusione, dice «mi richiami fra mezz'ora». Quella è
 * una richiamata da fare e la chiamata è stata regolarmente risposta.
 *
 * ## Una sola per numero, e il vincolo sta nel database
 *
 * Un indice unico parziale (`WHERE stato = 'OPEN'`, vedi la migrazione
 * `20260918140000_tavolo_voice_fase4`). Due persone che premono «da
 * richiamare» sulla stessa riga nello stesso istante non si vedrebbero a
 * vicenda: un controllo «ce n'è già una?» le farebbe passare entrambe. Così la
 * seconda viene rifiutata dal database e qui si restituisce quella che c'è
 * già — chi ha premuto vede la coda giusta, non un errore.
 *
 * ## Cosa **non** c'è
 *
 * Non c'è un pulsante che chiama. Il fornitore di oggi non sa fare chiamate
 * uscenti (`capacita.uscenti` è falso) e un pulsante «Richiama» che non
 * compone il numero è la cosa peggiore che questa schermata possa contenere.
 * Si richiama dal telefono del locale e qui si segna com'è andata: «fatta»,
 * «ho provato e non risponde», «non richiamare».
 */

export type Richiamata = {
  id: string;
  /** Il numero come si legge a voce: chi richiama lo legge da qui. */
  numero: string;
  /** Il numero in forma normalizzata, per comporlo dove si può. */
  numeroGrezzo: string;
  ospite: { id: string; nome: string } | null;
  /** La chiamata da cui nasce, quando nasce da una chiamata. */
  callId: string | null;
  tentativi: number;
  entro: Date | null;
  nota: string | null;
  creata: Date;
  /** È oltre il momento entro cui conveniva richiamare. */
  inRitardo: boolean;
};

export class NumeroNonRichiamabileError extends Error {
  constructor() {
    super("numero_non_richiamabile");
    this.name = "NumeroNonRichiamabileError";
  }
}

/* -------------------------------------------------------------------------- */
/*  Aprire                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Mette una persona in coda da richiamare.
 *
 * Se per quel numero c'è già una richiamata aperta, restituisce quella: due
 * volte lo stesso impegno non è un impegno più forte, è una coda che si smette
 * di guardare.
 */
export async function apriRichiamata(
  venueId: string,
  dati: {
    /** Il numero da richiamare, in qualunque forma sia scritto. */
    numero?: string | null;
    /** La chiamata da cui nasce: il numero e l'ospite si leggono da lei. */
    callId?: string | null;
    guestId?: string | null;
    entro?: Date | null;
    nota?: string | null;
  },
  attore?: string | null,
): Promise<{ id: string; giaInCoda: boolean }> {
  let numero = dati.numero ?? null;
  let guestId = dati.guestId ?? null;
  let callId = dati.callId ?? null;

  if (callId) {
    const chiamata = await db.phoneCall.findFirst({
      where: { id: callId, venueId },
      select: { id: true, fromNumber: true, guestId: true },
    });
    /* La chiamata deve essere di **questo** locale: l'identificativo arriva da
       una richiesta, e senza questo controllo si metterebbe in coda il cliente
       di un altro ristorante. */
    if (!chiamata) throw new Error("not_found");
    numero = numero ?? chiamata.fromNumber;
    guestId = guestId ?? chiamata.guestId;
    callId = chiamata.id;
  }

  /* Un numero riservato non si richiama: non è un guasto, è un caso previsto —
     e l'unica risposta onesta è dirlo, non mettere in coda una riga su cui non
     si può fare niente. */
  const normalizzato = normalizzaE164(numero);
  if (!normalizzato) throw new NumeroNonRichiamabileError();

  try {
    const creata = await db.voiceCallback.create({
      data: {
        venueId,
        numero: normalizzato,
        guestId,
        callId,
        entro: dati.entro ?? null,
        nota: dati.nota?.trim().slice(0, 400) || null,
      },
      select: { id: true },
    });
    if (callId) {
      await segnaEventoChiamata(callId, "CALLBACK_CREATED", {
        actor: attore ?? null,
        meta: { richiamataId: creata.id },
      });
    }
    return { id: creata.id, giaInCoda: false };
  } catch (err) {
    /* P2002: l'indice unico parziale ha respinto la seconda. Si restituisce
       quella che c'è già — chi ha premuto voleva che quella persona fosse in
       coda, e lo è. */
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const esistente = await db.voiceCallback.findFirst({
        where: { venueId, numero: normalizzato, stato: "OPEN" },
        select: { id: true },
      });
      if (esistente) return { id: esistente.id, giaInCoda: true };
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  Chiudere                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Chiude una richiamata.
 *
 * `IGNORED` non è un fallimento: decidere di non richiamare qualcuno è una
 * decisione, e distinguerla da una dimenticanza è tutto il valore di questa
 * coda. Una coda che si può solo svuotare «facendo» si svuota chiudendo a caso.
 */
export async function chiudiRichiamata(
  venueId: string,
  id: string,
  opzioni: {
    come: "DONE" | "IGNORED";
    nota?: string | null;
    attore?: string | null;
  },
): Promise<void> {
  const riga = await db.voiceCallback.findFirst({
    where: { id, venueId },
    select: { id: true, callId: true, stato: true },
  });
  if (!riga) throw new Error("not_found");
  /* Già chiusa: non si riscrive chi l'ha chiusa e quando. Due persone che
     premono insieme non devono cambiarsi la firma a vicenda. */
  if (riga.stato !== "OPEN") return;

  const nota = opzioni.nota?.trim();
  await db.voiceCallback.update({
    where: { id: riga.id },
    data: {
      stato: opzioni.come,
      chiusoIl: new Date(),
      chiusoDa: opzioni.attore ?? null,
      ...(nota ? { nota: nota.slice(0, 400) } : {}),
    },
  });

  if (riga.callId) {
    await segnaEventoChiamata(riga.callId, "CALLBACK_RESOLVED", {
      actor: opzioni.attore ?? null,
      meta: { come: opzioni.come, ...(nota ? { nota } : {}) },
    });
  }
}

/**
 * «Ho provato e non risponde.»
 *
 * Resta in coda e il contatore sale. È l'unica cosa vera da fare quando si
 * richiama qualcuno che non risponde: chiuderla sarebbe una bugia, lasciarla
 * identica farebbe riprovare al collega dopo cinque minuti.
 */
export async function segnaTentativo(
  venueId: string,
  id: string,
): Promise<number> {
  const riga = await db.voiceCallback.findFirst({
    where: { id, venueId, stato: "OPEN" },
    select: { id: true },
  });
  if (!riga) throw new Error("not_found");
  const dopo = await db.voiceCallback.update({
    where: { id: riga.id },
    data: { tentativi: { increment: 1 } },
    select: { tentativi: true },
  });
  return dopo.tentativi;
}

/* -------------------------------------------------------------------------- */
/*  Leggere                                                                   */
/* -------------------------------------------------------------------------- */

/** Le richiamate aperte, dalla più vecchia: chi aspetta da più tempo va prima. */
export async function richiamateAperte(
  venueId: string,
  adesso: Date = new Date(),
): Promise<Richiamata[]> {
  const righe = await db.voiceCallback.findMany({
    where: { venueId, stato: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      numero: true,
      callId: true,
      tentativi: true,
      entro: true,
      nota: true,
      createdAt: true,
      guest: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  return righe.map((r) => ({
    id: r.id,
    numero: telefonoLeggibile(r.numero) ?? r.numero,
    numeroGrezzo: r.numero,
    ospite: r.guest
      ? {
          id: r.guest.id,
          nome: `${r.guest.firstName}${r.guest.lastName ? ` ${r.guest.lastName}` : ""}`,
        }
      : null,
    callId: r.callId,
    tentativi: r.tentativi,
    entro: r.entro,
    nota: r.nota,
    creata: r.createdAt,
    inRitardo: r.entro != null && r.entro.getTime() < adesso.getTime(),
  }));
}
