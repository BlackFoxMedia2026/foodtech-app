/**
 * I cinque ruoli con cui una persona entra nel gestionale, come si chiamano e
 * cosa aprono.
 *
 * In `lib` e non nel componente: da un modulo `"use client"` il server non può
 * leggere un valore esportato, e questi nomi servono anche a chi scrive sul
 * server — la pagina dell'invito, un registro, un messaggio d'errore che dice
 * «Reception» invece di `RECEPTION`. Stessa ragione di `lib/parti-impostazioni`.
 *
 * Le chiavi sono quelle dello schema: `Membership.role`. Il nome accanto è
 * l'unica forma che un ristoratore deve leggere — «READ_ONLY» in un'interfaccia
 * è una costante del database mostrata a una persona.
 */
export const RUOLI = [
  { valore: "MANAGER", nome: "Manager", cosa: "tutto, compresi team e impostazioni" },
  { valore: "RECEPTION", nome: "Reception", cosa: "prenotazioni, sala, ospiti" },
  { valore: "WAITER", nome: "Cameriere", cosa: "prenotazioni e sala durante il servizio" },
  { valore: "MARKETING", nome: "Marketing", cosa: "campagne, coupon e numeri" },
  { valore: "READ_ONLY", nome: "Sola lettura", cosa: "guarda, non tocca" },
] as const;

export type ValoreRuolo = (typeof RUOLI)[number]["valore"];

/**
 * Il nome leggibile di un ruolo.
 *
 * Con `??` sulla chiave grezza in chi lo usa: se domani lo schema aggiunge un
 * ruolo, si vede la sigla invece di far sparire l'informazione.
 */
export const NOME_RUOLO: Record<string, string> = Object.fromEntries(
  RUOLI.map((r) => [r.valore, r.nome]),
);
