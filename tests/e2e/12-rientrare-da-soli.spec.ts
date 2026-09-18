import { test, expect } from "@playwright/test";

/**
 * Chi perde la password rientra da solo.
 *
 * Questo percorso non esisteva, e l'assenza era **travestita da presenza**:
 * sotto il modulo d'accesso c'era scritto «Password dimenticata?» in
 * carattere piccolo, allineato a destra, dove sta un collegamento — ed era uno
 * `<span>`. Si cliccava e non succedeva niente.
 *
 * Il test guarda l'unica cosa che un test unitario non può dire: che il
 * collegamento **porta da qualche parte**. Tutto il resto — la risposta che
 * non rivela chi ha un account, il link che vale una volta, la persona
 * disattivata che non rientra — sta in `tests/recupero-password.test.ts`, dove
 * si può provare senza mandare email.
 */
test("dalla schermata d'accesso al recupero della password", async ({ page }) => {
  await page.goto("/sign-in");

  /* Prima di cliccare: deve essere un collegamento. Con lo `<span>` di prima
     questa riga diventa rossa — senza di lei il test passerebbe anche su una
     scritta che non fa niente, perché `page.goto` ci arriverebbe comunque. */
  const collegamento = page.getByRole("link", { name: "Password dimenticata?" });
  await expect(collegamento).toBeVisible();

  await collegamento.click();
  await expect(page).toHaveURL(/\/password-dimenticata$/);
  await expect(page.getByRole("heading", { name: "Password dimenticata" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mandami il link" })).toBeVisible();

  // E si torna indietro senza cercare il tasto del browser.
  await page.getByRole("link", { name: /Ricordi la password/ }).click();
  await expect(page).toHaveURL(/\/sign-in/);

  /* Un link di reimpostazione scaduto o inventato non lascia in un vicolo
     cieco: prima diceva «chiedi al responsabile del locale», che per un
     manager non è una strada. */
  await page.goto(`/reimposta-password/${"a".repeat(64)}`);
  await expect(page.getByRole("heading", { name: "Questo link non è più valido" })).toBeVisible();
  await page.getByRole("link", { name: "Mandami un altro link" }).click();
  await expect(page).toHaveURL(/\/password-dimenticata$/);
});
