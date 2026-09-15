/**
 * Le quattro sezioni delle Impostazioni: i nomi e la lettura dell'indirizzo.
 *
 * In `lib` e non in un componente `"use client"`: da un modulo client il
 * server non può leggere un valore esportato, e questi nomi li legge sia la
 * pagina (che è del server) sia la barra in alto (che è del client). Stessa
 * ragione di `lib/viste-insights`.
 *
 * **Dal 15 settembre non sono quattro pagine, sono quattro ancore.** Erano
 * quattro link con `?parte=`, e la pagina ne mostrava una per volta: entrare
 * nelle Impostazioni voleva dire vedere un quarto delle Impostazioni e dover
 * indovinare in quale degli altri tre stesse la cosa cercata. Adesso la pagina
 * è una sola e scorre; questi `id` sono gli `id` HTML delle sezioni.
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
    sottotitolo: "Identità del ristorante, sedi del gruppo, sale e turni di servizio.",
  },
  {
    id: "prenotazioni",
    titolo: "Prenotazioni",
    sottotitolo: "Le regole con cui si accettano, e il modulo che sta sul vostro sito.",
  },
  {
    id: "ospiti",
    titolo: "Ospiti",
    sottotitolo: "Quanto vale un cliente, dove mandarlo a recensire, cosa si raccoglie di lui.",
  },
  {
    id: "marketing",
    titolo: "Marketing",
    sottotitolo: "Il piano delle newsletter, il dominio da cui partono e come stanno arrivando.",
  },
  {
    id: "sistema",
    titolo: "Sistema",
    sottotitolo: "Il proprio accesso, gli incassi, le integrazioni e i lavori in coda.",
  },
] as const;

export type ParteId = (typeof PARTI)[number]["id"];

/** La parte scelta nell'indirizzo, o la prima. */
export function parteDa(valore: string | null | undefined): ParteId {
  return PARTI.find((p) => p.id === valore)?.id ?? PARTI[0].id;
}
