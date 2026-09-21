/**
 * La difesa contro i dati finti nel database vero.
 *
 * Non è una difesa contro un attacco: è una difesa contro la fretta. Il
 * comando giusto lanciato nel terminale sbagliato è il modo più comune di
 * riempire di prenotazioni inventate il gestionale di un ristorante che sta
 * lavorando — e nessuno se ne accorge finché un cameriere non vede un tavolo
 * occupato da un cliente che non esiste.
 *
 * Sta in un file solo perché i seed sono tre (demo, vetrina, percorsi
 * automatici) e una difesa copiata tre volte è una difesa dimenticata in uno
 * dei tre.
 */

/** Il database si chiama come un ambiente di sviluppo o di prova? */
export function databaseNonDiProduzione(url: string): boolean {
  return /dev|test/i.test(url);
}

/**
 * Il messaggio da mostrare prima di rifiutarsi, o `null` se si può procedere.
 *
 * `forzato` è la scappatoia esplicita: chi sa cosa sta facendo — un ripristino,
 * una vetrina da ricostruire su un'installazione vera — ripete il comando con
 * la variabile davanti. Serve che sia **scomodo**, non impossibile.
 */
export function vietaDatiDemo(
  url: string,
  forzato: boolean,
  cosaScrive = "Questo comando scrive dati dimostrativi",
): string | null {
  if (databaseNonDiProduzione(url) || forzato) return null;
  return (
    `${cosaScrive} e DATABASE_URL non contiene 'dev' né 'test'.\n` +
    "Se è davvero il database di produzione e lo vuoi, ripeti il comando con\n" +
    "SEED_DEMO_PRODUZIONE=1 davanti. Prima però fai una copia."
  );
}
