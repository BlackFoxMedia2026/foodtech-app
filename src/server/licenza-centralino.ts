import { createPublicKey, verify } from "node:crypto";
import { db } from "@/lib/db";
import {
  dividiLicenza,
  fineValidita,
  funzioniDi,
  type ContenutoLicenza,
  type FunzioneCentralino,
} from "@/lib/licenza-centralino";

/**
 * Verifica la chiave del centralino e accende le funzioni nel locale.
 *
 * ## Perché una firma e non una chiamata a miocentralino
 *
 * Tavolo potrebbe telefonare a miocentralino e chiedere «questa chiave è
 * valida?». Non lo fa, e non per pigrizia: legherebbe il funzionamento del
 * telefono di un ristorante alla raggiungibilità di un altro server. Un
 * sabato sera, con miocentralino spento per manutenzione, il centralino del
 * ristorante si spegnerebbe — e sarebbe colpa di una verifica che non serviva.
 *
 * Una firma si controlla da soli, per sempre, senza rete.
 *
 * ## Perché Ed25519 e non un segreto condiviso
 *
 * Con un segreto condiviso (HMAC) chiunque può verificare **e** fabbricare:
 * chi legge le variabili d'ambiente di Tavolo potrebbe emettersi una licenza.
 * Con Ed25519 le due cose si separano — Tavolo tiene solo la **chiave
 * pubblica** e può verificare, miocentralino tiene la privata e può emettere.
 * Costa le stesse righe e toglie di mezzo la domanda.
 */

/**
 * La chiave pubblica di miocentralino, in `CENTRALINO_CHIAVE_PUBBLICA`.
 *
 * In formato SPKI base64 (una riga, senza le righe `-----BEGIN-----`): la
 * genera `npm run centralino:chiavi`.
 *
 * Quando manca, nessuna licenza è valida e il centralino resta spento. È il
 * comportamento giusto: senza la chiave pubblica non si può distinguere una
 * licenza vera da una inventata, e in quel caso «spento» è l'unica risposta
 * onesta — non «acceso perché non sappiamo verificare».
 */
