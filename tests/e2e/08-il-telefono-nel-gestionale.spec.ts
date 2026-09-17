import { expect, test } from "@playwright/test";

/**
 * Il telefono si accende **dentro Tavolo**, e si vede che c'è anche prima di
 * averlo comprato.
 *
 * È la prova che manca a ogni test di unità: la licenza è verificata da
 * diciannove prove contro firme vere, ma nessuna di quelle dice che esiste una
 * schermata dove incollare la chiave. È lo stesso difetto che aveva fatto
 * sparire «invita un collega» — il codice c'era e non ci arrivava nessuno.
 */
test("in Impostazioni c'è il telefono, e dice cosa farebbe prima di averlo", async ({ page }) => {
  await page.goto("/settings");

  const titolo = page.getByRole("heading", { name: "Telefono", exact: true });
  await expect(titolo).toBeVisible({ timeout: 20_000 });

  /* Ristretto al gruppo del telefono: «Non collegato» compare anche sul conto
     Stripe, che è l'altra cosa che si collega al locale. Una prova che cerca
     quel testo in tutta la pagina passerebbe anche col telefono assente.
     `ancestor::section[1]` è la sezione **più vicina**: le sezioni sono
     annidate — «Sistema» contiene tutti i suoi gruppi — e un filtro normale
     ne prenderebbe due. */
  const sezione = titolo.locator("xpath=ancestor::section[1]");

  // Spento, e lo dice senza mezzi termini.
  await expect(sezione.getByText("Non collegato")).toBeVisible();

  /* Le funzioni si vedono anche da spente: una funzione che non si sa di
     poter comprare non si compra. Ed è scritto in italiano — non «API», non
     «integrazione»: per il ristoratore è il suo telefono. */
  await expect(sezione.getByText("Chi sta chiamando", { exact: true })).toBeVisible();
  await expect(sezione.getByText(/mostra chi sta chiamando/)).toBeVisible();
  await expect(sezione.getByText("Prenotazioni al telefono", { exact: true })).toBeVisible();

  // E c'è il campo dove si incolla la chiave.
  const campo = page.locator("#centralino-chiave");
  await expect(campo).toBeVisible();
  await expect(page.getByRole("button", { name: "Attiva" })).toBeVisible();
});

test("una chiave inventata non accende niente, e dice perché", async ({ page }) => {
  await page.goto("/settings");
  const campo = page.locator("#centralino-chiave");
  await expect(campo).toBeVisible({ timeout: 20_000 });

  await campo.fill("tvlc1.questa-non-e-una-chiave.per-niente");
  await page.getByRole("button", { name: "Attiva" }).click();

  /* Il messaggio è per una persona che ha pagato e sta incollando una riga:
     dice cosa fare. Un «non valida» generico le farebbe aprire una
     segnalazione per una cosa che risolve in un minuto. */
  await expect(page.getByText(/non sembra una chiave|copiata tutta/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page
      .getByRole("heading", { name: "Telefono", exact: true })
      .locator("xpath=ancestor::section[1]")
      .getByText("Non collegato"),
  ).toBeVisible();
});
