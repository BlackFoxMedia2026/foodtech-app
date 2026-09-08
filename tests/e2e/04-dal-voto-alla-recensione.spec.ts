import { test, expect } from "@playwright/test";
import { leggiVenue } from "./aiuti";

/**
 * Le due strade dopo il voto, e il ponte verso la recensione.
 *
 * È la catena su cui si regge l'acquisizione di un ristorante: chi è uscito
 * contento va accompagnato dove lo leggono gli altri, chi non lo è va
 * ascoltato in privato. Due cose vanno verificate insieme, e nessun test
 * unitario le percorre:
 *
 * - il **passaggio si conta**: il collegamento passa dalla nostra porta prima
 *   di arrivare alla piattaforma, altrimenti «quante recensioni ha portato
 *   Tavolo?» resta una domanda senza risposta;
 * - a chi dà un voto basso **non si propone niente di pubblico**.
 */
test("un promotore arriva alla recensione, e il passaggio si conta", async ({ page, context }) => {
  const { surveyToken } = leggiVenue();

  await page.goto(`/s/${surveyToken}`);
  await page.getByRole("button", { name: "10 su 10" }).click();

  // Il ringraziamento, e la strada verso la recensione pubblica.
  await expect(page.getByText(/Grazie/i).first()).toBeVisible({ timeout: 20_000 });
  const invito = page.getByRole("link", { name: /recensione|Scrivila/i }).first();
  await expect(invito).toBeVisible();

  // Il collegamento **non** punta alla piattaforma: punta alla porta che
  // conta il passaggio, e porta con sé il sondaggio da cui arriva.
  const href = await invito.getAttribute("href");
  expect(href).toMatch(/^\/r\/[a-z0-9]+\?s=/);

  // Seguendola si finisce sulla piattaforma dichiarata dal locale.
  const rinvio = await context.request.get(href!, { maxRedirects: 0 });
  expect(rinvio.status()).toBe(302);
  expect(rinvio.headers()["location"]).toContain("esempio.test/recensione-e2e");

  /**
   * E in Analytics il passaggio si vede, contato come **persona**.
   *
   * È il numero che rende la funzione una misura invece di un bottone: se
   * questa riga non comparisse, il ponte esisterebbe e nessuno saprebbe se
   * serve.
   */
  await page.goto("/insights?range=90d");
  await expect(page.getByText("Dai promotori alle recensioni")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/promotore è andato a scrivere/)).toBeVisible();
});

test("a chi dà un voto basso non si propone nulla di pubblico", async ({ page }) => {
  const { surveyTokenBasso } = leggiVenue();

  await page.goto(`/s/${surveyTokenBasso}`);
  await page.getByRole("button", { name: "4 su 10" }).click();

  // Sotto il nove il modulo non registra e ringrazia: chiede **cosa non è
  // andato**, e lo chiede in privato.
  await expect(page.getByLabel("Cosa possiamo fare meglio?")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Cosa possiamo fare meglio?").fill("Attesa lunga al tavolo");
  await page.getByRole("button", { name: "Invia" }).click();

  await expect(page.getByText(/Grazie per la sincerità/i)).toBeVisible({ timeout: 20_000 });

  // Ed è tutto: **nessun invito a scrivere in pubblico**. È la ragione per cui
  // questo meccanismo esiste — intercettare chi è uscito male prima che lo
  // scriva altrove — e un solo link di troppo qui la vanificherebbe.
  await expect(page.getByRole("link", { name: /recensione|Scrivila/i })).toHaveCount(0);
  await expect(page.getByText(/riceve la tua risposta adesso/i)).toBeVisible();
});
