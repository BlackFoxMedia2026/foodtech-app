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

    // E si può prenotare per chi non ha trovato nessuno, senza ridigitare niente.
    await expect(page.getByRole("link", { name: /Prenota/ }).first()).toBeVisible();
  } finally {
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
