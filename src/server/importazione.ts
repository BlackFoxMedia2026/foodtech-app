import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { leggiFile, type RigaLetta, type Scarto } from "@/lib/import-csv";
import { zonedTimeToInstant } from "@/server/availability";
import { recordAudit, type AuditActor } from "@/server/audit";
import { trovaOspite, trovaOCreaOspite } from "@/server/guest-match";
import { refreshGuestStats } from "@/server/guest-intelligence";

/**
 * Portare dentro i clienti di un altro gestionale.
 *
 * ## Perché è la funzione più commerciale del prodotto
 *
 * Perché **Quandoo spegne tutto il 31 dicembre 2026** e lascia circa seimila
 * ristoranti italiani senza sistema. Chi cambia gestionale non si preoccupa
 * delle prenotazioni di domani — quelle le riscrive — si preoccupa dei
 * **clienti**: nomi, numeri, quante volte sono venuti. È l'unica cosa che non
 * si ricompra, ed è la ragione per cui un ristoratore insoddisfatto resta dove
 * sta per anni.
 *
 * ## Le due cose che questo file garantisce
 *
 * 1. **L'anteprima non scrive niente.** Si legge il file, si conta cosa
 *    succederebbe, si mostra. Solo un secondo gesto scrive. Un'importazione
 *    che parte dal caricamento del file è un errore che non si annulla: in
 *    mezzo c'è sempre un file sbagliato, la colonna delle date all'americana,
 *    il locale sbagliato.
 * 2. **Importare due volte lo stesso file non raddoppia niente.** La chiave è
 *    nel database (`Booking.idempotencyKey`, unica), non in un controllo
 *    prima della scrittura: due clic sul pulsante, o un file ricaricato la
 *    settimana dopo perché «non ero sicuro», non producono doppioni.
 *
 * ## Cosa NON fa, e perché
 *
 * - **Non importa il consenso al marketing.** Un consenso è una prova che una
 *   persona ha dato a qualcun altro e non si eredita con un CSV. Gli ospiti
 *   importati si possono avvisare della **loro** prenotazione; per una
 *   campagna il consenso lo devono dare qui.
 * - **Non controlla la disponibilità.** Chi importa porta dentro anche le cene
 *   di tre anni fa, e un controllo di capienza le rifiuterebbe tutte. Lo stato
 *   segue la data: passata → `COMPLETED`, futura → `CONFIRMED`.
 * - **Non assegna tavoli.** Il tavolo del gestionale di prima non esiste qui,
 *   e indovinarlo vorrebbe dire una sala apparecchiata sbagliata.
 */

/** Quanto si considera «passato»: prima di adesso, semplicemente. */
export type Conteggi = {
  /** Righe lette dal file, intestazione esclusa. */
  righeFile: number;
  /** Righe con abbastanza dati per essere importate. */
  leggibili: number;
  scartate: number;
  /** Righe senza data: sono clienti, non prenotazioni. */
  soloClienti: number;
  prenotazioniPassate: number;
  prenotazioniFuture: number;
  /** Ospiti che qui non c'erano. */
  ospitiNuovi: number;
  /** Ospiti già in rubrica: si arricchiscono, non si duplicano. */
  ospitiGiaVisti: number;
  /** Righe già importate in passato: la seconda volta non fanno niente. */
  giaImportate: number;
};

export type Anteprima = {
  conteggi: Conteggi;
  /** Le colonne riconosciute e quelle no: si dicono. */
  colonne: { riconosciute: string[]; ignorate: string[] };
  /** I primi scarti, con il numero di riga del foglio di calcolo. */
  scarti: Scarto[];
  /** Le prime righe, come le abbiamo capite: è la prova che il file è letto bene. */
  esempi: {
    riga: number;
    nome: string;
    contatto: string | null;
    quando: string | null;
    persone: number | null;
    giaVisto: boolean;
  }[];
  tagliato: boolean;
};

export type EsitoImportazione = Anteprima & {
  creati: { ospiti: number; prenotazioni: number };
};

/** Quanti scarti ed esempi si mostrano: un elenco di mille non si legge. */
const QUANTI_MOSTRARE = 20;

/**
 * La chiave con cui una riga importata si riconosce, per sempre.
 *
 * Non è l'identificativo del gestionale di prima — quello non c'è in metà dei
 * file — ma **quello che rende quella cena quella cena**: il locale, la
 * persona, l'istante. Ricaricare lo stesso file non riscrive niente perché il
 * database rifiuta la chiave duplicata: è il vincolo nel database, non un
 * controllo che due richieste in parallelo si scambierebbero senza vedersi.
 */
