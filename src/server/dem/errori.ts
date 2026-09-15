
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
