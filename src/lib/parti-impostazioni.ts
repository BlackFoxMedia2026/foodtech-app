/**
 * Le quattro sezioni delle Impostazioni: i nomi e la lettura dell'indirizzo.
 *
 * In `lib` e non in un componente `"use client"`: da un modulo client il
 * server non può leggere un valore esportato, e questi nomi li legge sia la
 * pagina (che è del server) sia la barra in alto (che è del client). Stessa
 * ragione di `lib/viste-insights`.
 *
 * **Dal 18 settembre sono cinque schede, e una si apre.** La storia di questa
 * pagina vale la pena di essere scritta, perché è andata avanti e indietro:
 *
 * - all'inizio cinque pagine con `?parte=`: entrare nelle Impostazioni voleva
 *   dire vedere un quinto delle Impostazioni e **indovinare** in quale degli
 *   altri quattro stesse la cosa cercata;
 * - poi una pagina sola che scorre, con le sezioni come ancore: si vedeva
 *   tutto, ma «tutto» erano **ottomila pixel** — otto schermate e mezzo di
 *   righe tutte uguali. «Uno scroll infinito», ed era vero;
 * - adesso l'indice è fatto di **schede**, una per sezione, e ogni scheda dice
 *   cosa c'è dentro. Si apre quella che serve.
 *
 * La differenza con la prima versione — quella che non funzionava — è proprio
 * `dentro`: il problema di allora non era avere una sezione per volta, era non
 * sapere dove stessero le cose. Un indice che elenca i gruppi lo risolve senza
 * far scorrere niente.
 *
 * **Il centralino è entrato il 18 settembre**, e prima stava dentro «Sistema»
 * accanto ai pagamenti, perché erano le due cose che si *collegano* al locale
 * invece di configurarsi. Sbagliato: per un ristoratore il telefono non è un
 * pezzo del funzionamento del gestionale, è **il suo telefono** — e cercarlo
 * fra l'accesso, gli incassi e i lavori in coda vuol dire non trovarlo.
 *
 * Il criterio del raggruppamento è **di chi è la decisione**: il locale (chi
 * siamo, com'è fatta la sala), le prenotazioni (le regole con cui si
 * accettano), gli ospiti (cosa si fa con chi è venuto), il marketing (con
 * quale piano e da quale dominio si scrive loro), il sistema (le cose che
 * riguardano il funzionamento, non il ristorante).
 *
 * **Marketing è entrato il 15 settembre**, e sta qui e non nel menu Marketing
 * in barra: là ci sono gli **strumenti** — le campagne, i coupon, le gift card
 * — cioè le cose che si aprono per fare qualcosa. Un piano si guarda una volta
 * al mese e un dominio di invio si configura una volta sola: sono
 * configurazioni, e allungare con loro l'elenco che si legge ogni volta è il
 * modo di rendere più lento l'accesso alle sei cose che servono davvero.
 *
 * «Chi lavora» non è fra queste: sta in Staff, sulla scheda della persona.
 */
export const PARTI = [
  {
    id: "locale",
    titolo: "Il locale",
    sottotitolo:
      "Identità del ristorante, sedi del gruppo, sale e turni di servizio.",
    dentro: [
      "Brand",
      "Locali del gruppo",
      "Organizzazione del servizio",
      "Turni di servizio",
    ],
  },
  {
    id: "prenotazioni",
    titolo: "Prenotazioni",
    sottotitolo:
      "Le regole con cui si accettano, e il modulo che sta sul vostro sito.",
    dentro: ["Quando si prenota dal sito", "Widget di prenotazione"],
  },
  {
    id: "ospiti",
    titolo: "Ospiti",
    sottotitolo:
      "Quanto vale un cliente, dove mandarlo a recensire, cosa si raccoglie di lui.",
    dentro: [
      "Valore di un cliente",
      "Raccolta punti",
      "Recensioni",
      "Wi-Fi",
      "Dati dei clienti",
    ],
  },
  {
    id: "centralino",
    titolo: "Centralino",
    sottotitolo:
      "Il telefono del locale dentro Tavolo: chi chiama, cosa rispondere, com'è collegato.",
    dentro: ["Il collegamento", "Cosa è acceso", "Cosa rispondere"],
  },
  {
    id: "marketing",
    titolo: "Marketing",
    sottotitolo:
      "Il piano delle newsletter, il dominio da cui partono e come stanno arrivando.",
    dentro: ["Piano DEM", "Dominio di invio", "Reputazione"],
  },
  {
    id: "sistema",
    titolo: "Sistema",
    sottotitolo:
      "Il proprio accesso, gli incassi, le integrazioni e i lavori in coda.",
    dentro: ["Il tuo accesso", "Chi ha accesso", "Pagamenti", "Integrazioni", "Lavori in coda"],
  },
] as const;

export type ParteId = (typeof PARTI)[number]["id"];

/**
 * La parte chiesta nell'indirizzo, o `null` per l'indice.
 *
 * `null` e non «la prima»: senza sezione nell'indirizzo si vede **l'indice**,
 * e restituire una sezione per difetto vorrebbe dire che l'indice non esiste.
 */
export function parteDa(valore: string | null | undefined): ParteId | null {
  return PARTI.find((p) => p.id === valore)?.id ?? null;
}

/** L'indirizzo di una sezione. Un posto solo, così non divergono. */
export function indirizzoParte(id: ParteId): string {
  return `/settings?sez=${id}`;
}
