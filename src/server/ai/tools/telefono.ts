import { randomUUID } from "node:crypto";
import { checkAvailability } from "@/server/availability";
import { durataConsigliata } from "@/server/durata-consigliata";
import { normalizzaE164, telefonoLeggibile } from "@/lib/telefono";
import { interpretaQuando } from "../quando";
import { cercaRisposte } from "@/server/voice/conoscenza";
import type { Tool } from "../types";

/**
 * Gli strumenti che **scrivono**, per l'assistente.
 *
 * ## Le tre regole, e dove sono nel codice
 *
 * 1. **Non si dice «confermato» prima che la scrittura sia riuscita.** Qui non
 *    si scrive niente: questi strumenti costruiscono un'anteprima e la
 *    restituiscono come `action_confirmation`. La scrittura sta negli
 *    esecutori, e il «fatto» lo dice l'esecutore *dopo*. Non è una
 *    convenzione: da qui non si può scrivere, il database non viene toccato.
 * 2. **La validazione si rifà al momento della scrittura.** L'anteprima dice
 *    com'è la situazione adesso, ma fra l'anteprima e la conferma passano
 *    secondi in cui un altro può prendere lo stesso tavolo. Il controllo vero
 *    è nell'esecutore, e se il tavolo non c'è più la prenotazione **non si
 *    fa**.
 * 3. **Se un dato non c'è, non si inventa.** Nessun valore per difetto su
 *    quante persone o quando: se la frase non lo dice, si chiede. Un'ora messa
 *    da noi finisce in una prenotazione vera e nessuno saprà che l'abbiamo
 *    messa noi.
 *
 * ## La chiave dell'idempotenza nasce con l'anteprima
 *
 * Ogni anteprima porta una chiave sua. Chi preme «conferma» due volte — e su
 * un tablet in sala succede — ottiene **una** prenotazione: la seconda
 * scrittura la respinge l'indice unico su `idempotencyKey`. Se la chiave
 * nascesse nell'esecutore, due conferme sarebbero due chiavi e due
 * prenotazioni.
 */

