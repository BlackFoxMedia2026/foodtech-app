/**
 * **Gli allergeni e i regimi alimentari**, in un file senza `db`.
 *
 * Stavano in `server/menu.ts` e ci sono stati fino a che li leggeva solo il
 * server. Da quando la comanda si batte dal telefono, la griglia dei
 * quattordici allergeni la disegna un componente client — e importarla da
 * `server/menu.ts` si porterebbe dietro `@/lib/db` dentro il pacchetto del
 * browser.
 *
 * Spostati e non copiati: `server/menu.ts` li ri-esporta, quindi chi li
 * importava da lì continua a funzionare e **non esistono due elenchi**. Su
 * questo in particolare la duplicazione sarebbe grave: due liste di allergeni
 * che divergono sono un cliente celiaco che legge la lista sbagliata.
 */

/**
 * I quattordici allergeni a dichiarazione obbligatoria (Regolamento UE
 * 1169/2011). L'elenco è chiuso di proposito: su questo non si improvvisa.
 */
export const ALLERGENI = {
  glutine: "Glutine",
  crostacei: "Crostacei",
  uova: "Uova",
  pesce: "Pesce",
  arachidi: "Arachidi",
  soia: "Soia",
  latte: "Latte",
  frutta_a_guscio: "Frutta a guscio",
  sedano: "Sedano",
  senape: "Senape",
  sesamo: "Sesamo",
  solfiti: "Solfiti",
  lupini: "Lupini",
  molluschi: "Molluschi",
} as const;

export type Allergene = keyof typeof ALLERGENI;

/** Come si mangia, non cosa contiene: è un'altra domanda e un altro elenco. */
export const REGIMI = {
  vegetariano: "Vegetariano",
  vegano: "Vegano",
  senza_glutine: "Senza glutine",
  senza_lattosio: "Senza lattosio",
  piccante: "Piccante",
} as const;

export type Regime = keyof typeof REGIMI;

/*
  I codici vecchi, in inglese e maiuscolo.

  Sul menu pubblico in produzione si leggeva **«Contiene: , ,»**: gli allergeni
  erano salvati come `GLUTEN`, `DAIRY`, `EGGS` — codici scritti da una versione
  precedente — e il dizionario ha chiavi italiane minuscole, quindi ogni
  etichetta veniva `undefined` e restavano solo le virgole.

  È la riga che legge chi ha un'allergia, seduto a un tavolo col telefono in
  mano. Mostrare la punteggiatura di un elenco vuoto è peggio che non mostrare
  niente: dice che l'informazione c'è, e poi non la dà.

  Nessuna parte del codice scrive più questi codici, ma i dati vecchi restano.
  Tradurli qui — in lettura, in un posto solo — li sistema su ogni schermata e
  su ogni installazione, senza toccare le righe già salvate.
*/
const ALIAS_ALLERGENI: Record<string, Allergene> = {
  GLUTEN: "glutine",
  CRUSTACEANS: "crostacei",
  SHELLFISH: "crostacei",
  EGGS: "uova",
  FISH: "pesce",
  PEANUTS: "arachidi",
  SOY: "soia",
  SOYA: "soia",
  DAIRY: "latte",
  MILK: "latte",
  NUTS: "frutta_a_guscio",
  TREE_NUTS: "frutta_a_guscio",
  CELERY: "sedano",
  MUSTARD: "senape",
  SESAME: "sesamo",
  SULPHITES: "solfiti",
  SULFITES: "solfiti",
  LUPIN: "lupini",
  MOLLUSCS: "molluschi",
  MOLLUSKS: "molluschi",
};

const ALIAS_REGIMI: Record<string, Regime> = {
  VEGETARIAN: "vegetariano",
  VEGAN: "vegano",
  GLUTEN_FREE: "senza_glutine",
  LACTOSE_FREE: "senza_lattosio",
  SPICY: "piccante",
};

/**
 * Il nome di un allergene, sempre qualcosa di leggibile.
 *
 * Se il codice non è né una chiave nota né un alias, si mostra **il codice**
 * ripulito invece di una stringa vuota: un cliente allergico che legge
 * «Contiene: SENAPE_NUOVA» sa di dover chiedere, uno che legge «Contiene:»
 * pensa che non ci sia niente.
 */
export function nomeAllergene(codice: string): string {
  const chiave = codice in ALLERGENI ? (codice as Allergene) : ALIAS_ALLERGENI[codice.toUpperCase()];
  return chiave ? ALLERGENI[chiave] : leggibile(codice);
}

/** Come `nomeAllergene`, per i regimi alimentari. */
export function nomeRegime(codice: string): string {
  const chiave = codice in REGIMI ? (codice as Regime) : ALIAS_REGIMI[codice.toUpperCase()];
  return chiave ? REGIMI[chiave] : leggibile(codice);
}

/**
 * Un codice ignoto, reso leggibile — e **mai vuoto**.
 *
 * La prima versione era `codice.replace(/_/g, " ")`, e un test l'ha bocciata:
 * un codice fatto di soli trattini bassi diventava uno spazio, cioè di nuovo
 * un buco fra due virgole — lo stesso difetto che si stava correggendo,
 * arrivato da un'altra strada.
 *
 * Se non resta nemmeno una lettera o una cifra, si dice «non specificato»:
 * che è la verità, ed è un'informazione — chi legge sa di dover chiedere.
 */
export function leggibile(codice: string): string {
  const pulito = codice.replace(/_/g, " ").trim().toLowerCase();
  return /[a-z0-9]/i.test(pulito) ? pulito : "non specificato";
}

