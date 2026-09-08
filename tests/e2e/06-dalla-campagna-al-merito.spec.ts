import { test, expect } from "@playwright/test";
import { leggiVenue, oggiNelLocale, unico } from "./aiuti";

/**
 * Il quinto percorso: dalla campagna al merito.
 *
 * L'invio vero passa da un fornitore email che in prova non c'è, e ha già i
 * suoi test unitari. Quello che nessun test percorreva è la parte **dal clic
 * in poi**, che è quella su cui si regge la domanda «il marketing serve?»:
 *
 * 1. il link dell'email porta a prenotare, con la campagna dentro
 *    l'indirizzo;
 * 2. la prenotazione nasce **col merito** di quella campagna;
 * 3. il merito si vede nei risultati, coi coperti e la stima in euro;
 * 4. e una prenotazione **senza** quel link non finisce sul conto di nessuno.
 *
 * L'ultimo punto è il più importante: un'attribuzione che si prende meriti
 * che non ha è peggio di nessuna attribuzione, perché fa spendere soldi sulla
 * base di un numero gonfiato.
 */
test("dal link della campagna alla prenotazione, e il merito si vede", async ({ page }) => {
  const { venueId, campaignId } = leggiVenue();
  const nome = unico("Campagna");

  /* ---------------------------------------------------------------------- */
  /* 1. Il cliente arriva dal link dell'email                               */
  /* ---------------------------------------------------------------------- */

  // È esattamente l'indirizzo che viaggia dentro l'email: il locale e la
  // campagna. La verifica che la campagna sia di questo locale la fa la
  // route, e c'è un test unitario che lo dice.
  await page.goto(`/book?venue=${venueId}&c=${campaignId}`);

  await page.locator('input[type="date"]').first().fill(oggiNelLocale());
  await page.locator("button[role=combobox]").first().click();
  await page.locator("[role=option]", { hasText: "2 persone" }).first().click();

  const orari = page.locator("fieldset button", { hasText: /^\d{2}:\d{2}$/ });
  await expect(orari.first()).toBeVisible();
  await orari.filter({ hasNot: page.locator("[disabled]") }).first().click();

  await page.locator("#firstName").fill(nome);
  await page.locator("#lastName").fill("Merito");
  await page.locator("#email").fill(`${nome.toLowerCase()}@tavolo.test`);
  await page.locator("#phone").fill("+39 333 000 0009");
  await page.getByRole("button", { name: "Prenota ora" }).click();

  await expect(page.getByText(/richiesta.*ricevut|prenotazione.*confermat|grazie/i).first()).toBeVisible({
    timeout: 30_000,
  });

  /* ---------------------------------------------------------------------- */
  /* 2. La prenotazione esiste, e la campagna se ne prende il merito        */
  /* ---------------------------------------------------------------------- */

  await page.goto("/bookings");
  await expect(page.locator("tr", { hasText: nome })).toBeVisible({ timeout: 30_000 });

  await page.goto(`/campaigns/${campaignId}`);
  await expect(page.getByText("Risultati")).toBeVisible({ timeout: 30_000 });

  /**
   * La frase dei risultati dice tre cose insieme: quante prenotazioni,
   * quanti **coperti** e quanto valgono. I coperti sono la parte che conta:
   * «una prenotazione» non dice se è una coppia o una tavolata, e il valore
   * di una campagna si misura in persone a tavola.
   */
  const risultati = page.getByText(/dal link di questa\s+campagna/);
  await expect(risultati).toBeVisible();
  await expect(risultati).toContainText(/prenotazion/);
  await expect(risultati).toContainText(/coperti/);
  // Lo scontrino medio del locale di prova non è dichiarato: al posto della
  // cifra deve comparire cosa fare per averla, non uno zero finto.
  await expect(risultati).toContainText(/stimati sullo scontrino medio|imposta lo scontrino medio/);

  // E la finestra è dichiarata: un merito senza il suo perimetro è
  // un'affermazione, non una misura.
  await expect(page.getByText(/entro \d+ giorni dall'invio/)).toBeVisible();
});

test("una prenotazione senza quel link non finisce sul conto di nessuna campagna", async ({ page }) => {
  /**
   * La difesa dell'attribuzione: prendersi meriti che non si hanno è peggio
   * di non misurare niente, perché fa spendere soldi su un numero gonfiato.
   */
  const { venueId, campaignId } = leggiVenue();
  const nome = unico("Spontanea");

  // Prima si legge quante prenotazioni risultano attribuite adesso.
  await page.goto(`/campaigns/${campaignId}`);
  const risultati = page.getByText(/dal link di questa\s+campagna|Nessuna prenotazione dal link/);
  await expect(risultati).toBeVisible({ timeout: 30_000 });
  const prima = (await risultati.textContent()) ?? "";
  const contaPrima = Number(prima.match(/^\s*(\d+)/)?.[1] ?? 0);

  // Poi si prenota **senza** il parametro della campagna.
  await page.goto(`/book?venue=${venueId}`);
  await page.locator('input[type="date"]').first().fill(oggiNelLocale());
  await page.locator("button[role=combobox]").first().click();
  await page.locator("[role=option]", { hasText: "2 persone" }).first().click();
  const orari = page.locator("fieldset button", { hasText: /^\d{2}:\d{2}$/ });
  await expect(orari.first()).toBeVisible();
  await orari.filter({ hasNot: page.locator("[disabled]") }).first().click();
  await page.locator("#firstName").fill(nome);
  await page.locator("#lastName").fill("Senza");
  await page.locator("#email").fill(`${nome.toLowerCase()}@tavolo.test`);
  await page.locator("#phone").fill("+39 333 000 0010");
  await page.getByRole("button", { name: "Prenota ora" }).click();
  await expect(page.getByText(/richiesta.*ricevut|prenotazione.*confermat|grazie/i).first()).toBeVisible({
    timeout: 30_000,
  });

  // Il conto della campagna non è cambiato.
  await page.goto(`/campaigns/${campaignId}`);
  const dopo = (await page.getByText(/dal link di questa\s+campagna|Nessuna prenotazione dal link/).textContent()) ?? "";
  const contaDopo = Number(dopo.match(/^\s*(\d+)/)?.[1] ?? 0);
  expect(contaDopo).toBe(contaPrima);
});