export function chiaveRiga(venueId: string, contatto: string, istante: Date): string {
  const impronta = createHash("sha256")
    .update(`${venueId}|${contatto.toLowerCase()}|${istante.toISOString()}`)
    .digest("hex")
    .slice(0, 40);
  return `import:${impronta}`;
}

/** Il contatto che identifica la riga: l'email quando c'è, altrimenti il numero. */
function contattoDi(riga: RigaLetta): string {
  return (riga.email || riga.telefono || riga.nome).trim();
}

/** L'istante della prenotazione, nell'ora **del locale**. */
function istanteDi(riga: RigaLetta, fuso: string): Date | null {
  if (!riga.giorno) return null;
  const [anno, mese, giorno] = riga.giorno.split("-").map(Number);
  if (!anno || !mese || !giorno) return null;
  /* Senza ora si mette alle 20:00: una cena importata senza orario è una cena,
     e metterla a mezzanotte la farebbe comparire nel giorno dopo in ogni
     schermata. Chi ha l'ora nel file la usa; agli altri si dice nell'anteprima
     quante righe non l'avevano. */
  const [ore, minuti] = (riga.ora ?? "20:00").split(":").map(Number);
  return zonedTimeToInstant(
    { year: anno, month: mese, day: giorno },
    (ore ?? 20) * 60 + (minuti ?? 0),
    fuso,
  );
}

type Preparata = {
  riga: RigaLetta;
  istante: Date | null;
  chiave: string | null;
  guestId: string | null;
};

/** Quello che serve prima di decidere: chi c'è già, cosa è già importato. */
async function prepara(venueId: string, righe: RigaLetta[], fuso: string): Promise<Preparata[]> {
  const preparate: Preparata[] = [];

  for (const riga of righe) {
    const istante = istanteDi(riga, fuso);
    /* `trovaOspite` è lo stesso posto che riconosce chi chiama al telefono: se
       qui si confrontassero i contatti a modo proprio, la stessa persona
       risulterebbe nuova importando e conosciuta telefonando. */
    const guestId = await trovaOspite(venueId, { email: riga.email, phone: riga.telefono });
    preparate.push({
      riga,
      istante,
      chiave: istante ? chiaveRiga(venueId, contattoDi(riga), istante) : null,
      guestId,
    });
  }

  return preparate;
}

async function chiaviGiaViste(chiavi: string[]): Promise<Set<string>> {
  if (chiavi.length === 0) return new Set();
  const righe = await db.booking.findMany({
    where: { idempotencyKey: { in: chiavi } },
    select: { idempotencyKey: true },
  });
  return new Set(righe.map((r) => r.idempotencyKey).filter((k): k is string => !!k));
}

function conta(preparate: Preparata[], gia: Set<string>, scartate: number, righeFile: number): Conteggi {
  const adesso = Date.now();
  let soloClienti = 0;
  let passate = 0;
  let future = 0;
  let giaImportate = 0;
  const nuovi = new Set<string>();
  let giaVisti = 0;

  for (const p of preparate) {
    if (p.chiave && gia.has(p.chiave)) giaImportate += 1;
    else if (!p.istante) soloClienti += 1;
    else if (p.istante.getTime() < adesso) passate += 1;
    else future += 1;

    if (p.guestId) giaVisti += 1;
    else nuovi.add(contattoDi(p.riga).toLowerCase());
  }

  return {
    righeFile,
    leggibili: preparate.length,
    scartate,
    soloClienti,
    prenotazioniPassate: passate,
    prenotazioniFuture: future,
    ospitiNuovi: nuovi.size,
    ospitiGiaVisti: giaVisti,
    giaImportate,
  };
}

