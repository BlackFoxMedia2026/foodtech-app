import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { emettiApiToken } from "../../src/server/api-token";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * Dalla chiamata persa alla richiamata chiusa.
 *
 * È il giro per cui il telefono sta dentro un gestionale e non accanto: una
 * persona chiama, non trova nessuno, e qualcuno **se ne occupa**. Tre cose
 * che nessun test di unità mette in fila: che la chiamata persa compaia nel
 * «Da fare» senza filtri da premere, che il gesto la sposti in coda, e che
 * chiuderla la faccia sparire — perché una coda che non si svuota si smette
 * di guardare.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("una chiamata persa diventa una richiamata, e la richiamata si chiude", async ({
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

  const nome = unico("Perso");
  const numero = "3478877991";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "DaRichiamare",
      phone: numero,
    },
  });

  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (persa)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });

  try {
    /* --- 1. Squilla e nessuno risponde --------------------------------- */
    const chiamata = unico("call");
    for (const stato of ["RINGING", "MISSED"]) {
      const r = await request.post("/api/v1/telefonia/chiamata", {
        headers: { authorization: `Bearer ${token.token}` },
        data: { id: chiamata, phone: `+39${numero}`, stato },
      });
      expect(r.ok()).toBe(true);
    }

    /* --- 2. Nel «Da fare», senza premere niente ------------------------ */
    await page.goto("/telefono");
    const daFare = page
      .getByRole("region", { name: "Da fare" })
      .or(
        page
          .locator("section")
          .filter({ has: page.getByRole("heading", { name: "Da fare" }) }),
      );
    await expect(daFare.getByText(nome)).toBeVisible({ timeout: 30_000 });
    await expect(daFare.getByText(/nessuno ha risposto/)).toBeVisible();

    /* --- 3. Il gesto: la metto in coda ---------------------------------- */
    await daFare.getByRole("button", { name: "Da richiamare" }).first().click();
    /* Cambia lista: da «nessuno ha deciso» a «c'è un impegno preso». Le due
       liste sono diverse di proposito — la prima si svuota decidendo, la
       seconda lavorando — e la riga non deve stare in entrambe. */
    await expect(daFare.getByText(/in coda da/)).toBeVisible({
      timeout: 15_000,
    });

    const inCoda = await db.voiceCallback.findFirstOrThrow({
      where: { venueId: locale.id, stato: "OPEN" },
      select: { id: true, numero: true },
    });
    // Il numero va in coda **normalizzato**, o non lo si ritrova più.
    expect(inCoda.numero).toBe(`+39${numero}`);

    /* --- 4. Ho provato: resta in coda, e si vede che ho provato --------- */
    await daFare.getByRole("button", { name: "Non risponde" }).first().click();
    await expect(daFare.getByText(/un tentativo/)).toBeVisible({
      timeout: 15_000,
    });

    /* --- 5. Fatta: la coda si svuota ----------------------------------- */
    await daFare.getByRole("button", { name: "Fatta" }).first().click();
    await expect(daFare.getByText(/Nessuno da richiamare/)).toBeVisible({
      timeout: 15_000,
    });
    expect(
      await db.voiceCallback.count({
        where: { venueId: locale.id, stato: "OPEN" },
      }),
    ).toBe(0);
  } finally {
    await db.voiceCallback.deleteMany({ where: { venueId: locale.id } });
    await db.phoneCallEvent.deleteMany({
      where: { call: { venueId: locale.id } },
    });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("una chiamata a cui si è risposto chiede com'è finita, e lo ricorda", async ({
  page,
  request,
}) => {
  /* Lo storico serve a una domanda sola: quante telefonate diventano
     prenotazioni. Una riga «risposta · 2m 14s» non risponde, e finché
     l'esito non si può scrivere da una schermata quella domanda non ha
     risposta per nessun locale. */
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

  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (esito)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });
  const chiamata = unico("call");

  try {
    for (const stato of ["RINGING", "ANSWERED", "ENDED"]) {
      const r = await request.post("/api/v1/telefonia/chiamata", {
        headers: { authorization: `Bearer ${token.token}` },
        data: { id: chiamata, phone: "+393478877992", stato },
      });
      expect(r.ok()).toBe(true);
    }

    await page.goto("/telefono");
    const storico = page.getByRole("region", { name: "Storico" });

    await storico
      .getByRole("button", { name: /Com'è finita/ })
      .first()
      .click();
    await storico
      .getByRole("button", { name: "Voleva un'informazione" })
      .click();

    /*
      L'attesa giusta, e la prima che avevo scritto era sbagliata.

      Cercavo il testo «Voleva un'informazione» — che è anche l'etichetta del
      pulsante appena premuto: la prova passava nell'istante del clic, senza
      che il server avesse risposto, e poi la lettura del database trovava
      `null`. Un verde che non poteva diventare rosso.

      Qui si aspetta che i **pulsanti** della scelta non ci siano più: è lo
      stato che cambia solo dopo il salvataggio, e solo allora si può leggere
      il bollino.
    */
    await expect(
      storico.getByRole("button", { name: "Voleva un'informazione" }),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      storico.getByText("Voleva un'informazione").first(),
    ).toBeVisible();

    const riga = await db.phoneCall.findFirstOrThrow({
      where: { venueId: locale.id, externalId: chiamata },
      select: { outcome: true, handler: true },
    });
    expect(riga.outcome).toBe("INFORMATION");
    expect(riga.handler).toBe("HUMAN");
  } finally {
    await db.phoneCallEvent.deleteMany({
      where: { call: { venueId: locale.id } },
    });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("la chiamata persa mentre nessuno guardava finisce nella campanella", async ({
  page,
  request,
}) => {
  /**
   * Il caso che nessuna schermata copre.
   *
   * Il bollino in testata e la colonna «Da fare» mostrano le chiamate perse
   * **solo mentre qualcuno ha Tavolo aperto davanti**. Il telefono di un
   * ristorante squilla alle quattro del pomeriggio, con la saracinesca giù:
   * chi arriva alle sei non ha nessun posto dove leggere che è successo, e il
   * bollino non dice né chi né quando.
   *
   * Questo percorso passa dal cron vero — la stessa strada che Vercel chiama
   * ogni minuto — e finisce sulla campanella vera.
   */
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

  const nome = unico("Nessuno");
  const numero = "3478877993";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "InSala",
      phone: numero,
    },
  });

  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (campanella)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });
  const chiamata = unico("call");

  try {
    /* --- 1. Squilla e nessuno risponde, venti minuti fa ---------------- */
    for (const stato of ["RINGING", "MISSED"]) {
      const r = await request.post("/api/v1/telefonia/chiamata", {
        headers: { authorization: `Bearer ${token.token}` },
        data: { id: chiamata, phone: `+39${numero}`, stato },
      });
      expect(r.ok()).toBe(true);
    }
    /* L'ora si sposta indietro nel database e non si aspettano dieci minuti
       veri: la grazia è una regola del prodotto, non una cosa da provare col
       cronometro. */
    const riga = await db.phoneCall.findFirstOrThrow({
      where: { venueId: locale.id, externalId: chiamata },
      select: { id: true },
    });
    const ventiMinuti = new Date(Date.now() - 20 * 60 * 1000);
    await db.phoneCall.update({
      where: { id: riga.id },
      data: { startedAt: ventiMinuti, endedAt: ventiMinuti },
    });

    /* --- 2. Il cron vero, con il suo segreto ---------------------------- */
    const cron = await request.get("/api/cron/jobs", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(cron.ok()).toBe(true);

    /* --- 3. È nella campanella, con nome e ora -------------------------- */
    await page.goto("/overview");
    await page
      .getByRole("button", { name: /Notifiche|notifiche/ })
      .first()
      .click();
    await expect(
      page.getByText(new RegExp(`${nome}.*ha chiamato alle \\d{2}:\\d{2}`)),
    ).toBeVisible({
      timeout: 15_000,
    });

    const notifica = await db.notification.findFirstOrThrow({
      where: { venueId: locale.id, kind: "MISSED_CALL" },
      select: { readAt: true, link: true },
    });
    expect(notifica.readAt).toBeNull();
    expect(notifica.link).toBe("/telefono");
  } finally {
    await db.notification.deleteMany({
      where: { venueId: locale.id, kind: "MISSED_CALL" },
    });
    await db.voiceCallback.deleteMany({ where: { venueId: locale.id } });
    await db.phoneCallEvent.deleteMany({
      where: { call: { venueId: locale.id } },
    });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("la prenotazione nata da una telefonata racconta da dove viene", async ({
  page,
  request,
}) => {
  /**
   * L'ultimo pezzo del giro, ed è quello che si legge tre settimane dopo.
   *
   * Davanti a un cliente al telefono le domande sono sempre le stesse: «chi
   * l'ha spostata?», «la conferma è partita?», «l'avevamo presa noi?». Le
   * risposte erano nel database da mesi — nel registro delle azioni, nei
   * messaggi, nella telefonata collegata — e nessuna schermata le metteva in
   * fila.
   */
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

  const nome = unico("Storia");
  const numero = "3478877994";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "DiCarta",
      phone: numero,
    },
  });
  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (storia)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });
  const chiamata = unico("call");
  let prenotazioneId = "";

  try {
    for (const stato of ["RINGING", "MISSED"]) {
      const r = await request.post("/api/v1/telefonia/chiamata", {
        headers: { authorization: `Bearer ${token.token}` },
        data: { id: chiamata, phone: `+39${numero}`, stato },
      });
      expect(r.ok()).toBe(true);
    }
    const riga = await db.phoneCall.findFirstOrThrow({
      where: { venueId: locale.id, externalId: chiamata },
      select: { id: true },
    });

    /* La prenotazione nasce dalla rotta vera, con la chiamata attaccata —
       esattamente il corpo che manda il modulo quando ci si arriva dal
       telefono (`?chiamata=<id>`). */
    const domani = new Date(Date.now() + 24 * 3600 * 1000);
    domani.setHours(20, 0, 0, 0);
    const creata = await request.post("/api/bookings", {
      data: {
        guest: { firstName: nome, lastName: "DiCarta", phone: numero },
        partySize: 2,
        startsAt: domani.toISOString(),
        source: "PHONE",
        chiamataId: riga.id,
      },
    });
    expect(creata.status()).toBe(201);
    prenotazioneId = ((await creata.json()) as { id: string }).id;

    /* --- La storia, sulla pagina della prenotazione --------------------- */
    await page.goto(`/bookings/${prenotazioneId}`);
    const storia = page.locator("section, div").filter({
      has: page.getByRole("heading", { name: /Cos'è successo/ }),
    });
    await expect(
      page.getByRole("heading", { name: /Cos'è successo/ }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(storia.getByText("Presa al telefono").first()).toBeVisible();
    await expect(
      storia.getByText(new RegExp(`Telefonata di ${nome}`)),
    ).toBeVisible();

    /* E la telefonata, dall'altra parte, non è più da richiamare: è una
       telefonata riuscita. */
    const dopo = await db.phoneCall.findUniqueOrThrow({
      where: { id: riga.id },
      select: { bookingId: true, outcome: true },
    });
    expect(dopo.bookingId).toBe(prenotazioneId);
    expect(dopo.outcome).toBe("BOOKING_CREATED");
  } finally {
    await db.auditLog.deleteMany({ where: { venueId: locale.id } });
    await db.voiceCallback.deleteMany({ where: { venueId: locale.id } });
    await db.phoneCallEvent.deleteMany({
      where: { call: { venueId: locale.id } },
    });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    if (prenotazioneId) {
      await db.booking.deleteMany({ where: { id: prenotazioneId } });
    }
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("nelle analitiche il telefono dice a che ora squilla e quante prenotano", async ({
  page,
}) => {
  /**
   * La domanda che nessuna schermata sapeva: **a che ora squilla il telefono,
   * e in quelle ore c'è qualcuno che risponde?** Un locale che perde tre
   * chiamate fra le 20 e le 21 non ha un problema di telefono: ha una persona
   * in meno in quella fascia.
   *
   * Il pannello vive dietro la funzione `statistiche` della licenza, e sta in
   * «Domanda e ospiti» — una telefonata è domanda che arriva da un altro
   * canale.
   */
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });

  const adesso = new Date();
  /* Tre chiamate nello stesso momento della giornata, oggi: due perse e una
     che ha prodotto una prenotazione. Con due perse nella stessa ora il
     consiglio compare — con una sola no, di proposito. */
  const quando = new Date(adesso.getTime() - 60 * 60 * 1000);

  try {
    await db.venue.update({
      where: { id: locale.id },
      data: {
        phoneLicenseKey: licenzaDiProva(locale.id, "Locale di prova"),
        phoneLicenseActivatedAt: new Date(),
      },
    });

    for (const stato of ["MISSED", "MISSED", "ENDED"] as const) {
      await db.phoneCall.create({
        data: {
          venueId: locale.id,
          externalId: unico("stat"),
          fromNumber: "+393478877995",
          status: stato,
          startedAt: quando,
          endedAt: quando,
          outcome: stato === "MISSED" ? "MISSED" : "INFORMATION",
        },
      });
    }

    await page.goto("/insights?vista=domanda&range=last7");
    await expect(
      page.getByRole("heading", { name: "Il telefono" }),
    ).toBeVisible({
      timeout: 30_000,
    });
    // I tre numeri, e la frase che ammette quello che non si sa.
    await expect(
      page.getByText(/3 chiamate negli ultimi 7 giorni/),
    ).toBeVisible();
    await expect(page.getByText(/senza risposta/).first()).toBeVisible();
    // Il consiglio sull'ora: due perse nella stessa fascia.
    await expect(page.getByText(/se ne perdono/)).toBeVisible();

    /* E senza licenza il pannello non c'è: non è una funzione che si mostra
       spenta, è una funzione che quel locale non ha comprato. */
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
    await page.goto("/insights?vista=domanda&range=last7");
    await expect(
      page.getByRole("heading", { name: "Fonti di prenotazione" }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Il telefono" }),
    ).toHaveCount(0);
  } finally {
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("la risposta al telefono si scrive una volta e si trova mentre si parla", async ({
  page,
}) => {
  /**
   * Le dieci domande di ogni sera: cani, parcheggio, glutine, orari di Pasqua.
   * La risposta la sa chi lavora da più tempo, e il ragazzo che risponde il
   * sabato sera la indovina o mette in attesa e va a chiedere in cucina.
   *
   * Questo percorso la scrive dalle impostazioni e la cerca dalla pagina del
   * telefono, che è il momento in cui serve: una persona sta aspettando in
   * linea.
   */
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

  const frase = `I cani stanno nel dehors ${unico("dh")}`;

  try {
    /* --- 1. Si scrive dalle impostazioni ------------------------------- */
    await page.goto("/settings/telefono");
    await page.getByRole("button", { name: /Aggiungi una risposta/ }).click();
    await page.getByLabel(/La risposta, come si dice a voce/).fill(frase);
    await page.getByLabel(/Le parole con cui la si cerca/).fill("cane, cani");
    await page.getByRole("button", { name: "Salva" }).click();
    await expect(page.getByText(/si trova con: cane, cani/)).toBeVisible({
      timeout: 15_000,
    });

    /* --- 2. Si trova dalla pagina del telefono, con la parola di chi chiama */
    await page.goto("/telefono");
    const riquadro = page.getByRole("region", { name: "Cosa rispondere" });
    await expect(riquadro).toBeVisible({ timeout: 30_000 });
    // Prima di cercare non mostra niente: non è un elenco, è una ricerca.
    await expect(riquadro.getByText(frase)).toHaveCount(0);

    await riquadro.getByLabel(/Cosa rispondere/).fill("cane");
    await expect(riquadro.getByText(frase)).toBeVisible();

    /* --- 3. Quello che non è scritto lo dice --------------------------- */
    await riquadro.getByLabel(/Cosa rispondere/).fill("karaoke");
    await expect(riquadro.getByText(/non è scritto/)).toBeVisible();
    await expect(riquadro.getByText(frase)).toHaveCount(0);
  } finally {
    await db.voiceKnowledgeItem.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("quello che si scopre al telefono entra nella scheda solo se qualcuno approva", async ({
  page,
  request,
}) => {
  /**
   * «Mia moglie è celiaca», detto al telefono. Prima si perdeva: per scriverlo
   * bisognava uscire dalla chiamata, cercare la scheda, aprire il campo
   * giusto.
   *
   * Qui si scrive in due tocchi e **non entra nella scheda** finché qualcuno
   * non guarda. È la regola del brief resa struttura: niente si scrive nel
   * profilo di un ospite senza approvazione umana.
   */
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

  const nome = unico("Celiaca");
  const numero = "3478877996";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "AlTelefono",
      phone: numero,
    },
  });
  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (insight)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });
  const chiamata = unico("call");

  try {
    for (const stato of ["RINGING", "ANSWERED", "ENDED"]) {
      const r = await request.post("/api/v1/telefonia/chiamata", {
        headers: { authorization: `Bearer ${token.token}` },
        data: { id: chiamata, phone: `+39${numero}`, stato },
      });
      expect(r.ok()).toBe(true);
    }

    /* --- 1. Si scrive dallo storico, appena riattaccato ----------------- */
    await page.goto("/telefono");
    const storico = page.getByRole("region", { name: "Storico" });
    await storico
      .getByRole("button", { name: /Nota sul cliente/ })
      .first()
      .click();
    await storico
      .getByRole("button", { name: "Allergia o intolleranza" })
      .click();
    await storico.getByRole("textbox", { name: /Allergia/ }).fill("celiaca");
    await storico.getByRole("button", { name: "Proponi" }).click();

    /* --- 2. Nella scheda non c'è niente -------------------------------- */
    await expect(
      page.getByRole("region", { name: "Da approvare" }),
    ).toBeVisible({
      timeout: 15_000,
    });
    expect(
      (
        await db.guest.findUniqueOrThrow({
          where: { id: ospite.id },
          select: { allergies: true },
        })
      ).allergies,
    ).toBeNull();

    /* --- 3. Approvata, entra ------------------------------------------- */
    const daApprovare = page.getByRole("region", { name: "Da approvare" });
    await expect(daApprovare.getByText(/Andrà fra le allergie/)).toBeVisible();
    await daApprovare.getByRole("button", { name: "Approva" }).click();
    await expect(
      page.getByRole("region", { name: "Da approvare" }),
    ).toHaveCount(0, {
      timeout: 15_000,
    });

    const dopo = await db.guest.findUniqueOrThrow({
      where: { id: ospite.id },
      select: { allergies: true },
    });
    expect(dopo.allergies).toBe("celiaca");
  } finally {
    await db.voiceCRMInsight.deleteMany({ where: { venueId: locale.id } });
    await db.phoneCallEvent.deleteMany({
      where: { call: { venueId: locale.id } },
    });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
