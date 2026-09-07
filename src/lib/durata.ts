/**
 * Il tempo detto come lo direbbe una persona.
 *
 * «577 minuti» è esatto e illeggibile: nessuno lo converte a mente mentre
 * lavora. Sopra l'ora si passa alle ore, e i minuti si dicono solo quando
 * aggiungono qualcosa.
 *
 * Sta in `lib` e non nel modulo del centro controllo perché la usano anche i
 * componenti dell'interfaccia, che girano nel browser: importare da
 * `server/service-intelligence` si porterebbe dietro il client del database.
 * È lo stesso motivo per cui `messaggioDiValidazione` vive in un file suo.
 */
export function durataUmana(minuti: number): string {
  const m = Math.max(0, Math.round(minuti));
  if (m < 60) return `${m} ${m === 1 ? "minuto" : "minuti"}`;
  const ore = Math.floor(m / 60);
  const resto = m % 60;
  const parteOre = `${ore} ${ore === 1 ? "ora" : "ore"}`;
  if (resto === 0) return parteOre;
  if (resto === 30) return `${parteOre} e mezza`;
  return `${parteOre} e ${resto}`;
}