function vista(
  preparate: Preparata[],
  gia: Set<string>,
  lettura: ReturnType<typeof leggiFile>,
  fuso: string,
): Anteprima {
  const formato = new Intl.DateTimeFormat("it-IT", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return {
    conteggi: conta(preparate, gia, lettura.scarti.length, lettura.totali),
    colonne: {
      riconosciute: Object.keys(lettura.colonne.indici),
      ignorate: lettura.colonne.ignorate,
    },
    scarti: lettura.scarti.slice(0, QUANTI_MOSTRARE),
    esempi: preparate.slice(0, 5).map((p) => ({
      riga: p.riga.riga,
      nome: [p.riga.nome, p.riga.cognome].filter(Boolean).join(" "),
      contatto: p.riga.telefono || p.riga.email || null,
      /* La data si mostra **nell'ora del locale**: è l'unico modo per cui chi
         guarda l'anteprima possa accorgersi che le date sono lette al
         contrario. È il controllo vero di tutta questa funzione. */
      quando: p.istante ? formato.format(p.istante) : null,
      persone: p.riga.persone,
      giaVisto: !!p.guestId,
    })),
    tagliato: lettura.tagliato,
  };
}

async function fusoDi(venueId: string): Promise<string> {
  const v = await db.venue.findUnique({ where: { id: venueId }, select: { timezone: true } });
  return v?.timezone ?? "Europe/Rome";
}

/**
 * Cosa succederebbe. **Non scrive niente.**
 *
 * È la metà del valore di questa funzione: il file sbagliato, la colonna delle
 * date all'americana e il locale sbagliato si vedono qui, dove costano un
 * clic, invece che dopo, dove costano duemila righe da cancellare a mano.
 */
export async function anteprimaImportazione(venueId: string, testo: string): Promise<Anteprima> {
  const fuso = await fusoDi(venueId);
  const lettura = leggiFile(testo);
  const preparate = await prepara(venueId, lettura.righe, fuso);
  const gia = await chiaviGiaViste(preparate.map((p) => p.chiave).filter((k): k is string => !!k));
  return vista(preparate, gia, lettura, fuso);
}

/**
 * Scrive. Restituisce gli stessi numeri dell'anteprima, più cosa ha creato.
 *
 * Una riga per volta e non una transazione sola: un file di cinquemila righe
 * dentro una transazione tiene il database occupato per minuti e, se la
 * connessione cade a metà, non importa **niente** — dopo venti minuti di
 * attesa. Riga per riga, un'interruzione lascia dentro quello che è entrato, e
 * ricaricare il file completa il lavoro invece di ricominciarlo: è la chiave
 * di idempotenza che rende sicuro riprovare.
 */
export async function eseguiImportazione(
  venueId: string,
  testo: string,
  opz: { actor?: AuditActor } = {},
): Promise<EsitoImportazione> {
  const fuso = await fusoDi(venueId);
  const lettura = leggiFile(testo);
  const preparate = await prepara(venueId, lettura.righe, fuso);
  const gia = await chiaviGiaViste(preparate.map((p) => p.chiave).filter((k): k is string => !!k));

  let ospitiCreati = 0;
  let prenotazioniCreate = 0;
  const daRiallineare = new Set<string>();

  for (const p of preparate) {
    const { riga } = p;
    if (p.chiave && gia.has(p.chiave)) continue;

    const ospite = await trovaOCreaOspite(venueId, {
      firstName: riga.nome,
      lastName: riga.cognome,
      email: riga.email,
      phone: riga.telefono,
      /* Nessun consenso al marketing, mai: vedi il commento in testa al file. */
    });
    if (!ospite.giaConosciuto) ospitiCreati += 1;

    if (!p.istante || !p.chiave) continue;

    const passata = p.istante.getTime() < Date.now();
    try {
      await db.booking.create({
        data: {
          venueId,
          guestId: ospite.guestId,
          partySize: riga.persone ?? 2,
          startsAt: p.istante,
          /* Una cena di tre anni fa è una cena avvenuta; una di venerdì è una
             prenotazione da rispettare. Mettere tutto `CONFIRMED` riempirebbe
             l'agenda di stasera con dieci anni di storia. */
          status: passata ? "COMPLETED" : "CONFIRMED",
          source: "IMPORT",
          notes: riga.note,
          idempotencyKey: p.chiave,
          ...(passata ? { closedAt: p.istante } : {}),
        },
      });
      prenotazioniCreate += 1;
      daRiallineare.add(ospite.guestId);
    } catch (err) {
      /* P2002: la chiave c'era già. Non è un errore — è due persone che
         importano lo stesso file nello stesso momento, o un file ricaricato.
         Si va avanti: il conto delle «già importate» lo dice. */
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") throw err;
    }
  }

  /* I contatori della scheda ospite si rifanno **una volta per persona**, non
     una per prenotazione: importare cinquanta cene dello stesso cliente non
     deve costare cinquanta riletture. */
  for (const guestId of daRiallineare) await refreshGuestStats(guestId);

  const risultato = vista(preparate, gia, lettura, fuso);

  await recordAudit(opz.actor, "venue.import", "venue", venueId, {
    righeFile: risultato.conteggi.righeFile,
    ospitiCreati,
    prenotazioniCreate,
    scartate: risultato.conteggi.scartate,
    /* Le colonne ignorate finiscono nel registro: il giorno in cui qualcuno
       chiede «e le allergie?», la risposta è già scritta. */
    colonneIgnorate: risultato.colonne.ignorate,
  });

  return { ...risultato, creati: { ospiti: ospitiCreati, prenotazioni: prenotazioniCreate } };
}
