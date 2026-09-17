import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * «Telefono» in barra c'è solo per chi l'ha comprato.
 *
 * Due cose che nessun test di unità può dire: che la voce **non c'è** su un
 * locale senza licenza — e che quando c'è, la pagina dietro esiste e mostra
 * la cosa per cui esiste, le chiamate a cui nessuno ha risposto.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("senza licenza la voce non c'è, e l'indirizzo scritto a mano non esiste", async ({ page }) => {
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });
  await db.venue.update({
    where: { id: locale.id },
    data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
  });

  await page.goto("/overview");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Telefono" })).toHaveCount(0);

  /* 404 e non «non hai i permessi»: la voce non c'è, quindi arrivarci vuol
     dire aver scritto l'indirizzo a mano, e una pagina che risponde «non hai
     comprato questa funzione» è un catalogo di quello che esiste. */
  const r = await page.goto("/telefono");
  expect(r?.status()).toBe(404);
});

test("con la licenza la voce c'è, e la pagina mostra chi non ha trovato nessuno", async ({ page }) => {
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });
  await db.venue.update({
    where: { id: locale.id },
    data: {
      phoneLicenseKey: licenzaDiProva(locale.id, "Locale di prova"),
      phoneLicenseActivatedAt: new Date(),
    },
  });

  const nome = unico("Persa");
  const ospite = await db.guest.create({
    data: { venueId: locale.id, firstName: nome, lastName: "Richiamare", phone: "3479911223" },
  });
  await db.phoneCall.create({
    data: {
      venueId: locale.id,
      externalId: unico("missed"),
      fromNumber: "+393479911223",
      status: "MISSED",
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      endedAt: new Date(Date.now() - 20 * 60 * 1000 + 25_000),
      guestId: ospite.id,
    },
  });

  try {
    await page.goto("/overview");
    const voce = page.getByRole("navigation").getByRole("link", { name: "Telefono" }).first();
    await expect(voce).toBeVisible({ timeout: 20_000 });
    await voce.click();

    await expect(page).toHaveURL(/\/telefono/);
    // Il pulsante che conta porta dentro **quante** sono: se è zero non c'è
    // niente da fare, e si vede senza premere.
    await expect(page.getByRole("button", { name: /Da richiamare\s*1/ })).toBeVisible();
    await expect(page.getByText(nome).first()).toBeVisible();
    await expect(page.getByText("+39 347 9911223")).toBeVisible();
    await expect(page.getByText(/nessuna risposta/)).toBeVisible();

    /* E si prenota per chi non ha trovato nessuno **senza ridigitare niente**.
       Per due giorni questo pulsante passava numero e ospite nell'indirizzo a
       una pagina che non li leggeva: si apriva vuoto, e chi risponde doveva
       riscrivere il numero mentre ascoltava la persona. Un collegamento che
       sembra portare qualcosa e non lo porta è peggio di uno che non c'è. */
    await page.getByRole("link", { name: /Prenota/ }).first().click();
    await expect(page).toHaveURL(/\/bookings\/new/);
    await expect(page.locator("#phone")).toHaveValue("3479911223");
    await expect(page.locator("#firstName")).toHaveValue(nome);
    await expect(page.locator("#lastName")).toHaveValue("Richiamare");
  } finally {
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("a un numero senza nome si può dare un nome, e diventa un contatto", async ({ page }) => {
  /* Era il gesto che mancava: un numero non riconosciuto restava una riga
     nello storico, e in Tavolo non esisteva **nessun** modo di creare un
     contatto dall'interfaccia — la rotta c'era e nessuna schermata la
     chiamava. */
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });
  await db.venue.update({
    where: { id: locale.id },
    data: {
      phoneLicenseKey: licenzaDiProva(locale.id, "Locale di prova"),
      phoneLicenseActivatedAt: new Date(),
    },
  });

  const numero = "3466677788";
  await db.phoneCall.create({
    data: {
      venueId: locale.id,
      externalId: unico("senzanome"),
      fromNumber: `+39${numero}`,
      status: "MISSED",
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
    },
  });
  const nome = unico("Anonimo");

  try {
    await page.goto("/telefono");
    await expect(page.getByText("Non riconosciuto").first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Dai un nome/ }).first().click();
    await page.getByLabel(/Nome di chi ha chiamato/).fill(nome);
    await page.getByLabel("Cognome, facoltativo").fill("Salvato");
    await page.getByRole("button", { name: "Salva", exact: true }).click();

    // La riga smette di dire «Non riconosciuto» e porta il nome.
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 20_000 });

    // E il contatto esiste davvero, col numero attaccato.
    const creato = await db.guest.findFirstOrThrow({
      where: { venueId: locale.id, firstName: nome },
      select: { id: true, phone: true, lastName: true },
    });
    expect(creato.lastName).toBe("Salvato");
    expect(creato.phone).toContain(numero);

    // La chiamata è legata a lui: dalla volta dopo viene riconosciuto.
    const chiamata = await db.phoneCall.findFirstOrThrow({
      where: { venueId: locale.id, fromNumber: `+39${numero}` },
      select: { guestId: true },
    });
    expect(chiamata.guestId).toBe(creato.id);
  } finally {
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.deleteMany({ where: { venueId: locale.id, firstName: nome } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
