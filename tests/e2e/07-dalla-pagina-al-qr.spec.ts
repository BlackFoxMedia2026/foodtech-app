import { test, expect } from "@playwright/test";

/**
 * La pagina dei QR code partiva da un foglio bianco, e il ristoratore doveva
 * sapere da sé quali pagine pubbliche il suo locale ha e a quale indirizzo
 * stanno. Il percorso verifica la cosa che conta: che da una superficie
 * **proposta dal prodotto** nasca un QR vero, con quella destinazione, e che
 * la proposta poi non si ripeta.
 */
test("dalla pagina pubblica al QR: la proposta diventa un codice, e non si ripete", async ({ page }) => {
  await page.goto("/marketing/qr-codes");

  const blocco = page.locator("details", { hasText: "Le tue pagine pubbliche" });
  await expect(blocco).toBeVisible({ timeout: 20_000 });

  /* La prenotazione è l'unica superficie sempre pronta: quella pagina esiste
     per ogni locale, quindi il percorso non dipende da com'è la demo. */
  const riga = blocco.locator("li", { hasText: "Prenota un tavolo" });
  await expect(riga).toBeVisible();

  // L'indirizzo è mostrato prima di creare: chi stampa un QR deve poterlo leggere.
  const indirizzo = (await riga.locator("p.font-mono").innerText()).trim();
  expect(indirizzo).toContain("/book?venue=");

  const giaCreato = await riga.getByText("Già creato").count();
  if (giaCreato > 0) {
    // Un'altra esecuzione l'ha già creato: la proposta resta chiusa, ed è
    // esattamente ciò che questo percorso vuole garantire.
    await expect(riga.getByRole("button", { name: "Crea il QR" })).toHaveCount(0);
    return;
  }

  await riga.getByRole("button", { name: "Crea il QR" }).click();

  // Il QR nasce con quella destinazione, non con un indirizzo inventato.
  const scheda = page.locator("div", { hasText: "Prenota un tavolo" }).filter({ hasText: indirizzo });
  await expect(scheda.first()).toBeVisible({ timeout: 20_000 });

  // E la proposta non si ripete: il confronto è sulla destinazione.
  await expect(riga.getByText("Già creato")).toBeVisible({ timeout: 20_000 });
  await expect(riga.getByRole("button", { name: "Crea il QR" })).toHaveCount(0);
});
