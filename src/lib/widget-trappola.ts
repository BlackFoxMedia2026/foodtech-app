/**
 * Il nome del campo trappola del widget.
 *
 * Sta in `lib` e non accanto alle difese perché lo usa anche il modulo, che
 * gira nel browser: importarlo da `server/widget-defenses` si porterebbe
 * dietro il client del database. È lo stesso motivo per cui `durataUmana` vive
 * in `lib/durata` e i nomi delle piattaforme in `lib/recensioni`.
 *
 * Il nome somiglia a qualcosa che un programma vuole compilare, ed è la sola
 * ragione per cui è quello.
 */
export const CAMPO_TRAPPOLA = "company_website";
