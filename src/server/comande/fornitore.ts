import type { FornitoreComanda } from "@prisma/client";

/**
 * **Dove va a finire una comanda quando si preme «Invia in cucina».**
 *
 * Oggi la risposta è una sola: nella coda di Tavolo, cioè in una riga di
 * `Comanda` con `status = INVIATA`. Non c'è CoverManager, non c'è Lightspeed,
 * non c'è Tilby, e il §44 del brief è esplicito — **non si simulano**.
 *
 * Allora perché un'interfaccia con una sola implementazione?
 *
 * Perché il costo di aggiungerla adesso è questo file, e il costo di
 * aggiungerla dopo è riscrivere ogni punto della sala che invia. La regola
 * che questo modulo esiste per far rispettare è una sola:
 *
 * > **nessun componente dell'interfaccia sa dove va la comanda.**
 *
 * La schermata chiama `inviaComanda()`, che chiede a `fornitorePerLocale()`
 * chi prende in carico e gli passa una fotografia. Il giorno in cui un locale
 * avrà un POS collegato, cambia cosa risponde `fornitorePerLocale` — non
 * cambia niente in `app/(staff)`.
 *
 * ## Cosa **non** c'è, di proposito
 *
 * - nessuna classe `LightspeedProvider` vuota che lancia «non implementato»:
 *   un file che esiste sembra una funzione che esiste, e fra sei mesi
 *   qualcuno prova a collegarlo;
 * - nessuna colonna di configurazione nuova: `POSConnector` esiste già nello
 *   schema, con `kind`, `config`, `webhookSecret` e `status`. Quando servirà,
 *   `fornitorePerLocale` leggerà lì.
 *
 * ## La forma del contratto
 *
 * `invia` **non** decide lo stato della comanda: torna un esito, e chi
 * chiama scrive nel database. Un fornitore che scrivesse da sé renderebbe
 * impossibile inviare dentro una transazione, ed è esattamente quello che
 * serve per non lasciare una comanda «inviata» a cui manca una riga.
 */

/* -------------------------------------------------------------------------- */
/*  Cosa vede un fornitore                                                    */
/* -------------------------------------------------------------------------- */

/** Una riga della comanda, come la legge chi la prepara. */
export type RigaDaInviare = {
  /** Il piatto in carta, quando c'è. Il fuori carta non ce l'ha. */
  menuItemId: string | null;
  nome: string;
  quantita: number;
  /** «Al sangue», «Senza pecorino», «Extra patate». */
  modifiche: { kind: string; label: string }[];
  /** A chi va servito. Nullo = tutto il tavolo. */
  ospite: string | null;
  note: string | null;
  /** Gli allergeni **dichiarati dall'ospite**, non quelli del piatto. */
  allergeni: string[];
  notaAllergia: string | null;
};

export type ComandaDaInviare = {
  comandaId: string;
  venueId: string;
  /** Il numero che la sala legge: «comanda 2 del tavolo 12». */
  numero: number;
  tavolo: string | null;
  coperti: number | null;
  cameriere: string | null;
  nota: string | null;
  righe: RigaDaInviare[];
  /**
   * La chiave del tentativo. Un fornitore esterno la userà come chiave di
   * idempotenza sua; quello interno la scrive e basta, perché l'unicità la
   * garantisce già il database.
   */
  invioKey: string | null;
};

export type EsitoInvio =
  | {
      ok: true;
      /** L'identificativo che il fornitore ci restituisce, se ne dà uno. */
      riferimento: string | null;
      /**
       * Vero se il fornitore **conferma già** di aver preso in carico. Quello
       * interno no: la presa in carico la dichiara la cucina quando apre il
       * foglio, ed è l'informazione che il cameriere aspetta davvero.
       */
      presaInCarico: boolean;
    }
  | { ok: false; errore: string; riprovabile: boolean };

/* -------------------------------------------------------------------------- */
/*  Il contratto                                                              */
/* -------------------------------------------------------------------------- */

export interface Fornitore {
  readonly kind: FornitoreComanda;
  /** Il nome che si mostra in interfaccia quando serve dirlo. */
  readonly etichetta: string;
  invia(comanda: ComandaDaInviare): Promise<EsitoInvio>;
  /**
   * Segnala l'annullamento. Opzionale: il fornitore interno non ne ha
   * bisogno — la coda legge lo stato della riga — ma un POS esterno va
   * avvisato, altrimenti continua a preparare un piatto tolto.
   */
  annulla?(comanda: { comandaId: string; fornitoreRef: string | null }): Promise<EsitoInvio>;
}

/* -------------------------------------------------------------------------- */
/*  L'unica implementazione                                                   */
/* -------------------------------------------------------------------------- */

/**
 * La cucina di Tavolo.
 *
 * Non fa niente, e non è una scorciatoia: la comanda è **già** nel database
 * quando si arriva qui, perché è lì che vive la coda. «Inviare» a questo
 * fornitore significa dire che la riga è pronta per essere letta, e quel
 * cambio di stato lo scrive il chiamante nella stessa transazione delle
 * righe.
 *
 * Restituire `ok` senza fare nulla è la risposta corretta per un sistema in
 * cui mittente e destinatario condividono il database. Diventerà una chiamata
 * di rete il giorno in cui non lo condivideranno più.
 */
export const fornitoreInterno: Fornitore = {
  kind: "INTERNO",
  etichetta: "Cucina Tavolo",
  async invia(comanda) {
    return { ok: true, riferimento: comanda.comandaId, presaInCarico: false };
  },
};

/**
 * Chi prende in carico le comande di questo locale.
 *
 * Oggi: sempre la cucina di Tavolo. La firma è già asincrona e già prende il
 * locale perché il giorno in cui si leggerà `POSConnector` non debba
 * cambiare chi la chiama — che sono otto punti fra rotte e server.
 */
export async function fornitorePerLocale(venueId: string): Promise<Fornitore> {
  /* `venueId` non si legge ancora, e sta nella firma apposta: il giorno in
     cui esisterà un `POSConnector` attivo si legge qui, e nessuno degli otto
     punti che chiamano questa funzione cambia. Il riferimento vuoto tiene
     buono il compilatore senza una direttiva da togliere poi. */
  void venueId;
  return fornitoreInterno;
}
