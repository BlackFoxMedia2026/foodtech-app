
/**
 * Gli errori del modulo DEM che hanno una risposta precisa, e non un 500.
 *
 * Portano un `code`: è la convenzione che `lib/api-auth.ts` già usa per
 * tradurre un errore di dominio nello status HTTP giusto senza dover conoscere
 * i moduli che lo sollevano. E portano un `detail` con i numeri, perché
 * «quota insufficiente» da solo non dice a chi legge cosa fare: servono
 * quanti ne ha, quanti ne servono, quanti ne mancano.
 */

export type QuotaMancante = {
  disponibili: number;
  richiesti: number;
  mancanti: number;
};

export class QuotaInsufficiente extends Error {
  readonly code = "dem_quota_insufficient";
  readonly detail: QuotaMancante;

  /**
   * Prende i tre numeri e non l'esito di una funzione precisa: lo sollevano
   * sia chi ha provato a riservare, sia chi ha solo chiesto se bastava. Legarlo
   * al tipo di ritorno di una delle due obbligherebbe l'altra a fingere di
   * essere quella.
   */
  constructor(quota: QuotaMancante) {
    super("Gli invii disponibili non bastano per questa campagna.");
    this.name = "QuotaInsufficiente";
    this.detail = { disponibili: quota.disponibili, richiesti: quota.richiesti, mancanti: quota.mancanti };
  }
}

export class InviiSospesi extends Error {
  readonly code = "dem_sending_paused";

  constructor(readonly motivo: string | null) {
    super("Gli invii di questo locale sono temporaneamente sospesi.");
    this.name = "InviiSospesi";
  }
}

/**
 * Il freno economico ha fermato una campagna.
 *
 * Separato da `QuotaInsufficiente` di proposito, e non è pedanteria: quello
 * dice al cliente che ha finito gli invii del suo piano, e si risolve
 * vendendogliene uno più grande. Questo è un fatto **nostro** — il costo di
 * infrastruttura che stiamo sostenendo per lui — e si risolve con
 * un'autorizzazione o alzando il tetto. Chi legge la risposta deve poter
 * distinguere i due casi senza interpretare una stringa.
 */
export class BudgetInfrastrutturaSuperato extends Error {
  readonly code = "dem_budget_exceeded";

  /**
   * L'eccedenza resta qui e **non** in `detail`.
   *
   * `detail` finisce nel corpo della risposta HTTP, e quella risposta la legge
   * il ristoratore: gli mostrerebbe i nostri centesimi di costo
   * infrastrutturale, che è esattamente ciò che non deve sapere. Chi fa
   * assistenza lo trova nei log e nel pannello di piattaforma.
   */
  readonly eccedenzaCents: number;

  constructor(eccedenzaCents: number) {
    /*
      Il messaggio è per il cliente, quindi parla la sua lingua: il suo invio è
      fermo e deve sapere cosa fare. «Budget di infrastruttura» gli direbbe che
      esiste un tetto di spesa **nostro** su di lui — un'informazione che non
      gli riguarda e che, letta da un ristoratore, suona come «ci costi troppo».
    */
    super("Questo invio è momentaneamente sospeso. Contattaci per sbloccarlo.");
    this.name = "BudgetInfrastrutturaSuperato";
    this.eccedenzaCents = eccedenzaCents;
  }
}

/**
 * Il costo non si sa calcolare: manca il listino, o manca il cambio.
 *
 * Blocca **solo** i clienti con un budget attivo, e blocca di proposito. Se
 * passasse, il costo di questa campagna varrebbe zero per tutti i controlli
 * successivi: un listino dimenticato diventerebbe il modo più silenzioso di
 * disattivare la protezione dei costi, proprio nel momento in cui non sappiamo
 * cosa sta succedendo.
 */
export class CostoNonCalcolabile extends Error {
  readonly code = "cost_calculation_unavailable";

  constructor(readonly motivo: "SENZA_LISTINO" | "SENZA_CAMBIO") {
    /* Stesso ragionamento: al cliente si dice che c'è un problema nostro e che
       ci pensiamo noi, non **quale** sia il problema nostro. */
    super("Non riusciamo a preparare questo invio in questo momento. Riprova più tardi.");
    this.name = "CostoNonCalcolabile";
  }
}