function chiavePubblica() {
  const grezza = process.env.CENTRALINO_CHIAVE_PUBBLICA?.replace(/\s+/g, "");
  if (!grezza) return null;
  try {
    return createPublicKey({
      key: Buffer.from(grezza, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    return null;
  }
}

export type EsitoLicenza =
  | {
      ok: true;
      contenuto: ContenutoLicenza;
      scadeIl: Date | null;
      funzioni: FunzioneCentralino[];
    }
  | {
      ok: false;
      motivo: "malformata" | "non_configurato" | "firma" | "altro_locale" | "scaduta";
      /** Cosa dire a chi l'ha incollata: una frase, non un codice. */
      messaggio: string;
    };

/**
 * Controlla una chiave per un locale preciso.
 *
 * Il `venueId` è un argomento e non un dettaglio: **la licenza vale per un
 * locale solo**. Senza questo controllo la chiave di un ristorante accenderebbe
 * il centralino di tutti gli altri, e chi l'ha comprata la passerebbe agli
 * amici — che è esattamente come si smette di vendere un prodotto.
 *
 * I motivi qui **si dicono** a chi ha incollato la chiave, al contrario dei
 * token dell'API: là dall'altra parte c'è un programma che prova ad entrare,
 * qui c'è un ristoratore che ha pagato e sta incollando una riga di testo. Se
 * la chiave è di un altro locale o è scaduta, dirglielo gli fa risolvere in un
 * minuto; un «non valida» generico gli fa aprire una segnalazione.
 */
export function verificaLicenza(
  valore: string | null | undefined,
  venueId: string,
  adesso: Date = new Date(),
): EsitoLicenza {
  const divisa = dividiLicenza(valore);
  if (!divisa) {
    return {
      ok: false,
      motivo: "malformata",
      messaggio:
        "Questa non sembra una chiave del centralino. Controlla di averla copiata tutta, dall'inizio alla fine.",
    };
  }

  const pubblica = chiavePubblica();
  if (!pubblica) {
    return {
      ok: false,
      motivo: "non_configurato",
      messaggio:
        "Su questa installazione il centralino non è ancora configurato. Scrivici: è una cosa che sistemiamo noi, non tu.",
    };
  }

  const autentica = verify(
    null,
    Buffer.from(divisa.firmato, "utf8"),
    pubblica,
    Buffer.from(divisa.firma, "base64url"),
  );
  if (!autentica) {
    return {
      ok: false,
      motivo: "firma",
      messaggio:
        "Questa chiave non è autentica. Se l'hai ricevuta da noi, rimandacela: potrebbe essersi rotta nel copia e incolla.",
    };
  }

  if (divisa.contenuto.l !== venueId) {
    const nome = divisa.contenuto.n;
    return {
      ok: false,
      motivo: "altro_locale",
      messaggio: nome
        ? `Questa chiave è di un altro locale (${nome}). Ogni locale ha la sua.`
        : "Questa chiave è di un altro locale. Ogni locale ha la sua.",
    };
  }

  const scadeIl = fineValidita(divisa.contenuto.e);
  if (scadeIl && scadeIl <= adesso) {
    return {
      ok: false,
      motivo: "scaduta",
      messaggio: `Questa chiave è scaduta il ${divisa.contenuto.e}. Rinnoviamo e te ne mandiamo una nuova.`,
    };
  }

  return { ok: true, contenuto: divisa.contenuto, scadeIl, funzioni: funzioniDi(divisa.contenuto) };
}

export type StatoCentralino = {
  /** Se le funzioni del telefono sono accese **adesso**. */
  attivo: boolean;
  /** Cosa è accesa. Vuoto quando è spento. */
  funzioni: FunzioneCentralino[];
  /** Quando scade, se scade. */
  scadeIl: Date | null;
  /** Quando è stata inserita la chiave. */
  attivatoIl: Date | null;
  /** Le ultime lettere della chiave, per riconoscerla. */
  chiaveLeggibile: string | null;
  /**
   * Perché è spento, quando è spento e una chiave c'è.
   *
   * Distingue «non l'hai mai comprato» (nullo) da «ce l'avevi e adesso no»,
   * che sono due schermate diverse: la prima offre, la seconda spiega.
   */
  motivoSpento: "scaduta" | "non_piu_valida" | null;
  /**
   * Da dove viene l'accensione.
   *
   * `piattaforma` = l'ha acceso un nostro super amministratore dal pannello;
   * `chiave` = c'e una licenza firmata, che e la strada delle installazioni
   * che non gestiamo noi. Serve alle schermate: con `piattaforma` non si
   * chiede di incollare niente, e la procedura di collegamento salta i due
   * passi della chiave invece di mostrarli fatti a metà.
   */
  origine: "piattaforma" | "chiave" | null;
};

const SPENTO: StatoCentralino = {
  attivo: false,
  funzioni: [],
  scadeIl: null,
  attivatoIl: null,
  chiaveLeggibile: null,
  motivoSpento: null,
  origine: null,
};

/**
 * Com'è il centralino in questo locale, adesso.
 *
 * La chiave si **riverifica ogni volta**, non si legge un booleano. Costa
 * frazioni di millisecondo (una firma Ed25519) e chiude la porta a cui una
 * colonna `phoneEnabled = true` scritta a mano nel database avrebbe risposto.
 */
export async function statoCentralino(
  venueId: string,
  adesso: Date = new Date(),
): Promise<StatoCentralino> {
  const locale = await db.venue.findUnique({
    where: { id: venueId },
    select: {
      phoneLicenseKey: true,
      phoneLicenseActivatedAt: true,
    },
  });
  return statoDaChiave(
    venueId,
    locale?.phoneLicenseKey ?? null,
    locale?.phoneLicenseActivatedAt ?? null,
    adesso,
  );
}

/*
  ## Una sola verita su «il telefono e acceso?»

  Per un giorno ce ne sono state due: la chiave firmata, e un interruttore in
  una tabella (`VenueServizio`) che un super amministratore girava dal pannello
  di Tavolo. L'interruttore e stato togliuto, e la ragione non e estetica.

  In questo prodotto **Tavolo non si configura**: nasce col telefono spento, e
  ad accenderlo e ilmiocentralino. La chiave firmata e esattamente questo — una
  cosa che solo chi ha la chiave privata puo fabbricare, e che Tavolo
  riverifica a ogni lettura — mentre un booleano in tabella e una cosa che
  chiunque possa scrivere nel database si accende da solo.

  Due strade verso lo stesso «si» erano anche due posti in cui cercare quando
  la risposta e «no». `VenueServizio` resta in tabella e **non la legge
  nessuno**: e segnata superata, come le tre tabelle morte del telefono e
  `BookingEvent`. Cancellarla e una migrazione distruttiva su dati che non
  possiamo guardare, e non vale il rischio per un nome.
*/

/**
 * Lo stato, data la chiave già letta.
 *
 * Separata da `statoCentralino` perché chi ha già il locale fra le mani — una
 * pagina che legge il `Venue` per altri dieci motivi — non deve rileggerlo
 * solo per sapere se il telefono è acceso.
 */
export function statoDaChiave(
  venueId: string,
  chiave: string | null,
  attivatoIl: Date | null,
  adesso: Date = new Date(),
): StatoCentralino {
  if (!chiave) return SPENTO;

  const esito = verificaLicenza(chiave, venueId, adesso);
  const leggibile = `…${chiave.replace(/\s+/g, "").slice(-8)}`;

  if (!esito.ok) {
    return {
      ...SPENTO,
      attivatoIl: attivatoIl ?? null,
      chiaveLeggibile: leggibile,
      motivoSpento: esito.motivo === "scaduta" ? "scaduta" : "non_piu_valida",
    };
  }

  return {
    attivo: true,
    funzioni: esito.funzioni,
    scadeIl: esito.scadeIl,
    attivatoIl: attivatoIl ?? null,
    chiaveLeggibile: leggibile,
    motivoSpento: null,
    origine: "chiave",
  };
}

/** Il motivo per cui una chiave non accende, o il centralino è spento. */
export type MotivoLicenza = "malformata" | "non_configurato" | "firma" | "altro_locale" | "scaduta" | "spento";

export class LicenzaError extends Error {
  constructor(
    readonly motivo: MotivoLicenza,
    message: string,
  ) {
    super(message);
    this.name = "LicenzaError";
  }
}

/**
 * Inserisce la chiave e accende.
 *
 * Solleva con il messaggio da mostrare quando la chiave non va: chi ha
 * incollato deve leggere cosa fare, non un codice d'errore.
 */
export async function attivaCentralino(
  venueId: string,
  chiave: string,
  adesso: Date = new Date(),
): Promise<StatoCentralino> {
  const esito = verificaLicenza(chiave, venueId, adesso);
  if (!esito.ok) throw new LicenzaError(esito.motivo, esito.messaggio);

  const pulita = chiave.replace(/\s+/g, "");
  await db.venue.update({
    where: { id: venueId },
    data: {
      phoneLicenseKey: pulita,
      phoneLicenseActivatedAt: adesso,
      phoneLicenseExpiresAt: esito.scadeIl,
      phoneLicenseFeatures: esito.funzioni,
    },
  });

  return statoDaChiave(venueId, pulita, adesso, adesso);
}

/**
 * Toglie la chiave.
 *
 * Non cancella niente di quello che il telefono ha prodotto: le prenotazioni
 * prese al telefono sono prenotazioni, e restano. Si spengono le funzioni,
 * non la storia.
 */
export async function spegniCentralino(venueId: string): Promise<void> {
  await db.venue.update({
    where: { id: venueId },
    data: {
      phoneLicenseKey: null,
      phoneLicenseActivatedAt: null,
      phoneLicenseExpiresAt: null,
      phoneLicenseFeatures: [],
    },
  });
}

/**
 * Il guardiano da mettere in cima a ogni lettura del telefono.
 *
 * Solleva quando la funzione non è accesa in questo locale. Serve perché una
 * funzione a pagamento nascosta solo nell'interfaccia non è una funzione a
 * pagamento: chi conosce l'indirizzo la chiama comunque.
 */
export async function richiediFunzioneCentralino(
  venueId: string,
  funzione: FunzioneCentralino,
  adesso: Date = new Date(),
): Promise<void> {
  const stato = await statoCentralino(venueId, adesso);
  if (!stato.attivo || !stato.funzioni.includes(funzione)) {
    throw new LicenzaError("spento", "Il centralino non è attivo su questo locale.");
  }
}
