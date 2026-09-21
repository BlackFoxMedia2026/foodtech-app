import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { emettiApiToken } from "../../src/server/api-token";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * Disdire al telefono, dal centralino fino alla sala.
 *
 * È la telefonata che vale più di tutte, e non perché sia difficile: chi prova
 * a disdire e non riesce **diventa un no-show**. Il tavolo resta apparecchiato,
 * nessuno lo rivende, e il locale dà la colpa al cliente che invece aveva
 * chiamato per avvisare.
 *
 * Quello che un test di unità non mette in fila e questo sì: che il centralino
 * con il suo token trovi la prenotazione giusta, che la disdetta arrivi nel
 * database, che **la sala se ne accorga** senza andare a cercarla, e che la
 * seconda telefonata non disdica due volte.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

/* Numeri inventati: nessun numero vero entra nel codice. In scheda sta scritto
   come lo scrive l'operatore, il centralino lo manda in forma internazionale —
   è così che succede, e le due forme devono coincidere. */
const IN_SCHEDA = "347 8877995";
const CHIAMA = "+393478877995";

async function localeConLicenza() {
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
  return locale.id;
}

test("chi chiama disdice la sua cena, e la sala lo vede", async ({ page, request }) => {
  const venueId = await localeConLicenza();
  const nome = unico("Disdice");

  const ospite = await db.guest.create({
    data: { venueId, firstName: nome, lastName: "AlTelefono", phone: IN_SCHEDA },
  });
  // Stasera fra due ore: è la disdetta che libera un tavolo davvero.
  const quando = new Date(Date.now() + 2 * 3_600_000);
  const prenotazione = await db.booking.create({
    data: { venueId, guestId: ospite.id, partySize: 4, startsAt: quando, status: "CONFIRMED" },
  });

  const token = await emettiApiToken(venueId, {
    nome: "Centralino (disdetta)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });
  const intestazioni = { authorization: `Bearer ${token.token}` };

  try {
    /* --- 1. «Ho una prenotazione, la disdico» --------------------------- */
    const cerca = await request.post("/api/v1/telefonia/disdetta", {
      headers: intestazioni,
      data: { phone: CHIAMA },
    });
    expect(cerca.ok()).toBe(true);
    const trovata = await cerca.json();
    /* La voce deve poter **ripetere** giorno, ora e coperti prima di disdire:
       non è cortesia, è il controllo che chi parla sappia cosa sta disdicendo. */
    expect(trovata.trovata).toBe(true);
    expect(trovata.id).toBe(prenotazione.id);
    expect(trovata.persone).toBe(4);
    expect(trovata.nome).toContain(nome);

    /* --- 2. «Sì, la disdica» ------------------------------------------- */
    const disdice = await request.post("/api/v1/telefonia/disdetta", {
      headers: intestazioni,
      data: { phone: CHIAMA, bookingId: prenotazione.id },
    });
    expect(disdice.ok()).toBe(true);
    expect((await disdice.json()).ok).toBe(true);

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: prenotazione.id } })).status,
    ).toBe("CANCELLED");

    /* --- 3. La seconda volta non disdice due volte --------------------- */
    const ancora = await request.post("/api/v1/telefonia/disdetta", {
      headers: intestazioni,
      data: { phone: CHIAMA, bookingId: prenotazione.id },
    });
    expect(ancora.status()).toBe(409);
    expect((await ancora.json()).perche).toBe("gia_disdetta");

    /* --- 4. La sala se ne accorge -------------------------------------- */
    /* Senza questo, la disdetta al telefono cambia uno stato che nessuno
       guarda: il tavolo resta apparecchiato tutta la sera, cioè il danno che
       disdire al telefono doveva evitare. */
    await page.goto("/overview");
    await page
      .getByRole("button", { name: /Notifiche|notifiche/ })
      .first()
      .click();
    await expect(
      page.getByText(new RegExp(`${nome}.*ha disdetto: 4 coperti liberi`)),
    ).toBeVisible({ timeout: 15_000 });

    const notifica = await db.notification.findFirstOrThrow({
      where: { venueId, kind: "BOOKING_CANCELLED" },
      select: { readAt: true, link: true },
    });
    expect(notifica.readAt).toBeNull();
    expect(notifica.link).toBe("/service");
  } finally {
    await db.notification.deleteMany({ where: { venueId } });
    await db.booking.deleteMany({ where: { venueId, guestId: ospite.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId } });
    await db.venue.update({
      where: { id: venueId },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("un altro numero non disdice la cena di qualcun altro", async ({ request }) => {
  const venueId = await localeConLicenza();
  const ospite = await db.guest.create({
    data: { venueId, firstName: unico("Suo"), lastName: "Tavolo", phone: "3478877996" },
  });
  const prenotazione = await db.booking.create({
    data: {
      venueId,
      guestId: ospite.id,
      partySize: 2,
      startsAt: new Date(Date.now() + 2 * 3_600_000),
      status: "CONFIRMED",
    },
  });
  const token = await emettiApiToken(venueId, {
    nome: "Centralino (estraneo)",
    ambiti: ["telefonia:write"],
  });

  try {
    const r = await request.post("/api/v1/telefonia/disdetta", {
      headers: { authorization: `Bearer ${token.token}` },
      // Un identificativo si può conoscere; la cena di un altro no.
      data: { phone: "+393478877997", bookingId: prenotazione.id },
    });
    expect(r.status()).toBe(409);
    expect((await r.json()).perche).toBe("numero_diverso");
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: prenotazione.id } })).status,
    ).toBe("CONFIRMED");
  } finally {
    await db.booking.deleteMany({ where: { venueId, guestId: ospite.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId } });
    await db.venue.update({
      where: { id: venueId },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("«mi faccia richiamare» finisce nella coda delle richiamate", async ({ request }) => {
  /* È la versione onesta del «passo a un operatore» che vendono i concorrenti:
     un operatore a cui passare non c'è — la voce risponde proprio perché in
     sala non ha risposto nessuno. Una chiamata girata a un telefono che ha già
     squillato a vuoto è una promessa vuota; la coda è una promessa che
     qualcuno mantiene. */
  const venueId = await localeConLicenza();
  const token = await emettiApiToken(venueId, {
    nome: "Centralino (richiamata)",
    ambiti: ["telefonia:write"],
  });
  const intestazioni = { authorization: `Bearer ${token.token}` };
  const numero = "+393478877998";

  try {
    const prima = await request.post("/api/v1/telefonia/richiamata", {
      headers: intestazioni,
      data: { phone: numero, nota: "Vuole parlare con una persona" },
    });
    expect(prima.status()).toBe(201);
    expect((await prima.json()).giaInCoda).toBe(false);

    // Chiede due volte: la coda deve restare una riga, o si smette di guardarla.
    const seconda = await request.post("/api/v1/telefonia/richiamata", {
      headers: intestazioni,
      data: { phone: numero },
    });
    expect(seconda.status()).toBe(201);
    expect((await seconda.json()).giaInCoda).toBe(true);
    expect(await db.voiceCallback.count({ where: { venueId, numero, stato: "OPEN" } })).toBe(1);

    /* Numero nascosto: non è un guasto, è un caso previsto — e la voce deve
       poter dire «non vedo il suo numero, me lo detta?». Può dirlo solo se la
       risposta gliel'ha detto. */
    const nascosto = await request.post("/api/v1/telefonia/richiamata", {
      headers: intestazioni,
      data: { phone: null },
    });
    expect(nascosto.status()).toBe(409);
    expect((await nascosto.json()).perche).toBe("numero_riservato");
  } finally {
    await db.voiceCallback.deleteMany({ where: { venueId } });
    await db.apiToken.deleteMany({ where: { venueId } });
    await db.venue.update({
      where: { id: venueId },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
