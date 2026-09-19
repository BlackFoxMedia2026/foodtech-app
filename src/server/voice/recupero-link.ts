import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { PASSI_RECUPERO } from "@/lib/voice-recupero";
import { normalizzaE164 } from "@/lib/telefono";
import { sendMessage } from "@/server/messaging/send";

/**
 * Riprendere una telefonata interrotta a metà.
 *
 * ## Il caso, e perché è quello che conta
 *
 * Il risponditore ha cominciato a prendere una prenotazione e la chiamata è
 * finita **prima della conferma**: la linea cade, il cliente ci ripensa, il
 * bambino urla. Fino a ieri quel numero restava una riga nello storico.
 *
 * Il concorrente, di quelle chiamate, consegna **un elenco da scaricare** — lo
 * ha detto il suo cliente: «è possibile scaricare un report che ti dice quante
 * sono le persone che non hanno finito la prenotazione». Noi mandiamo un link
 * che riapre la prenotazione **con dentro quello che aveva già detto**: il
 * giorno, l'ora, le persone. È il punto in cui questo prodotto è più avanti
 * del suo, e non per poco.
 *
 * ## Il token
 *
 * In tabella sta il suo **hash**: chi legge il database non deve poter aprire
 * il link di nessuno. Vale una volta — quando nasce la prenotazione si
 * consuma — e scade. Stesso principio del reset della password.
 *
 * ## Quello che non si finge
 *
 * Se su questa installazione non c'è un canale per mandare il messaggio, il
 * link **esiste comunque** e la riga lo dice (`SENZA_CANALE`). Non si finge un
 * invio, e non si nasconde il motivo per cui il cliente non ha ricevuto
 * niente: è l'unica informazione che permette di accorgersene.
 */

/**
 * Quanto vale il link.
 *
 * Quarantott'ore come il reset della password, e per la stessa ragione: chi
 * riattacca alle otto di sera guarda il telefono la mattina dopo. Più corto
 * perderebbe la prenotazione; molto più lungo lascerebbe in giro un link che
 * crea prenotazioni per giorni.
 */
export const ORE_VALIDITA_RECUPERO = 48;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const InterrottaInput = z.object({
  /** L'identificativo della chiamata nel centralino. */
  chiamata: z.string().min(1).max(120),
  /** Il numero di chi ha chiamato: è dove va il link. */
  numero: z.string().trim().min(3).max(40),
  persone: z.coerce.number().int().min(1).max(50).optional(),
  /** Data e ora desiderate, se si sono capite. */
  quando: z.coerce.date().optional(),
  passo: z.enum(PASSI_RECUPERO).optional(),
});

export type EsitoRecupero = {
  /** Il link da mandare. Torna **una volta sola**: dopo c'è solo l'hash. */
  link: string;
  invio: "DA_MANDARE" | "MANDATO" | "SENZA_CANALE" | "NON_RIUSCITO";
  /** Vero quando il recupero c'era già: il risponditore ha raccontato due volte. */
  giaAperto: boolean;
};

/**
 * Apre il recupero e prova a mandare il link.
 *
 * Idempotente sulla chiamata: il centralino può raccontare la stessa
 * interruzione due volte — una rete che ritenta, un riavvio a metà — e due
 * link per la stessa telefonata sono **due messaggi alla stessa persona**, che
 * è il modo più rapido di far sembrare il prodotto rotto.
 */
