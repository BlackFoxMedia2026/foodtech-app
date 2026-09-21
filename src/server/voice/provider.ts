import { db } from "@/lib/db";
import { NESSUNA_CAPACITA, type CapacitaVoice } from "@/lib/voice-capacita";
import type { StatoChiamata } from "@/server/chiamate";

/**
 * Il fornitore di telefonia, dietro un'interfaccia.
 *
 * ## Perché non si lega Tavolo a un centralino
 *
 * Oggi il telefono arriva da Black Fox Voice (Asterisk). Domani potrebbe
 * arrivare da Twilio, da Telnyx, da un trunk SIP del ristoratore. Se il codice
 * che riconosce chi chiama sapesse di Asterisk, cambiare fornitore vorrebbe
 * dire riscrivere Voice — e ogni cliente che arriva con il suo operatore
 * diventerebbe un progetto.
 *
 * ## Le capacità non sono un dettaglio
 *
 * Ogni fornitore **dichiara** cosa sa fare, e l'interfaccia mostra solo
 * quello. Non c'è un metodo `trasferisci` che solleva «non supportato»: c'è
 * `capacita.trasferimento`, e se è falso il pulsante non esiste. La differenza
 * si vede quando qualcuno ha una persona in linea.
 *
 * Il valore di partenza è **`NESSUNA_CAPACITA`**: un fornitore nuovo deve dire
 * cosa sa fare, non ereditare un elenco di sì che nessuno ha verificato.
 *
 * ## Cosa **non** è questa interfaccia
 *
 * Non è il modo in cui gli eventi entrano. Quelli arrivano su
 * `/api/v1/telefonia/*` con il token del locale, che identifica **chi** manda
 * — più forte di una firma, che dice solo «è arrivato da là». `leggiEvento`
 * serve ai fornitori che parlano un formato loro: il nostro manda già il
 * nostro, e per lui è l'identità.
 */

/** Un evento di chiamata, nella forma che Voice capisce. */
export type EventoChiamata = {
  /** L'identificativo presso il fornitore: è la chiave dell'idempotenza. */
  idEsterno: string;
  numero: string | null;
  numeroChiamato?: string | null;
  stato: StatoChiamata;
  quando?: Date;
};

export interface VoiceProvider {
  /** Il nome nel codice e nel database: `blackfox`, `mock`, … */
  readonly nome: string;
  /** Come si chiama per chi legge una schermata. */
  readonly etichetta: string;
  readonly capacita: CapacitaVoice;

  /**
   * Verifica la firma di un evento, **se** il fornitore firma.
   *
   * Assente di proposito su chi si autentica in un altro modo: obbligare tutti
   * a restituire `true` trasformerebbe un controllo in una formalità, e la
   * formalità è il posto dove passano le cose.
   */
  verificaFirma?(intestazioni: Headers, corpo: string): boolean;

  /** Traduce il corpo di un evento del fornitore nel nostro. */
  leggiEvento(corpo: unknown): EventoChiamata | null;

  /* Le operazioni. Ognuna esiste **solo** se la capacità corrispondente è
     vera, e chi chiama passa da `richiediCapacita` invece di sperare. */
  chiama?(venueId: string, numero: string): Promise<{ idEsterno: string }>;
  trasferisci?(venueId: string, idEsterno: string, a: string): Promise<void>;
  metteInAttesa?(venueId: string, idEsterno: string, attesa: boolean): Promise<void>;
  registrazione?(venueId: string, idEsterno: string): Promise<{ url: string } | null>;
}

/* -------------------------------------------------------------------------- */
/*  Black Fox Voice                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Il fornitore vero, oggi.
 *
 * Le capacità sono **scritte a mano e per difetto negative**, e ognuna dice la
 * verità su quello che il centralino sa fare il 18 settembre 2026:
 *
 * - riceve le chiamate e le manda a Tavolo: **sì**, è il ponte;
 * - si risponde dal browser: **sì**, con le credenziali SIP del locale;
 * - chiama, trasferisce, mette in attesa, manda i toni: **no**. Il centralino
 *   saprebbe farlo — è Asterisk — ma non espone niente a Tavolo per farlo, e
 *   dichiararlo `true` farebbe comparire quattro pulsanti che non funzionano;
 * - registra e trascrive: **no**, nessuna delle due è configurata;
 * - risponde una macchina: **no**. Il risponditore a tasti esiste, ma non è
 *   una voce che parla.
 *
 * Il giorno in cui il centralino espone il trasferimento, si cambia una riga
 * qui e il pulsante compare. È il punto di tutto questo file.
 */
