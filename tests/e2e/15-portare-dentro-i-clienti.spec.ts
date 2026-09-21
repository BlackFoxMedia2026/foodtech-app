import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { unico } from "./aiuti";

/**
 * Dal file del gestionale di prima alla rubrica.
 *
 * È la porta d'ingresso del prodotto: Quandoo spegne tutto il 31 dicembre 2026
 * e lascia circa seimila ristoranti italiani senza sistema, con i dati da
 * esportare a mano. Chi cambia gestionale si porta via **i clienti**, che sono
 * l'unica cosa che non si ricompra.
 *
 * Quello che un test di unità non mette in fila e questo sì: che il file si
 * carichi da una schermata vera, che **l'anteprima non scriva niente**, che
 * la tabellina mostri le date come le abbiamo lette — l'unico posto dove un
 * ristoratore può accorgersi che sono al contrario — e che solo il secondo
 * gesto porti dentro le righe.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("il file si carica, l'anteprima non scrive, l'importazione sì", async ({ page }) => {
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });

  const nome = unico("Importato");
  /* Numero inventato, e diverso a ogni giro: nessun numero vero nel codice, e
     due esecuzioni non si scontrano sulla stessa rubrica. */
  const numero = `33390${String(Date.now()).slice(-5)}`;
  const csv = [
    "Nome;Cognome;Telefono;Data;Ora;PAX;Note;Tavolo",
    `${nome};DaCsv;${numero};25/12/2026;20:30;4;Niente pesce;12`,
  ].join("\n");

  try {
    await page.goto("/settings/importa");
    await expect(page.getByRole("heading", { name: /Importa da un altro gestionale/ })).toBeVisible({
      timeout: 30_000,
    });

    /* --- 1. Si carica il file ------------------------------------------ */
    await page.setInputFiles('input[type="file"]', {
      name: "clienti.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });

    /* --- 2. L'anteprima dice cosa succederebbe ------------------------- */
    await expect(page.getByText("Come abbiamo letto le prime righe")).toBeVisible({
      timeout: 20_000,
    });
    /* La data **nell'ora del locale**: se qui comparisse 19:30 vorrebbe dire
       che stiamo leggendo col fuso del server, e duemila prenotazioni
       finirebbero all'ora sbagliata. */
    await expect(page.getByRole("cell", { name: /25\/12\/2026, 20:30/ })).toBeVisible();
    /* La colonna che non abbiamo capito si dice, non si nasconde. */
    await expect(page.getByText(/Colonne che non abbiamo usato/)).toContainText("Tavolo");

    /* E nel database non è entrato niente: è metà del valore di questa
       funzione. */
    expect(await db.guest.count({ where: { venueId: locale.id, lastName: "DaCsv" } })).toBe(0);

    /* --- 3. Solo il secondo gesto scrive ------------------------------- */
    await page.getByRole("button", { name: "Importa" }).click();
    await expect(page.getByText(/^Fatto:/)).toBeVisible({ timeout: 30_000 });

    const ospite = await db.guest.findFirstOrThrow({
      where: { venueId: locale.id, lastName: "DaCsv" },
      select: { id: true, firstName: true },
    });
    expect(ospite.firstName).toBe(nome);

    const prenotazione = await db.booking.findFirstOrThrow({
      where: { venueId: locale.id, guestId: ospite.id },
      select: { source: true, partySize: true, startsAt: true, notes: true },
    });
    expect(prenotazione.source).toBe("IMPORT");
    expect(prenotazione.partySize).toBe(4);
    expect(prenotazione.notes).toBe("Niente pesce");
    /* 25 dicembre, ora solare: le 20:30 a Roma sono le 19:30 UTC. */
    expect(prenotazione.startsAt.toISOString()).toBe("2026-12-25T19:30:00.000Z");

    /* --- 4. Il cliente si trova nella rubrica -------------------------- */
    /* La ricerca della rubrica passa dall'indirizzo (`?q=`): e la stessa cosa
       che fa il campo di ricerca premendo invio, e non dipende da quanti
       millisecondi aspetta il campo prima di cercare. */
    await page.goto(`/guests?q=${encodeURIComponent(nome)}`);
    /*
      La riga della tabella, non «il primo testo che combacia».

      L'elenco degli ospiti e doppio: una tabella per lo schermo grande e una
      lista per il telefono (`md:hidden`). Cercando il testo, la prima
      corrispondenza puo essere quella della lista **nascosta** dal CSS, e
      `toBeVisible` aspetta per sempre una cosa che c'e e non si vede. Il ruolo
      `row` porta a quella vera.
    */
    await expect(page.getByRole("row", { name: new RegExp(`${nome}.*DaCsv`) })).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    const ospiti = await db.guest.findMany({
      where: { venueId: locale.id, lastName: "DaCsv" },
      select: { id: true },
    });
    const ids = ospiti.map((g) => g.id);
    await db.booking.deleteMany({ where: { guestId: { in: ids } } });
    await db.guest.deleteMany({ where: { id: { in: ids } } });
    await db.auditLog.deleteMany({ where: { action: "venue.import", venueId: locale.id } });
  }
});
