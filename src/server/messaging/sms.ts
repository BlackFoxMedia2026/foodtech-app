import { CIFRE_IDENTITA, normalizzaE164 } from "@/lib/telefono";

/**
 * Gli SMS, per davvero.
 *
 * ## Perché questo canale vale più di una funzione in più
 *
 * Perché **mezzo prodotto era già scritto e girava a vuoto**: promemoria
 * anti-assenza, richiesta di parere, automazioni, il link per riprendere una
 * telefonata interrotta, la conferma a chi ha prenotato parlando. Tutte quelle
 * strade finivano in `no_channel` — una riga nel registro che diceva «non c'è
 * nessun modo di mandarlo». Era la verità, ed era anche la ragione per cui un
 * cliente che aveva chiamato non riceveva mai niente.
 *
 * ## Perché Brevo e non un fornitore nuovo
 *
 * Perché l'account **c'è già**: le campagne email passano da lì
 * (`server/marketing/brevo-adapter.ts`), quindi non c'è un contratto nuovo da
 * firmare, una fattura in più da seguire, una chiave in più da custodire. Un
 * fornitore in meno è una cosa in meno che si rompe.
 *
 * Non è una scelta irreversibile: qui dentro c'è una funzione che parla HTTP,
 * e sostituirla con Twilio o Vonage vuol dire riscrivere questo file e niente
 * altro — `send.ts` non sa da dove passano gli SMS.
 *
 * ## Le due cose che questo file fa e che sembrano dettagli
 *
 * 1. **Il numero si normalizza.** Brevo vuole il numero con il prefisso
 *    internazionale e **senza** il `+`. Un numero scritto «333 123 4567» come
 *    lo scrive l'operatore in sala viene rifiutato, e il rifiuto arriva come
 *    un 400 che parla di «invalid recipient»: si perde mezz'ora a cercare la
 *    chiave sbagliata. Qui passa da `normalizzaE164`, lo stesso posto che usa
 *    il riconoscimento di chi chiama — così un numero che il centralino
 *    riconosce è un numero a cui si può scrivere.
 * 2. **Una risposta senza identificativo non è un invio.** È la stessa lezione
 *    di `esitoResend`: un fornitore che accetta risponde con il suo
 *    identificativo, e se non lo dice non sappiamo cosa ha accettato. Senza
 *    questo controllo, credito esaurito e numero rifiutato diventerebbero
 *    «mandato» nel registro — e il locale leggerebbe che il cliente è stato
 *    avvisato mentre nessuno lo ha avvisato.
 */

/** L'indirizzo dell'API. Costante: non è una cosa che si configura. */
const API = "https://api.brevo.com/v3/transactionalSMS/sms";

/**
 * Quanto si aspetta il fornitore.
 *
 * Gli SMS partono **dalla coda dei lavori**, non da una richiesta di qualcuno
 * che sta guardando: dieci secondi di attesa non li sente nessuno, e un tetto
 * più stretto trasformerebbe un fornitore lento in messaggi non mandati.
 */
const TETTO_MS = 10_000;

/**
 * Il nome o il numero che il cliente vede come mittente.
 *
 * Brevo lo chiama `sender` e accetta un nome alfanumerico (massimo undici
 * caratteri, com'è lo standard). Non ha un valore per difetto: un mittente
 * sbagliato è un messaggio che arriva a nome di qualcun altro, e indovinarlo
 * sarebbe peggio che non mandare.
 */
export function mittenteSms(): string | null {
  const s = process.env.BREVO_SMS_SENDER?.trim();
  return s || null;
}

/**
 * Se il canale è utilizzabile **adesso**.
 *
 * Si legge a ogni chiamata e non al caricamento del modulo: una chiave
 * aggiunta dopo l'avvio sarebbe invisibile, e nei test non si potrebbe provare
 * il percorso «canale acceso» senza mandare un messaggio vero.
 */
export function smsConfigurato(): boolean {
  return !!process.env.BREVO_API_KEY?.trim() && !!mittenteSms();
}

/**
 * Il numero come lo vuole Brevo: prefisso internazionale, senza il `+`.
 *
 * E con un controllo che `normalizzaE164` **non** fa, di proposito: quella
 * funzione mette il prefisso italiano davanti a qualunque cosa, perché il suo
 * lavoro e riconoscere un numero scritto come capita. Un troncone di tre cifre
 * — un interno, una chiamata nascosta, un campo riempito male — diventa
 * `+39412`, che non e nessun numero al mondo. Mandato al fornitore, sarebbe un
 * 400 «invalid recipient» e mezz'ora passata a cercare la chiave sbagliata.
 *
 * La soglia e la stessa del riconoscimento di chi chiama (`CIFRE_IDENTITA`,
 * nove): un numero a cui il centralino sa associare una persona e un numero a
 * cui si puo scrivere.
 */
export function numeroPerBrevo(numero: string): string | null {
  const e164 = normalizzaE164(numero);
  if (!e164) return null;
  const cifre = e164.replace(/\D/g, "");
  /* Nove cifre **piu** il prefisso internazionale: sotto, non e un numero
     mobile completo in nessun paese che serviamo. */
  if (cifre.length < CIFRE_IDENTITA + 2) return null;
  return cifre;
}

type RispostaBrevo = {
  reference?: string;
  messageId?: number | string;
  smsCount?: number;
  usedCredits?: number;
  remainingCredits?: number;
  /** Quando rifiuta: `{ code, message }`. */
  code?: string;
  message?: string;
};

/**
 * Cosa dice davvero la risposta del fornitore.
 *
 * Esportata perché è la parte che può mentire, e va provata da sola: le tre
 * risposte che contano — accettato, rifiutato, accettato senza dirlo — non si
 * possono provocare a piacere su un fornitore vero.
 */
export function esitoBrevoSms(stato: number, corpo: RispostaBrevo | null): { providerId: string } {
  if (stato < 200 || stato >= 300) {
    /* Il motivo del fornitore si riporta **tale e quale**: «not enough
       credits» e «invalid recipient» mandano a fare due cose diverse, e un
       generico «invio non riuscito» le confonde. */
    const perche = corpo?.message || corpo?.code || `il fornitore SMS ha risposto ${stato}`;
    throw new Error(perche);
  }
  const id = corpo?.messageId;
  if (id === undefined || id === null || id === "") {
    throw new Error("il fornitore SMS non ha confermato l'invio");
  }
  return { providerId: String(id) };
}

/**
 * Manda un SMS. Solleva quando non è partito — è `send.ts` che decide cosa
 * scrivere nel registro, e un errore inghiottito qui diventerebbe un messaggio
 * dichiarato mandato.
 */
export async function mandaSms(dati: { to: string; body: string }): Promise<{ providerId: string }> {
  const chiave = process.env.BREVO_API_KEY?.trim();
  const sender = mittenteSms();
  if (!chiave || !sender) throw new Error("sms_not_configured");

  const recipient = numeroPerBrevo(dati.to);
  if (!recipient) throw new Error("numero non utilizzabile per un SMS");

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "api-key": chiave,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      recipient,
      content: dati.body,
      /* `transactional` e non `marketing`: sono conferme, promemoria e link
         chiesti dal cliente. La differenza non è formale — i messaggi di
         marketing hanno regole di orario e di consenso diverse, e un
         promemoria di una prenotazione mandato come marketing sarebbe
         classificato male da entrambe le parti. */
      type: "transactional",
    }),
    signal: AbortSignal.timeout(TETTO_MS),
  });

  const corpo = (await res.json().catch(() => null)) as RispostaBrevo | null;
  return esitoBrevoSms(res.status, corpo);
}