export async function apriRecupero(
  venueId: string,
  raw: unknown,
  origine: string,
  adesso = new Date(),
): Promise<EsitoRecupero> {
  const dati = InterrottaInput.parse(raw);

  const chiamata = await db.phoneCall.findFirst({
    where: { venueId, externalId: dati.chiamata },
    select: { id: true, guestId: true, guest: { select: { firstName: true } } },
  });

  const esistente = chiamata
    ? await db.voiceRecovery.findUnique({
        where: { phoneCallId: chiamata.id },
        select: { id: true, invio: true, scadeIl: true },
      })
    : null;

  /* Già aperto e ancora valido: si restituisce com'è, **senza il link** — che
     non è ricostruibile, perché in tabella c'è solo l'hash. Chi chiama non ne
     ha bisogno: il messaggio è già partito. */
  if (esistente && esistente.scadeIl.getTime() > adesso.getTime()) {
    return { link: "", invio: esistente.invio, giaAperto: true };
  }

  const numero = normalizzaE164(dati.numero) ?? dati.numero.trim();
  const token = randomBytes(32).toString("hex");
  const link = `${origine}/riprendi/${token}`;

  const riga = await db.voiceRecovery.upsert({
    where: { id: esistente?.id ?? "mai-esistito" },
    create: {
      venueId,
      phoneCallId: chiamata?.id ?? null,
      numero,
      tokenHash: hash(token),
      scadeIl: new Date(adesso.getTime() + ORE_VALIDITA_RECUPERO * 3_600_000),
      persone: dati.persone ?? null,
      quando: dati.quando ?? null,
      nome: chiamata?.guest?.firstName ?? null,
      passo: dati.passo ?? null,
    },
    update: {
      /* Il precedente era scaduto: si riapre con un token nuovo, e il vecchio
         muore perché l'hash viene sovrascritto. */
      tokenHash: hash(token),
      scadeIl: new Date(adesso.getTime() + ORE_VALIDITA_RECUPERO * 3_600_000),
      persone: dati.persone ?? null,
      quando: dati.quando ?? null,
      passo: dati.passo ?? null,
      invio: "DA_MANDARE",
    },
    select: { id: true },
  });

  const invio = await mandaIlLink(venueId, riga.id, numero, link, chiamata?.guestId ?? null);
  return { link, invio, giaAperto: false };
}

/** Il testo del messaggio. Corto: è un SMS, e il link è la cosa che conta. */
export function testoRecupero(nomeLocale: string, link: string, nome?: string | null) {
  const apertura = nome ? `Ciao ${nome}, ` : "";
  return `${apertura}la telefonata con ${nomeLocale} si è interrotta. Puoi finire la prenotazione qui: ${link}`;
}

async function mandaIlLink(
  venueId: string,
  recoveryId: string,
  numero: string,
  link: string,
  guestId: string | null,
): Promise<EsitoRecupero["invio"]> {
  const locale = await db.venue.findUnique({ where: { id: venueId }, select: { name: true } });
  const riga = await db.voiceRecovery.findUniqueOrThrow({
    where: { id: recoveryId },
    select: { nome: true },
  });

  const esito = await sendMessage({
    venueId,
    channel: "SMS",
    to: numero,
    body: testoRecupero(locale?.name ?? "il ristorante", link, riga.nome),
    kind: "voice.recupero_link",
    guestId,
    venueName: locale?.name,
  });

  /*
    Tre esiti, tre stati, e nessuno che finga.

    `no_channel` non e un errore: e la verita di questa installazione — nessun
    fornitore di SMS configurato — e va scritta, perche e la ragione per cui il
    cliente non ha ricevuto niente. Segnarla «non riuscito» manderebbe a
    cercare un guasto che non c'e; segnarla «mandato» sarebbe una bugia che si
    scopre solo dal cliente che non richiama.
  */
  const stato: EsitoRecupero["invio"] = esito.sent
    ? "MANDATO"
    : esito.reason === "no_channel" || esito.reason === "no_address"
      ? "SENZA_CANALE"
      : "NON_RIUSCITO";

  await db.voiceRecovery.update({
    where: { id: recoveryId },
    data: {
      invio: stato,
      messageLogId: esito.sent ? esito.messageLogId : null,
    },
  });

  return stato;
}