export const fornitoreBlackFox: VoiceProvider = {
  nome: "blackfox",
  etichetta: "Black Fox Voice",
  capacita: {
    ...NESSUNA_CAPACITA,
    entranti: true,
    browser: true,
  },

  leggiEvento(corpo: unknown): EventoChiamata | null {
    /* Il nostro centralino manda già il nostro formato: questa funzione non
       traduce niente, controlla. Serve perché l'interfaccia la pretende da
       tutti, e un fornitore che parla la nostra lingua è un caso, non la
       regola. */
    if (!corpo || typeof corpo !== "object") return null;
    const c = corpo as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id) return null;
    const stato = c.stato;
    if (
      stato !== "RINGING" &&
      stato !== "ANSWERED" &&
      stato !== "MISSED" &&
      stato !== "ENDED"
    ) {
      return null;
    }
    return {
      idEsterno: c.id,
      numero: typeof c.phone === "string" ? c.phone : null,
      numeroChiamato: typeof c.toPhone === "string" ? c.toPhone : null,
      stato,
      ...(typeof c.quando === "string" ? { quando: new Date(c.quando) } : {}),
    };
  },
};

/* -------------------------------------------------------------------------- */
/*  Il fornitore finto, per sviluppare                                        */
/* -------------------------------------------------------------------------- */

/**
 * Un fornitore che non telefona a nessuno.
 *
 * Esiste per una ragione sola: costruire e provare l'interfaccia senza una
 * linea telefonica. Il brief lo chiede (§91–92) e ha ragione — l'alternativa è
 * un pulsante che finge una telefonata, che è la cosa che questo progetto non
 * fa.
 *
 * Le capacità si possono scegliere, e serve: con `trasferimento: true` si
 * verifica che il pulsante compaia, con `false` che **non** compaia. Senza
 * poterle cambiare, la regola «quello che non si sa fare non compare» non si
 * potrebbe provare.
 */
export function fornitoreFinto(capacita: Partial<CapacitaVoice> = {}): VoiceProvider {
  return {
    nome: "mock",
    etichetta: "Fornitore di prova",
    capacita: { ...NESSUNA_CAPACITA, entranti: true, ...capacita },
    leggiEvento: fornitoreBlackFox.leggiEvento,
  };
}

/* -------------------------------------------------------------------------- */
/*  Chi è il fornitore di questo locale                                       */
/* -------------------------------------------------------------------------- */

const FORNITORI: Record<string, VoiceProvider> = {
  blackfox: fornitoreBlackFox,
};

/**
 * Il fornitore di un locale.
 *
 * Si ricava dalle linee censite in `VoiceNumber`. Quando non ce n'è nessuna —
 * che è il caso di tutti i locali oggi — si assume Black Fox: è l'unico che
 * esiste, e restituire `null` obbligherebbe ogni schermata a distinguere «non
 * ho linee censite» da «non ho un fornitore», che per il ristoratore sono la
 * stessa cosa.
 *
 * Il giorno in cui ce ne sono due, questa funzione guarda la linea e il resto
 * del codice non cambia.
 */
export async function fornitoreDi(venueId: string): Promise<VoiceProvider> {
  const linea = await db.voiceNumber.findFirst({
    where: { venueId, attivo: true },
    select: { fornitore: true },
    orderBy: { createdAt: "asc" },
  });
  return (linea && FORNITORI[linea.fornitore]) || fornitoreBlackFox;
}

/** Le capacità del telefono di questo locale. */
export async function capacitaDi(venueId: string): Promise<CapacitaVoice> {
  return (await fornitoreDi(venueId)).capacita;
}

export class CapacitaMancanteError extends Error {
  constructor(readonly capacita: keyof CapacitaVoice) {
    super(`capacita_mancante:${capacita}`);
    this.name = "CapacitaMancanteError";
  }
}

/**
 * Pretende una capacità prima di provare un'operazione.
 *
 * Serve sul **server**, non nell'interfaccia: nascondere un pulsante non
 * impedisce a nessuno di chiamare l'indirizzo. È la stessa ragione per cui i
 * permessi si controllano due volte.
 */
export function richiediCapacita(fornitore: VoiceProvider, capacita: keyof CapacitaVoice): void {
  if (!fornitore.capacita[capacita]) throw new CapacitaMancanteError(capacita);
}
