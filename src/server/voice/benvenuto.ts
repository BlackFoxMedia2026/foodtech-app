import { z } from "zod";
import { db } from "@/lib/db";
import { recordAudit, type AuditActor } from "@/server/audit";

/**
 * Cosa dice il risponditore appena alza.
 *
 * ## Perché lo scrive il ristoratore, e non noi
 *
 * Perché è la sua voce. «Salve, benvenuti al Nomad» lo dice il Nomad: il
 * nome, il tu o il lei, il «cucina aperta fino a tardi» che vuole far sentire
 * subito. Il centralino è nostro e lo governiamo noi, ma **il testo è un
 * dato**, e i dati stanno in Tavolo insieme alle prenotazioni e agli ospiti.
 *
 * ## Perché c'è un testo predefinito, e non un campo vuoto
 *
 * Perché un campo vuoto vorrebbe dire una voce che risponde senza dire dove
 * sei — chi chiama non sa nemmeno di aver chiamato il posto giusto. Il
 * predefinito nomina il locale, e si calcola qui: la stessa funzione la usa la
 * schermata per mostrare l'anteprima e il centralino per rispondere, così quel
 * che si legge è quel che si sente. Due formule per la stessa frase
 * divergerebbero al primo ritocco.
 *
 * ## `aiSaluto` esisteva già, e nessuno lo scriveva
 *
 * Era dichiarato nello schema dal principio, insieme ad `aiNome`, e nessuna
 * riga di codice lo leggeva o lo scriveva: un campo morto. Un campo morto è
 * peggio di un campo che manca — sembra una funzione che c'è.
 */

/** Quanto può essere lungo. Il limite è quello della colonna. */
export const SALUTO_MAX = 300;

/**
 * Il saluto che si sente se il ristoratore non ne ha scritto uno.
 *
 * Nomina il locale, perché è la prima cosa che chi chiama deve sentire: ha
 * chiamato il posto giusto. E dichiara che risponde una voce automatica —
 * fingere una persona è un imbroglio che dura tre secondi, fino alla prima
 * domanda a cui non sa rispondere.
 */
export function benvenutoPredefinito(nomeLocale: string): string {
  return (
    `Salve, benvenuti al ${nomeLocale}. Sono la voce automatica del ristorante: ` +
    `posso prendere una prenotazione. Come posso aiutarla?`
  );
}

export const BenvenutoInput = z.object({
  /** Vuoto significa «torna al predefinito», non «non dire niente». */
  testo: z.string().max(SALUTO_MAX),
});

export type VistaBenvenuto = {
  /** Quello scritto dal locale. Nullo = vale il predefinito. */
  testo: string | null;
  /** Quello che si sentirebbe adesso: scritto o predefinito. */
  inUso: string;
  predefinito: string;
  nomeLocale: string;
  massimo: number;
};

async function nomeDelLocale(venueId: string): Promise<string> {
  const v = await db.venue.findUnique({ where: { id: venueId }, select: { name: true } });
  return v?.name ?? "ristorante";
}

export async function vistaBenvenuto(venueId: string): Promise<VistaBenvenuto> {
  const [conf, nome] = await Promise.all([
    db.voiceConfiguration.findUnique({
      where: { venueId },
      select: { aiSaluto: true },
    }),
    nomeDelLocale(venueId),
  ]);

  const testo = conf?.aiSaluto?.trim() || null;
  const predefinito = benvenutoPredefinito(nome);
  return {
    testo,
    inUso: testo ?? predefinito,
    predefinito,
    nomeLocale: nome,
    massimo: SALUTO_MAX,
  };
}

export async function salvaBenvenuto(
  venueId: string,
  raw: unknown,
  actor?: AuditActor,
): Promise<VistaBenvenuto> {
  const dati = BenvenutoInput.parse(raw);
  /* Vuoto torna a `null`, cioè al predefinito. Salvare una stringa vuota
     vorrebbe dire una voce che alza e sta zitta: chi chiama sente il silenzio
     e riattacca. */
  const testo = dati.testo.trim() || null;

  await db.voiceConfiguration.upsert({
    where: { venueId },
    update: { aiSaluto: testo },
    create: { venueId, aiSaluto: testo },
  });

  await recordAudit(actor, "venue.voice_benvenuto", "venue", venueId, {
    /* Nel registro va la **lunghezza**, non il testo: è una frase che il
       locale può cambiare dieci volte in un pomeriggio, e riempirci il
       registro lo rende illeggibile proprio quando serve. */
    caratteri: testo?.length ?? 0,
    predefinito: testo === null,
  });

  return vistaBenvenuto(venueId);
}

/**
 * Quello che chiede il centralino quando deve rispondere a una telefonata.
 *
 * Tre cose in una sola risposta perché è una sola domanda — «cosa dico quando
 * alzo?» — e perché arriva **mentre il telefono squilla**: due richieste in
 * fila sarebbero due attese in fila.
 */
export async function risponditorePerCentralino(venueId: string): Promise<{
  saluto: string;
  locale: string;
  fuso: string;
  risposte: { argomento: string; risposta: string }[];
}> {
  const [conf, venue, risposte] = await Promise.all([
    db.voiceConfiguration.findUnique({
      where: { venueId },
      select: { aiSaluto: true },
    }),
    db.venue.findUnique({ where: { id: venueId }, select: { name: true, timezone: true } }),
    /*
      Le risposte che il locale ha **già scritto**.

      Arrivano insieme al saluto perché è una domanda sola — «cosa devo dire
      quando alzo?» — e perché il momento in cui servono è lo stesso. Solo
      quelle attive: una risposta spenta è una risposta che il locale ha deciso
      di non dare più, e ripeterla al telefono sarebbe peggio che non averla.

      Un tetto di quaranta: sono poche e corte per disegno (vedi
      `server/voice/conoscenza.ts`), e un elenco che cresce senza limite
      finirebbe dentro le istruzioni del modello — dove ogni riga costa, e le
      ultime vengono lette peggio delle prime.
    */
    db.voiceKnowledgeItem.findMany({
      where: { venueId, attivo: true },
      orderBy: [{ categoria: "asc" }, { createdAt: "asc" }],
      take: 40,
      select: { categoria: true, argomenti: true, risposta: true },
    }),
  ]);

  const nome = venue?.name ?? "ristorante";
  return {
    saluto: conf?.aiSaluto?.trim() || benvenutoPredefinito(nome),
    locale: nome,
    fuso: venue?.timezone ?? "Europe/Rome",
    risposte: risposte.map((r) => ({
      /* L'argomento è quello che il locale ha scritto, se l'ha scritto: la
         categoria è una classificazione nostra, e «ORARI» è meno utile di
         «a che ora chiudete la domenica». */
      argomento: r.argomenti[0]?.trim() || r.categoria,
      risposta: r.risposta.trim(),
    })),
  };
}
