import { formatCurrency } from "@/lib/utils";

/**
 * L'incasso della giornata, così come si scrive in Panoramica.
 *
 * Questa derivazione stava dentro `KpiGrid`, perché il numero si leggeva solo
 * là. Ora si legge nella riga dei KPI in cima, e un dato che compare in due
 * posti con due regole scritte a mano diverge sempre: quindi la regola sta in
 * un modulo suo, e chi la mostra la chiede.
 *
 * **Non calcola niente di nuovo.** Sceglie fra due numeri che il server
 * manda già e li scrive:
 *
 * - appena qualcuno chiude un conto la casella smette di stimare e mostra
 *   l'incasso vero, che si chiama «Incasso»;
 * - finché nessuno lo fa resta la stima dichiarata (coperti per scontrino
 *   medio), che si chiama «Incasso stimato»;
 * - senza scontrino medio dichiarato non c'è stima: un trattino, e la nota
 *   dice cosa manca invece di lasciarlo muto.
 */
export type IncassoDelGiorno = {
  totalCents: number;
  /** `0` vuol dire «nessun conto chiuso», non «zero euro». */
  conti: number;
  /** Già pagato con gift card: denaro entrato prima di oggi. */
  giftCardCents?: number;
  /** Scontato coi punti: incasso a cui il locale ha rinunciato. */
  scontiPuntiCents?: number;
} | null;

export function riepilogoIncasso({
  estimatedRevenueCents,
  incasso,
  currency,
  /** Il confronto con ieri, calcolato sulle stime: vale solo per la stima. */
  deltaStima,
}: {
  estimatedRevenueCents: number | null;
  incasso?: IncassoDelGiorno;
  currency: string;
  deltaStima?: number | null;
}) {
  const reale = incasso != null && incasso.conti > 0;

  return {
    label: reale ? "Incasso" : "Incasso stimato",
    /** Il nome accorciato per il telefono, come gli altri blocchi del briefing. */
    corta: reale ? "Incasso" : "Stimato",
    valore: reale
      ? formatCurrency(incasso.totalCents, currency)
      : estimatedRevenueCents != null
        ? formatCurrency(estimatedRevenueCents, currency)
        : "—",
    nota: reale
      ? [
          `${incasso.conti} ${incasso.conti === 1 ? "conto chiuso" : "conti chiusi"}`,
          // Se una parte del conto era già pagata (gift card) o non è mai
          // stata pagata (punti), il totale servito e quello entrato in cassa
          // oggi non coincidono, e va detto: è la differenza fra sapere come
          // va il locale e non tornare con la cassa.
          incasso.giftCardCents ? `${formatCurrency(incasso.giftCardCents, currency)} da gift card` : null,
          incasso.scontiPuntiCents ? `${formatCurrency(incasso.scontiPuntiCents, currency)} in punti` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : estimatedRevenueCents != null
        ? undefined
        : "imposta lo scontrino medio in Impostazioni",
    /**
     * Nessun confronto quando il numero è l'incasso vero: il delta è calcolato
     * sulle **stime**, e mettere 38 € veri contro una stima di ieri con scritto
     * «▲ 20%» è un paragone fra due cose diverse presentato come una crescita.
     */
    delta: reale ? undefined : (deltaStima ?? undefined),
  };
}
