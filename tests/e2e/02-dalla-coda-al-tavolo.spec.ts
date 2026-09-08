import { test, expect } from "@playwright/test";
import { unico } from "./aiuti";

/**
 * La lista d'attesa serve a una cosa sola: **far sedere chi sarebbe andato
 * altrove**. Il percorso verifica che quella cosa succeda per intero — dalla
 * riga in coda a una prenotazione vera, con il tavolo assegnato — perché è
 * l'unico modo di sapere che i coperti recuperati che Analytics conta sono
 * coperti veri.
 */
test("dalla coda al tavolo: accomodare crea una prenotazione, non una riga chiusa", async ({ page }) => {
  const nome = unico("Coda");

  await page.goto("/waitlist");
  await page.getByRole("button", { name: /Aggiungi in lista|Aggiungi la prima persona/ }).first().click();

  const aggiungi = page.locator('[role="dialog"]');
  await expect(aggiungi).toBeVisible();
  await aggiungi.locator("#wl-name").fill(nome);
  await aggiungi.getByRole("button", { name: "Aggiungi in lista" }).click();
  await expect(aggiungi).toBeHidden({ timeout: 20_000 });

  // In coda: la riga esiste e aspetta.
  await expect(page.getByText(nome).first()).toBeVisible({ timeout: 20_000 });

  // Accomodare **richiede un tavolo**: il selettore propone solo quelli
  // liberi adesso, e senza scegliere non si può confermare.
  await page.getByRole("button", { name: "Accomoda", exact: true }).first().click();
  const scelta = page.locator('[role="dialog"]');
  await expect(scelta).toBeVisible();
  await expect(scelta.getByRole("button", { name: "Accomoda qui" })).toBeDisabled();

  await scelta.getByRole("button").filter({ hasText: /^P\d/ }).first().click();
  await scelta.getByRole("button", { name: "Accomoda qui" }).click();
  await expect(scelta).toBeHidden({ timeout: 20_000 });

  // Fuori dalla coda: chi si è seduto non aspetta più.
  await expect(page.getByText(nome)).toHaveCount(0, { timeout: 20_000 });

  /**
   * E in sala c'è una prenotazione vera, seduta a un tavolo.
   *
   * È la parte che conta: se accomodare chiudesse solo la riga in coda, la
   * persona sarebbe a tavola per il personale e invisibile al software —
   * niente conto, niente storia, niente coperti nei numeri della serata.
   */
  await page.goto("/service");
  await expect(page.getByText(nome).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Apri il conto di ${nome}` })).toBeVisible();
});
