import { defineConfig, devices } from "@playwright/test";

/**
 * I percorsi end-to-end.
 *
 * I 631 test di Vitest verificano i moduli: che una regola sia giusta, che un
 * saldo si sommi, che un permesso rifiuti. Nessuno di loro percorre
 * *prenoto → arrivo → conto → cliente aggiornato*, che è la cosa per cui il
 * prodotto esiste — e finora quel collaudo l'ho fatto a mano, fuori dal
 * repository, cioè in un modo che nessun altro rifà.
 *
 * Quattro scelte, tutte per la stessa ragione (una prova che fallisce a caso
 * è peggio di nessuna prova):
 *
 * - **un lavoratore solo.** I percorsi scrivono sullo stesso database: in
 *   parallelo si darebbero fastidio, ed è la stessa scelta già fatta per
 *   Vitest (`fileParallelism: false`);
 * - **un solo accesso, riusato.** Il login è limitato a dieci tentativi ogni
 *   dieci minuti: una suite che si autentica a ogni prova si chiude fuori da
 *   sola. Si entra una volta in `global-setup` e si riusa lo stato;
 * - **niente ritentativi in locale.** Un percorso che passa al secondo
 *   tentativo nasconde una condizione di corsa invece di mostrarla;
 * - **il server di sviluppo si riusa se è già acceso**, così chi sta
 *   lavorando non se lo vede spegnere sotto le mani.
 */

const PORTA = 3000;
export const BASE_URL = `http://localhost:${PORTA}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // I percorsi passano da più pagine: il minuto di default sta stretto quando
  // il server di sviluppo compila una rotta per la prima volta.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "tests/e2e/.report", open: "never" }]],
  use: {
    baseURL: BASE_URL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    storageState: "tests/e2e/.auth/staff.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "sala",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 1000 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
