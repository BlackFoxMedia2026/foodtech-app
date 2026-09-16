/**
 * Accendere e revocare il pagamento sul singolo tavolo.
 *
 * Queste rotte esistevano da quando è nato il pagamento al tavolo, ma **non le
 * chiamava nessuno**: c'erano la colonna, il segreto, la revoca, il cartoncino
 * da stampare e la pagina pubblica che incassa — e non c'era un solo pulsante,
 * in tutto il prodotto, per accendere un tavolo. Il risultato è che la
 * funzione esisteva e non si poteva usare.
 *
 * Il primo posto da cui serviva davvero è l'editor dei QR: lì si sceglie il
 * tavolo per cui stampare il codice, ed è lì che si scopre che quel tavolo è
 * spento. Mandare altrove per un interruttore, e poi tornare, è un giro che
 * non aggiunge niente a chi ha già in mano la decisione.
 */

async function leggiOppureSpiega(res: Response) {
  const dati = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(dati.message || dati.error || "Non è stato possibile completare l'operazione.");
  }
  return dati;
}

/** Accende (o spegne) il pagamento su un tavolo. Serve `manage_venue`. */
export async function accendiPagamentoTavolo(tableId: string, attivo: boolean) {
  return leggiOppureSpiega(
    await fetch(`/api/tables/${tableId}/qr`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attivo }),
    }),
  );
}

/**
 * Rigenera il segreto del tavolo.
 *
 * **Da questo momento ogni cartoncino già stampato per quel tavolo smette di
 * funzionare.** Non è una modifica, è una revoca: si fa quando il codice
 * finisce in una fotografia pubblica o l'adesivo sparisce dal tavolo.
 */
export async function rigeneraSegretoTavolo(tableId: string) {
  return leggiOppureSpiega(await fetch(`/api/tables/${tableId}/qr`, { method: "POST" }));
}
