import { z } from "zod";
import { db } from "@/lib/db";
import { ID_OPERATORI } from "@/lib/operatori-telefonici";
import { normalizzaE164 } from "@/lib/telefono";
import { recordAudit, type AuditActor } from "@/server/audit";

/**
 * Da dove entrano le chiamate in questo locale.
 *
 * ## Le due strade, e perche non sono equivalenti
 *
 * **Scatoletta** (gateway FXO attaccato alla linea del locale): la chiamata
 * entra nel centralino **prima** che qualcuno risponda. Tavolo vede tutto —
 * comprese le telefonate che il personale prende — e puo dire *quante non
 * riesci a prendere*, che e il numero che nessun concorrente puo mostrare.
 * Nessun operatore da chiamare, nessun numero nuovo.
 *
 * **Deviazione**: il numero del locale resta il suo, e l'operatore telefonico
 * devia a un numero nostro quando nessuno risponde o quando la linea e
 * occupata. Tavolo vede **solo quello che gli viene deviato**: le chiamate
 * risposte dal personale non le conosce, e non le conta.
 *
 * La seconda esiste perche **a una SIM non si attacca nessuna scatoletta**, e
 * il locale piccolo lavora col cellulare. Vedi
 * `/docs/TAVOLO-VOICE-RISPONDITORE.md`.
 *
 * ## Perche `ingresso` puo essere nullo
 *
 * Perche «non ancora scelto» e uno stato vero, e le due strade chiedono gesti
 * diversi: partire da quella sbagliata manda un ristoratore a chiamare il suo
 * operatore per niente, o gli fa aspettare una scatoletta che non gli serve.
 */

/** Quanti squilli si possono chiedere. Sotto i due non c'e tempo di alzare. */
export const SQUILLI_MINIMI = 2;
export const SQUILLI_MASSIMI = 10;

/**
 * Il numero pubblico **non e obbligatorio per scegliere la strada.**
 *
 * La prima domanda della procedura e «come ti arrivano le telefonate?», e si
 * risponde con un clic. Pretendere il numero in quel momento vorrebbe dire un
 * modulo davanti a una scelta, cioe il motivo per cui la scheda del telefono
 * era «troppo incasinata»: prima si sceglie la strada, poi si compilano i
 * dati di quella strada.
 */
export const IngressoInput = z.object({
  ingresso: z.enum(["GATEWAY", "DEVIAZIONE"]),
  /** Il numero che i clienti chiamano da sempre. */
  numeroPubblico: z.string().trim().max(40).optional(),
  operatore: z.enum(ID_OPERATORI as [string, ...string[]]).optional(),
  squilliChiesti: z.number().int().min(SQUILLI_MINIMI).max(SQUILLI_MASSIMI).optional(),
});

export type IngressoInputType = z.infer<typeof IngressoInput>;

/**
 * Quello che la schermata deve sapere.
 *
 * `provata` non e una casella che qualcuno spunta: e **un fatto letto dai
 * dati** — e arrivata una telefonata dopo che la deviazione e stata chiesta?
 * Allora funziona. Una spunta a mano qui sarebbe la prima cosa a diventare
 * falsa, e il ristoratore lo scoprirebbe il sabato sera.
 */
export type VistaIngresso = {
  ingresso: "GATEWAY" | "DEVIAZIONE" | null;
  numeroPubblico: string | null;
  operatore: string | null;
  squilliChiesti: number | null;
  chiestaIl: Date | null;
  /** Il numero **nostro** a cui deviare. Nullo = non ancora assegnato. */
  numeroTavolo: string | null;
  /** L'ultima telefonata arrivata, qualunque strada abbia fatto. */
  ultimaChiamata: Date | null;
  /** Vero quando una telefonata e arrivata **dopo** la richiesta all'operatore. */
  provata: boolean;
};