/** Quello che serve alla schermata di chi apre il link. */
export type VistaRipresa = {
  venueId: string;
  nomeLocale: string;
  numero: string;
  nome: string | null;
  persone: number | null;
  quando: Date | null;
};

/**
 * Legge il recupero da un token.
 *
 * `null` per tutto quello che non vale — scaduto, già usato, inventato — e
 * **senza dire quale delle tre**: distinguere direbbe a chi prova token a caso
 * quando ha indovinato.
 */
export async function leggiRipresa(token: string, adesso = new Date()): Promise<VistaRipresa | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;

  const riga = await db.voiceRecovery.findUnique({
    where: { tokenHash: hash(token) },
    select: {
      venueId: true,
      numero: true,
      nome: true,
      persone: true,
      quando: true,
      scadeIl: true,
      bookingId: true,
      venue: { select: { name: true, active: true } },
    },
  });

  if (!riga) return null;
  if (riga.bookingId) return null;
  if (riga.scadeIl.getTime() < adesso.getTime()) return null;
  if (!riga.venue.active) return null;

  return {
    venueId: riga.venueId,
    nomeLocale: riga.venue.name,
    numero: riga.numero,
    nome: riga.nome,
    persone: riga.persone,
    quando: riga.quando,
  };
}

/**
 * Segna il recupero come convertito.
 *
 * L'unicità su `bookingId` sta nel database e non in un controllo: due
 * richieste che arrivano insieme creerebbero due prenotazioni entrambe
 * «recuperate», e il tasso di recupero direbbe più del vero.
 */
export async function consumaRipresa(token: string, bookingId: string, adesso = new Date()) {
  const esito = await db.voiceRecovery.updateMany({
    where: { tokenHash: hash(token), bookingId: null, scadeIl: { gt: adesso } },
    data: { bookingId, convertitoIl: adesso },
  });
  return esito.count === 1;
}

/* -------------------------------------------------------------------------- */
/*  Quello che resta da seguire                                               */
/* -------------------------------------------------------------------------- */

export type InterrottaVista = {
  id: string;
  numero: string;
  nome: string | null;
  persone: number | null;
  quando: Date | null;
  passo: string | null;
  invio: "DA_MANDARE" | "MANDATO" | "SENZA_CANALE" | "NON_RIUSCITO";
  creata: Date;
  /**
   * Vero quando **nessuno le ha detto niente**: il link non è partito, e
   * allora questa persona non sa che esistiamo. Va richiamata a mano, ed è la
   * ragione per cui questa riga sta fra le cose da fare e non in uno storico.
   */
  daRichiamare: boolean;
};

/**
 * Le telefonate interrotte che non hanno ancora prodotto una prenotazione.
 *
 * Due giorni, che è la vita del link: oltre, o la persona ha prenotato
 * altrove o ha chiamato di nuovo, e una lista che non si svuota si smette di
 * guardare.
 *
 * L'ordine mette davanti quelle a cui **non è partito niente**: chi ha
 * ricevuto il link sta decidendo, chi non l'ha ricevuto sta aspettando senza
 * saperlo.
 */
export async function interrotteDaSeguire(
  venueId: string,
  adesso = new Date(),
): Promise<InterrottaVista[]> {
  const righe = await db.voiceRecovery.findMany({
    where: {
      venueId,
      bookingId: null,
      createdAt: { gte: new Date(adesso.getTime() - ORE_VALIDITA_RECUPERO * 3_600_000) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      numero: true,
      nome: true,
      persone: true,
      quando: true,
      passo: true,
      invio: true,
      createdAt: true,
    },
  });

  return righe
    .map((r) => ({
      id: r.id,
      numero: r.numero,
      nome: r.nome,
      persone: r.persone,
      quando: r.quando,
      passo: r.passo,
      invio: r.invio,
      creata: r.createdAt,
      daRichiamare: r.invio !== "MANDATO",
    }))
    .sort((a, b) => Number(b.daRichiamare) - Number(a.daRichiamare));
}
