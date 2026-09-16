import { test, expect } from "@playwright/test";

/**
 * Dal «cosa vuoi creare» a un codice salvato.
 *
 * Il percorso verifica la cosa che il nuovo flusso promette e che quello
 * vecchio non poteva promettere: che **senza scrivere un indirizzo** — senza
 * nemmeno saperlo — da una scelta nasca un QR vero, con la destinazione giusta
 * e un'anteprima che si vede. È il motivo per cui la pagina è stata rifatta.
 *
 * La prenotazione è il tipo scelto apposta: quella pagina esiste per ogni
 * locale, quindi il percorso non dipende da com'è messa la demo — niente
 * piatti da avere in carta, niente pagamenti da accendere, niente rete Wi-Fi
 * da configurare.
 */
test("da «cosa vuoi creare» a un QR salvato, senza scrivere indirizzi", async ({ page }) => {
  await page.goto("/marketing/qr-codes");
  const nuovo = page.getByRole("button", { name: "Nuovo QR code" });
  await expect(nuovo).toBeVisible({ timeout: 20_000 });
  await nuovo.click();

  const scelta = page.getByRole("dialog");
  await expect(scelta.getByText("Cosa vuoi creare?")).toBeVisible();
  await scelta.getByRole("button", { name: /Prenota un tavolo/ }).click();

  /* L'editor arriva già compilato: nome, destinazione e invito sulla cornice
     ci sono prima che qualcuno tocchi qualcosa. */
  const nome = page.getByLabel("Nome QR");
  await expect(nome).toHaveValue(/.+/, { timeout: 20_000 });

  const indirizzo = await page.locator("p.font-mono").first().innerText();
  expect(indirizzo).toContain("/book?venue=");

  // L'anteprima è un codice vero, disegnato dal vivo.
  const anteprima = page.locator("section[aria-label='Anteprima'] svg").first();
  await expect(anteprima).toBeVisible();

  const etichetta = `E2E prenotazioni ${Date.now()}`;
  await nome.fill(etichetta);

  await page.getByRole("button", { name: "Salva QR" }).first().click();

  // La schermata finale porta il file, che è la ragione per cui si è arrivati fin qui.
  await expect(page.getByRole("heading", { name: "QR code pronto" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(etichetta)).toBeVisible();
  await expect(page.getByRole("button", { name: "Scarica" })).toBeVisible();

  await page.getByRole("button", { name: "Fine" }).click();

  // E in elenco c'è, con il suo tipo e la sua destinazione.
  const riga = page.locator("article", { hasText: etichetta });
  await expect(riga).toBeVisible({ timeout: 20_000 });
  await expect(riga.getByText("Prenota un tavolo")).toBeVisible();
  await expect(riga.getByText(indirizzo, { exact: false })).toBeVisible();
});
