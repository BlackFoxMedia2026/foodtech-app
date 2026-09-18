import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { licenzaDiProva } from "./licenza-prova";

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

/**
 * Il telefono si accende **dentro Tavolo**, e si vede che c'è anche prima di
 * averlo comprato.
 *
 * È la prova che manca a ogni test di unità: la licenza è verificata da
 * diciannove prove contro firme vere, ma nessuna di quelle dice che esiste una
 * schermata dove incollare la chiave. È lo stesso difetto che aveva fatto
 * sparire «invita un collega» — il codice c'era e non ci arrivava nessuno.
 */
test("in Impostazioni c'è il telefono, e dice cosa farebbe prima di averlo", async ({
  page,
}) => {
  await page.goto("/settings?sez=sistema");

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
  await expect(
    sezione.getByText("Chi sta chiamando", { exact: true }),
  ).toBeVisible();
  await expect(sezione.getByText(/mostra chi sta chiamando/)).toBeVisible();
  await expect(
    sezione.getByText("Prenotazioni al telefono", { exact: true }),
  ).toBeVisible();

  /* E c'è la strada per collegarlo: **un pulsante**, non dodici righe da
     compilare qui dentro. La scheda dice com'è adesso; le cose da fare stanno
     nella procedura a passi, dove hanno un ordine. */
  const collega = sezione.getByRole("link", { name: /Collega il telefono/ });
  await expect(collega).toBeVisible();

  await collega.click();
  await expect(page).toHaveURL(/\/settings\/telefono\/collega/);

  /* E là c'è il codice del locale col pulsante per copiarlo: serve **per
     ottenere** la chiave, e prima non era scritto in nessuna schermata — chi
     compilava il modulo metteva il nome del locale al suo posto e otteneva una
     licenza che non accendeva niente. */
  const identificativo = page.locator("code").first();
  await expect(identificativo).toBeVisible();
  // un cuid, non un nome
  await expect(identificativo).toHaveText(/^c[a-z0-9]{20,}$/);
  await expect(page.locator("#chiave-licenza")).toBeVisible();
});

test("una chiave inventata non accende niente, e dice perché", async ({
  page,
}) => {
  await page.goto("/settings/telefono/collega");
  const campo = page.locator("#chiave-licenza");
  await expect(campo).toBeVisible({ timeout: 20_000 });

  await campo.fill("tvlc1.questa-non-e-una-chiave.per-niente");
  await page.getByRole("button", { name: "Attiva" }).click();

  /* Il messaggio è per una persona che ha pagato e sta incollando una riga:
     dice cosa fare. Un «non valida» generico le farebbe aprire una
     segnalazione per una cosa che risolve in un minuto. */
  await expect(
    page.getByText(/non sembra una chiave|copiata tutta/),
  ).toBeVisible({
    timeout: 20_000,
  });
  /* E il passo resta da fare: una chiave rifiutata non deve spuntare niente. */
  await expect(page.getByText("Passo 1 di 4")).toBeVisible();
});

test("le impostazioni si aprono da un indice a schede", async ({ page }) => {
  /**
   * Il difetto: «uno scroll infinito». Le cinque sezioni stavano tutte in una
   * pagina alta ottomila pixel — otto schermate e mezzo di righe tutte uguali.
   *
   * Adesso l'indice è fatto di schede, e ogni scheda dice **cosa c'è dentro**:
   * è la differenza con le cinque pagine che questo prodotto aveva all'inizio
   * e che sono state togliate perché bisognava indovinare dove stessero le
   * cose.
   */
  await page.goto("/settings");

  // L'indice: cinque schede, e nessuna riga di impostazioni.
  await expect(page.getByRole("link", { name: /Il locale/ })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Turni di servizio").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Brand" })).toHaveCount(0);

  // Si apre quella che serve, e dentro c'è quello che la scheda prometteva.
  await page
    .getByRole("link", { name: /Il locale/ })
    .first()
    .click();
  await expect(page).toHaveURL(/sez=locale/);
  await expect(page.getByRole("heading", { name: "Brand" })).toBeVisible();
  // E le altre non ci sono: una sezione per volta.
  await expect(page.getByRole("heading", { name: "Piano DEM" })).toHaveCount(0);

  // La via di ritorno all'indice, che la barra in alto non dà.
  await page.getByRole("link", { name: "Tutte le impostazioni" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Brand" })).toHaveCount(0);
});

test("collegare il telefono è una procedura a passi, e si riprende da dove si era", async ({
  page,
}) => {
  /**
   * Il difetto: «è troppo incasinato». Per collegare un locale servivano sei
   * gesti in due applicazioni, in un ordine preciso, con **due chiavi che
   * viaggiano in versi opposti** — e la scheda del telefono mostrava dodici
   * righe contemporaneamente, senza dire da dove cominciare.
   *
   * Questa prova fissa la cosa che rende la procedura ripetibile: **a che
   * passo sei lo dicono i dati, non un pulsante «avanti»**. Si apre la pagina
   * senza licenza e il passo uno è il primo; si incolla la chiave e il passo
   * due si spunta da solo, senza che nessuno l'abbia dichiarato.
   */
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });
  await db.venue.update({
    where: { id: locale.id },
    data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
  });

  try {
    await page.goto("/settings/telefono/collega");

    // Dove sono: il conto dei passi si legge, non si indovina.
    await expect(page.getByText("Passo 1 di 4")).toBeVisible({
      timeout: 30_000,
    });
    // Il codice del locale, da mandare a chi emette la chiave.
    await expect(page.getByText(locale.id)).toBeVisible();
    /* Il passo 3 non si può fare prima del 2, e lo dice invece di far premere
       un pulsante che risponde con un errore. */
    await expect(page.getByText("Prima serve il passo 2.")).toBeVisible();

    // Passo 2: si incolla la chiave vera, firmata come per un cliente.
    await page
      .getByLabel(/La chiave/)
      .fill(licenzaDiProva(locale.id, "Locale di prova"));
    await page.getByRole("button", { name: "Attiva" }).click();

    /* E il passo si spunta **da sé**, perché lo stato viene dai dati: due
       passi fatti su quattro, senza che nessuno abbia dichiarato niente. */
    await expect(page.getByText("2 di 4 fatti")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Passo 3 di 4")).toBeVisible();
    await expect(page.getByText("Prima serve il passo 2.")).toHaveCount(0);
  } finally {
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
