import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { emettiApiToken } from "../../src/server/api-token";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * Dalla telefonata da quaranta persone all'evento in agenda.
 *
 * È il pezzo con cui i concorrenti fanno margine e che in Tavolo non c'era:
 * «siamo quaranta per una laurea, un sabato di dicembre, quanto viene?» finiva
 * in un «la richiamano» detto a voce, senza che restasse una riga da nessuna
 * parte.
 *
 * Quello che un test di unità non mette in fila e questo sì: che la richiesta
 * arrivata **dal centralino** compaia nella coda di chi vende eventi, che il
 * preventivo si scriva dalla riga, che accettare porti la prenotazione in
 * agenda **marcata come evento** — e che finché è una trattativa la sala resti
 * libera.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("la richiesta dal telefono diventa un preventivo e poi una prenotazione", async ({
  page,
  request,
}) => {
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

  const nome = unico("Laurea");
  const chiamata = unico("call-evento");
  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (eventi)",
    ambiti: ["telefonia:write"],
  });

  try {
    /* --- 1. Il centralino apre la trattativa --------------------------- */
    const aperta = await request.post("/api/v1/telefonia/evento", {
      headers: { authorization: `Bearer ${token.token}` },
      data: {
        chiamata,
        nome,
        phone: "+393334445566",
        persone: 40,
        quandoTesto: "un sabato di dicembre",
        tipo: "laurea",
      },
    });
    expect(aperta.status()).toBe(201);

    /* Idempotente: il centralino che ritenta non apre due trattative, e non
       manda due preventivi alla stessa persona. */
    const ancora = await request.post("/api/v1/telefonia/evento", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { chiamata, nome, persone: 40 },
    });
    expect(ancora.status()).toBe(200);
    expect((await ancora.json()).giaAperta).toBe(true);

    /* E la sala resta libera: quaranta coperti non sono in agenda. */
    expect(
      await db.booking.count({ where: { venueId: locale.id, partySize: 40, isGroup: true } }),
    ).toBe(0);

    /* --- 2. La coda di chi vende eventi -------------------------------- */
    await page.goto("/eventi");
    /* Dentro `main`: il titolo compare due volte — nella testata del guscio e
       nella pagina — e cercarlo senza dire dove trova due elementi. */
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Eventi e gruppi" }),
    ).toBeVisible({ timeout: 30_000 });
    const riga = page.locator("li").filter({ hasText: nome });
    await expect(riga).toBeVisible();
    await expect(riga).toContainText("40 persone");
    await expect(riga).toContainText("un sabato di dicembre");
    await expect(riga.getByText("Da guardare")).toBeVisible();

    /* --- 3. Il preventivo si scrive dalla riga ------------------------- */
    await riga.getByRole("button", { name: "Fai il preventivo" }).click();
    await riga.getByLabel("Totale").fill("1800");
    await riga.getByLabel("A testa").fill("45");
    await riga.getByLabel("Menu concordato").fill("Antipasto misto, due primi, dolce");
    /* Una data lontana e fissa: la prenotazione che nasce deve avere un quando
       verificabile, non «fra tre giorni». */
    await riga.getByLabel("Giorno e ora").fill("2026-12-12T20:30");
    await riga.getByRole("button", { name: "Salva il preventivo" }).click();

    await expect(page.locator("li").filter({ hasText: nome }).getByText("Preventivo mandato")).toBeVisible({
      timeout: 20_000,
    });

    /* --- 4. Accettare la porta in agenda, marcata come evento ---------- */
    /* Il modulo resta aperto dopo il salvataggio, ed e voluto: chi ha appena
       scritto il preventivo spesso accetta subito, e richiudere e riaprire
       sarebbero due clic per niente. */
    const dopo = page.locator("li").filter({ hasText: nome });
    await dopo.getByRole("button", { name: /Accetta e metti in agenda/ }).click();

    /*
      La riga **esce dalla coda**: questa pagina mostra il lavoro da fare, non
      un archivio. Quindi la conferma non puo stare nella riga — sta al posto
      suo, con il link alla prenotazione. Una riga che svanisce senza dire
      niente lascia chi ha premuto a chiedersi se ha funzionato, e a premere di
      nuovo.
    */
    await expect(page.getByRole("status")).toContainText("accettata", { timeout: 20_000 });
    await expect(page.getByRole("status")).toContainText("40 persone in agenda");
    await expect(page.getByRole("link", { name: "Apri la prenotazione" })).toBeVisible();
    await expect(page.locator("li").filter({ hasText: nome })).toHaveCount(0);

    /* E chiedendo anche le chiuse, la trattativa c'e con il suo stato. */
    await page.goto("/eventi?tutte=1");
    await expect(
      page.locator("li").filter({ hasText: nome }).getByText("Accettata"),
    ).toBeVisible({ timeout: 20_000 });

    const prenotazione = await db.booking.findFirstOrThrow({
      where: { venueId: locale.id, isGroup: true, partySize: 40 },
      select: {
        partySize: true,
        isGroup: true,
        eventType: true,
        budgetCents: true,
        internalNotes: true,
        startsAt: true,
      },
    });
    /* I tre campi che stavano nello schema e non scriveva nessuno. */
    expect(prenotazione.isGroup).toBe(true);
    expect(prenotazione.eventType).toBe("laurea");
    expect(prenotazione.budgetCents).toBe(180_000);
    /* Il menu concordato sta nelle note interne: è un accordo col locale, non
       una richiesta da leggere in sala insieme alle allergie. */
    expect(prenotazione.internalNotes).toContain("due primi");
    expect(prenotazione.startsAt.toISOString()).toBe("2026-12-12T19:30:00.000Z");
  } finally {
    const richieste = await db.eventRequest.findMany({
      where: { venueId: locale.id, nome },
      select: { bookingId: true },
    });
    await db.eventRequest.deleteMany({ where: { venueId: locale.id, nome } });
    for (const r of richieste) {
      if (r.bookingId) await db.booking.delete({ where: { id: r.bookingId } }).catch(() => undefined);
    }
    await db.notification.deleteMany({ where: { venueId: locale.id, kind: "EVENT_REQUEST" } });
    await db.guest.deleteMany({ where: { venueId: locale.id, firstName: nome } });
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
