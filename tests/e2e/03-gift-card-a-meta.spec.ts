import { test, expect } from "@playwright/test";
import { unico } from "./aiuti";

/**
 * Una gift card si usa **in più volte**, e quello che resta resta.
 *
 * È la promessa commerciale della funzione, e sbagliarla vuol dire o regalare
 * soldi o tenerne di qualcun altro. Il percorso la verifica dal denaro
 * incassato fino al residuo che il cliente si ritrova la volta dopo, passando
 * dal conto: nessun test unitario può dire che i tre pezzi si parlino.
 */
test("gift card: si emette, si scala in parte, e il resto resta sulla carta", async ({ page }) => {
  const nome = unico("Regalo");

  /* --- 1. Il locale emette una carta da 100 € ---------------------------- */

  await page.goto("/marketing/gift-cards");
  await page.getByRole("button", { name: "Nuova gift card" }).click();
  const nuova = page.locator('[role="dialog"]');
  await expect(nuova).toBeVisible();
  await nuova.locator("#g-importo").fill("100");
  await nuova.getByRole("button", { name: "Crea la gift card" }).click();
  await expect(nuova).toBeHidden({ timeout: 20_000 });

  // Il codice lo genera Tavolo, leggibile al telefono: si rilegge dall'unica
  // etichetta che lo contiene.
  const etichetta = await page
    .getByRole("button", { name: /^Copia il codice / })
    .first()
    .getAttribute("aria-label");
  const codice = etichetta!.replace("Copia il codice ", "").trim();
  expect(codice).toMatch(/^REGALO-/);

  /* --- 2. Qualcuno si siede senza prenotazione --------------------------- */

  await page.goto("/overview");
  await page.getByRole("button", { name: "Accomoda walk-in" }).click();
  const walkIn = page.locator('[role="dialog"]');
  await expect(walkIn).toBeVisible();
  await walkIn.locator("#wi-name").fill(nome);
  await walkIn.getByRole("button").filter({ hasText: /^P\d/ }).first().click();
  await walkIn.getByRole("button", { name: "Accomoda", exact: true }).click();
  await expect(walkIn).toBeHidden({ timeout: 20_000 });

  /* --- 3. Un piatto sul conto, e cinque euro dalla carta ----------------- */

  await page.goto("/service");
  await page.getByRole("button", { name: `Apri il conto di ${nome}` }).click();
  const conto = page.locator('[role="dialog"]');
  await expect(conto).toBeVisible();

  await conto.locator('input[aria-label="Cerca un piatto da aggiungere"]').fill("Tagliatelle");
  await conto.locator("button", { hasText: "Tagliatelle di prova" }).first().click();
  await expect(conto).toContainText("15,00 €", { timeout: 20_000 });

  await conto.getByRole("button", { name: "Gift card", exact: true }).click();
  await conto.locator("#gc-code").fill(codice);
  await conto.getByRole("button", { name: "Cerca" }).click();

  // La carta si legge prima di scalare: cento euro, tutti disponibili.
  await expect(conto).toContainText("100,00 €", { timeout: 20_000 });

  await conto.locator("#gc-importo").fill("5");
  await conto.getByRole("button", { name: "Scala dal conto" }).click();

  // Il conto non è pagato: restano dieci euro da incassare. È la differenza
  // fra «pagato con la gift card» e «pagato in parte», e sul conto di un
  // ristorante quella differenza è denaro.
  await expect(conto).toContainText("10,00 €", { timeout: 20_000 });

  await conto.getByRole("button", { name: /Chiudi il conto|^Incassa/ }).click();
  await expect(conto).toContainText("Conto chiuso", { timeout: 30_000 });
  await conto.getByRole("button", { name: "Fine" }).click();

  /* --- 4. Sulla carta restano 95 €, per un'altra volta ------------------- */

  await page.goto("/marketing/gift-cards");

  /**
   * Il residuo va letto **sulla carta giusta**, e questa è la parte in cui un
   * percorso può illudersi: cercare «95,00 €» nella pagina lo troverebbe
   * anche se appartenesse a un'altra gift card, e il test passerebbe per caso.
   *
   * Quindi si chiede l'elemento **più piccolo** che contenga sia il codice
   * sia il residuo: se il residuo fosse sbagliato, quell'elemento non
   * esisterebbe.
   */
  const copia = page.getByRole("button", { name: `Copia il codice ${codice}` });
  const scheda = page.locator("div").filter({ has: copia }).filter({ hasText: "95,00 €" }).last();
  await expect(scheda).toBeVisible({ timeout: 20_000 });
  await expect(scheda).toContainText("di 100,00 €");
});