export async function vistaIngresso(venueId: string): Promise<VistaIngresso> {
  const [conf, numero, ultima] = await Promise.all([
    db.voiceConfiguration.findUnique({
      where: { venueId },
      select: {
        ingresso: true,
        numeroPubblico: true,
        operatore: true,
        squilliChiesti: true,
        deviazioneChiestaIl: true,
      },
    }),
    /* Il numero a cui deviare. `numeroMostrato` quando c'e, perche a un
       ristoratore si mostra il numero come lo comporrebbe, non la forma E.164
       che usa il centralino. */
    db.voiceNumber.findFirst({
      where: { venueId, attivo: true },
      orderBy: { createdAt: "asc" },
      select: { numeroEsterno: true, numeroMostrato: true },
    }),
    db.phoneCall.findFirst({
      where: { venueId },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);

  const chiestaIl = conf?.deviazioneChiestaIl ?? null;
  const ultimaChiamata = ultima?.startedAt ?? null;

  return {
    ingresso: conf?.ingresso ?? null,
    numeroPubblico: conf?.numeroPubblico ?? null,
    operatore: conf?.operatore ?? null,
    squilliChiesti: conf?.squilliChiesti ?? null,
    chiestaIl,
    numeroTavolo: numero?.numeroMostrato ?? numero?.numeroEsterno ?? null,
    ultimaChiamata,
    /* Una chiamata **prima** della richiesta non prova niente: era arrivata da
       un'altra strada, o da una prova precedente. Il confronto e sulle date, e
       non su «ce n'e almeno una». */
    provata: !!chiestaIl && !!ultimaChiamata && ultimaChiamata.getTime() >= chiestaIl.getTime(),
  };
}

/**
 * Scrive la scelta.
 *
 * `deviazioneChiestaIl` si sposta a **adesso** ogni volta che si salva la
 * strada della deviazione: chi cambia numero, operatore o squilli sta
 * rifacendo la richiesta, e la prova precedente non vale piu per la
 * configurazione nuova. Il contrario — tenere la data della prima volta —
 * lascerebbe una spunta verde su una deviazione che nessuno ha piu provato.
 *
 * `adesso` si passa per una ragione precisa, la stessa di `versioneServizio`:
 * queste date si confrontano fra loro al **millisecondo**, e una prova che
 * chiama due volte di seguito le fa cadere nello stesso istante. Con
 * l'orologio dentro la funzione, la prova che dovrebbe diventare rossa resta
 * verde per un caso di tempismo — e non si accorgerebbe di niente.
 */
export async function salvaIngresso(
  venueId: string,
  raw: unknown,
  actor?: AuditActor,
  adesso = new Date(),
) {
  const dati = IngressoInput.parse(raw);

  const numeroPubblico = dati.numeroPubblico
    ? (normalizzaE164(dati.numeroPubblico) ?? dati.numeroPubblico.trim())
    : null;

  const deviazione = dati.ingresso === "DEVIAZIONE";
  const operatore = deviazione ? (dati.operatore ?? null) : null;
  const squilliChiesti = deviazione ? (dati.squilliChiesti ?? null) : null;

  const prima = await db.voiceConfiguration.findUnique({
    where: { venueId },
    select: {
      numeroPubblico: true,
      operatore: true,
      squilliChiesti: true,
      deviazioneChiestaIl: true,
    },
  });

  /*
    Quando la data della richiesta si sposta, e quando no.

    Si sposta se **qualcosa di materiale e cambiato** — il numero, l'operatore,
    gli squilli — perche allora la deviazione e stata richiesta di nuovo e la
    prova di prima non vale per la configurazione nuova. Non si sposta se si
    salva la stessa cosa due volte: la spunta verde della prova sparirebbe per
    un salvataggio che non ha cambiato niente, e chi la vede sparire va a
    richiamare l'operatore per un problema che non esiste.
  */
  const cambiato =
    (prima?.numeroPubblico ?? null) !== numeroPubblico ||
    (prima?.operatore ?? null) !== operatore ||
    (prima?.squilliChiesti ?? null) !== squilliChiesti;

  const chiestaIl = !deviazione
    ? null
    : !numeroPubblico
      ? null
      : cambiato || !prima?.deviazioneChiestaIl
        ? adesso
        : prima.deviazioneChiestaIl;

  const comune = {
    ingresso: dati.ingresso,
    numeroPubblico,
    operatore,
    squilliChiesti,
    deviazioneChiestaIl: chiestaIl,
  };

  await db.voiceConfiguration.upsert({
    where: { venueId },
    update: comune,
    create: { venueId, ...comune },
  });

  await recordAudit(actor, "venue.voice_ingresso", "venue", venueId, {
    ingresso: dati.ingresso,
    operatore: comune.operatore,
    squilliChiesti: comune.squilliChiesti,
  });

  return vistaIngresso(venueId);
}
