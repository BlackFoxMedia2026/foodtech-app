import { readFileSync } from "node:fs";

/** Il locale creato dal seed dei percorsi, scritto da `global-setup`. */
export function leggiVenue(): {
  venueId: string;
  roomId: string;
  userId: string;
  orgId: string;
  surveyToken: string;
  surveyTokenBasso: string;
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
