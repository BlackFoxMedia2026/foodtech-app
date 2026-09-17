import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Il locale creato dal seed dei percorsi, scritto da `global-setup`. */
export function leggiVenue(): {
  venueId: string;
  roomId: string;
  userId: string;
  orgId: string;
  surveyToken: string;
  surveyTokenBasso: string;
  campaignId: string;
} {
  return JSON.parse(readFileSync("tests/e2e/.auth/venue.json", "utf8"));
}

/**
 * Oggi, nel fuso del locale, come lo vuole un campo data (AAAA-MM-GG).
 *
 * Non `new Date().toISOString()`: fra mezzanotte e le due, a Roma, quello
 * restituisce ieri — ed è lo stesso difetto che stanotte ha fatto diventare
 * rosse sei prove unitarie. Qui la data si legge nel fuso in cui il locale
 * lavora.
 */
export function oggiNelLocale(fuso = "Europe/Rome"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date());
}

/**
 * Un nome che non esiste già.
 *
 * I percorsi cercano le proprie righe per nome: due esecuzioni nella stessa
 * giornata troverebbero due «Mario Prova» e il test diventerebbe ambiguo —
 * cioè inutile.
 */
export function unico(base: string): string {
  return `${base}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/** Un euro leggibile come lo scrive l'interfaccia italiana. */
export function euro(centesimi: number): string {
  return `${(centesimi / 100).toFixed(2).replace(".", ",")} €`;
}

/**
 * Apre un'azione della scheda in Servizio.
 *
 * Dal 15 settembre la scheda mostra un comando solo — quello principale — e
 * tiene gli altri dietro «…». Le prove cliccavano direttamente su «Apri il
 * conto di X» e da allora aspettavano per due minuti un pulsante che c'era ma
 * era chiuso: il difetto era nella prova, non nel prodotto, ma il prodotto
 * l'ha scoperto solo la prova.
 *
 * Qui si fa quello che fa una persona: si apre il menu e poi si clicca. Se
 * l'azione è già in vista (le schede cambiano comando principale a seconda
 * dello stato), si clicca senza aprire niente.
 */
export async function azioneScheda(page: Page, nome: string, azione: string) {
  const diretta = page.getByRole("button", { name: azione });
  if (await diretta.isVisible().catch(() => false)) {
    await diretta.click();
    return;
  }
  await page.getByRole("button", { name: `Altre azioni per ${nome}` }).click();
  await page.getByRole("button", { name: azione }).click();
}