/** Quante persone, dalla frase. `null` quando non lo dice. */
function leggiPersone(testo: string): number | null {
  const m =
    testo.match(/\b(?:per|in|siamo|tavolo da)\s+(\d{1,2})\b/) ??
    testo.match(/\b(\d{1,2})\s*(?:persone|coperti|pax)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 50 ? n : null;
}

/**
 * Il nome, dalla frase.
 *
 * Solo dopo «per» o «a nome (di)»: un nome indovinato dalla prima parola con
 * la maiuscola finirebbe su una prenotazione vera. Il testo arriva
 * normalizzato, quindi la maiuscola non c'è nemmeno più — e va bene: chi
 * legge la conferma vede il nome come l'ha detto, e lo corregge se serve.
 */
const PAROLE_DI_SERVIZIO = new Set([
  "per",
  "in",
  "di",
  "da",
  "alle",
  "all",
  "il",
  "la",
  "lo",
  "un",
  "una",
  "e",
  "con",
  "che",
  "del",
  "della",
  "mio",
  "mia",
  "oggi",
  "stasera",
  "stamattina",
  "stanotte",
  "domani",
  "dopodomani",
  "persone",
  "coperti",
  "pax",
  "tavolo",
  "lunedi",
  "martedi",
  "mercoledi",
  "giovedi",
  "venerdi",
  "sabato",
  "domenica",
]);

function leggiNome(testo: string): string | null {
  const m = testo.match(/\ba nome(?:\s+di)?\s+([a-z]+)(?:\s+([a-z]+))?/);
  if (!m) return null;

  const primo = m[1]!;
  /* «a nome del signore» non è un nome. Meglio chiedere che scrivere «Del
     Signore» nella scheda di un cliente. */
  if (PAROLE_DI_SERVIZIO.has(primo)) return null;

  /* La seconda parola solo se è un nome e non un pezzo della frase: su
     «prenota a nome rossi per 4» la prima versione scriveva «Rossi Per», e
     quel cognome sarebbe rimasto nel CRM per sempre. */
  const secondo = m[2] && !PAROLE_DI_SERVIZIO.has(m[2]) ? m[2] : null;

  return [primo, secondo]
    .filter((p): p is string => Boolean(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function leggiTelefono(testo: string): string | null {
  const m = testo.match(/\b((?:\+39\s*)?3\d{2}[\s.]?\d{3}[\s.]?\d{3,4})\b/);
  return m ? normalizzaE164(m[1]) : null;
}

/* -------------------------------------------------------------------------- */
/*  Prenotare                                                                 */
/* -------------------------------------------------------------------------- */

export const prenotaTool: Tool = {
  /* Lo stesso permesso della schermata che fa la stessa cosa: prendere una
     prenotazione è `manage_bookings`, qui come nel modulo. Un assistente non
     è una scorciatoia intorno ai permessi. */
  ability: "manage_bookings",
  async run(ctx, params) {
    const frase = params.frase ?? "";
    const quando = interpretaQuando(frase, ctx.venueTimezone);
    const persone = leggiPersone(frase);
    const nome = leggiNome(frase);
    const telefono = leggiTelefono(frase);

    /* Regola 3: quello che manca si chiede, non si mette. E si chiede **una
       cosa per volta** con un esempio, perché «dati insufficienti» non dice
       cosa scrivere. */
    if (!quando) {
      return {
        text: "Non ho capito quando. Dimmelo così: «prenota a nome Rossi per 4 domani alle 20:30».",
      };
    }
    if (!persone) {
      return {
        text: `Per quante persone? Dimmi per esempio «per 4 ${quando.come}».`,
      };
    }
    if (!nome) {
      return {
        text: `A nome di chi? Dimmi per esempio «a nome Rossi per ${persone} ${quando.come}».`,
      };
    }

    /* La durata non la si inventa e non la si chiede: la calcola il prodotto
       sulle cene vere di quel locale, come per una prenotazione scritta a
       mano. */
    const durata = await durataConsigliata(ctx.venueId, {
      partySize: persone,
      startsAt: quando.istante,
    });

    /* Il controllo si fa sul canale **pubblico** per **raccontarlo**: è quello
       che applica le regole del locale. Il canale interno le salta di
       proposito — chi risponde al telefono alle 20:40 deve poter scrivere —
       quindi usarlo qui vorrebbe dire non avere niente da dire. */
    const esito = await checkAvailability(ctx.venueId, {
      startsAt: quando.istante,
      durationMin: durata.durataMin,
      partySize: persone,
      canale: "pubblico",
    });

    const avvertimenti = esito.issues.map((i) => i.message);

    return {
      text: [
        `Sto per prendere una prenotazione a nome ${nome}, ${persone} ${persone === 1 ? "persona" : "persone"}, ${quando.come}.`,
        ...(avvertimenti.length > 0
          ? [`Attenzione: ${avvertimenti.join(" ")}`]
          : []),
        "Confermi?",
      ].join(" "),
      structured: {
        type: "action_confirmation",
        actionId: "crea_prenotazione",
        summary: `${nome} · ${persone} coperti · ${quando.come}${avvertimenti.length > 0 ? " · con avvertimenti" : ""}`,
        params: {
          nome,
          telefono,
          persone,
          quando: quando.istante.toISOString(),
          durata: durata.durataMin,
          /* La chiave nasce **qui**: una anteprima, una prenotazione, anche se
             il pulsante viene premuto tre volte. */
          chiave: `agente:${randomUUID()}`,
          /* Quello che chi conferma ha letto. L'esecutore ricontrolla e dice
             solo quello che è **cambiato** in mezzo: ripetere gli stessi
             avvertimenti dopo la conferma li farebbe leggere come un
             problema nuovo. */
          avvisati: avvertimenti,
        },
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Mettere in lista d'attesa                                                 */
/* -------------------------------------------------------------------------- */

export const mettiInAttesaTool: Tool = {
  ability: "manage_bookings",
  async run(ctx, params) {
    const frase = params.frase ?? "";
    const persone = leggiPersone(frase);
    const nome = leggiNome(frase);
    const telefono = leggiTelefono(frase);

    if (!persone) {
      return {
        text: "Per quante persone? Dimmelo così: «metti in attesa a nome Rossi per 4».",
      };
    }
    if (!nome) {
      return {
        text: `A nome di chi? Dimmelo così: «metti in attesa a nome Rossi per ${persone}».`,
      };
    }

    /* Il momento desiderato è facoltativo in coda: «il prima possibile» è il
       caso normale, e lo dice il campo lasciato vuoto. */
    const quando = interpretaQuando(frase, ctx.venueTimezone);

    return {
      text: `Sto per mettere in lista d'attesa ${nome}, ${persone} ${persone === 1 ? "persona" : "persone"}${quando ? `, ${quando.come}` : ""}. Confermi?`,
      structured: {
        type: "action_confirmation",
        actionId: "metti_in_attesa",
        summary: `${nome} · ${persone} coperti in lista d'attesa`,
        params: {
          nome,
          telefono,
          persone,
          quando: quando?.istante.toISOString() ?? null,
        },
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Mettere qualcuno da richiamare                                            */
/* -------------------------------------------------------------------------- */

export const richiamaTool: Tool = {
  /* `use_phone` e non `manage_bookings`: la coda delle richiamate è del
     telefono, e chi non risponde al telefono non deve poterci scrivere
     dentro. */
  ability: "use_phone",
  async run(ctx, params) {
    const frase = params.frase ?? "";
    const telefono = leggiTelefono(frase);
    if (!telefono) {
      return {
        text: "Non ho letto un numero. Dimmelo così: «da richiamare il 347 1234567».",
      };
    }
    const nota = leggiNome(frase);
    return {
      text: `Sto per mettere ${telefonoLeggibile(telefono)} fra le persone da richiamare. Confermi?`,
      structured: {
        type: "action_confirmation",
        actionId: "crea_richiamata",
        summary: `Da richiamare: ${telefonoLeggibile(telefono)}`,
        params: { telefono, nota },
      },
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Cosa rispondo?                                                            */
/* -------------------------------------------------------------------------- */

/**
 * «Cosa rispondo a chi chiede del parcheggio?»
 *
 * Legge le risposte che il locale ha scritto (Impostazioni → Telefono → Cosa
 * rispondere) e **non ne inventa nessuna**. Quando non ne trova, lo dice: è la
 * stessa regola degli strumenti che scrivono, applicata alla lettura. Un
 * modello che immagina gli orari di Pasqua di un ristorante che non li ha
 * dichiarati fa dire al telefono una cosa falsa con la voce del locale.
 */
export const cosaRispondoTool: Tool = {
  ability: "use_phone",
  async run(ctx, params) {
    const domanda = (params.frase ?? "").trim();
    if (!domanda) {
      return {
        text: "Su cosa? Per esempio «cosa rispondo per il parcheggio?».",
      };
    }

    const trovate = await cercaRisposte(ctx.venueId, domanda);
    if (trovate.length === 0) {
      return {
        text: "Questo non è scritto fra le risposte del locale: al cliente si può dire «glielo faccio verificare». Le risposte si scrivono in Impostazioni → Telefono → Cosa rispondere.",
      };
    }

    /* Una sola risposta, per intero: chi la sta leggendo a voce non deve
       scegliere fra tre varianti mentre una persona aspetta. Le altre si
       vedono cercando dalla pagina del telefono. */
    const prima = trovate[0]!;
    return {
      text:
        trovate.length === 1
          ? prima.risposta
          : `${prima.risposta}\n\n(ce ne sono altre ${trovate.length - 1} che c'entrano: si cercano dalla pagina Telefono.)`,
    };
  },
};
