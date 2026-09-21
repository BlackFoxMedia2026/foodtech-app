/**
 * Gli importi, formattati in un posto solo.
 *
 * `null` non diventa «€0,00»: diventa «non disponibile». È la regola di §21
 * della richiesta, e vale la pena tenerla in una funzione invece che in ogni
 * componente — perché basta una schermata che scrive zero al posto di un dato
 * mancante per far passare per gratuito un cliente che non stiamo misurando.
 */
const FORMATO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function euro(centesimi: number | null | undefined): string {
  if (centesimi === null || centesimi === undefined) return "non disponibile";
  return FORMATO.format(centesimi / 100);
}

/** Con il segno davanti: serve agli scostamenti, dove «+» e «−» sono il dato. */
export function euroConSegno(centesimi: number): string {
  const segno = centesimi > 0 ? "+" : "";
  return `${segno}${FORMATO.format(centesimi / 100)}`;
}
