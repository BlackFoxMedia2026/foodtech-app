import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { emettiApiToken } from "../../src/server/api-token";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * Il telefono squilla e chi risponde sa chi è.
 *
 * È la prova che nessun test di unità può dare: il centralino chiama Tavolo da
 * fuori, e la persona che sta in sala deve vedere il nome comparire sul suo
 * schermo senza toccare niente. In mezzo ci sono tre cose che possono cedere
 * separatamente — la licenza, il token, e la sonda che accorge la schermata —
 * e solo insieme fanno il prodotto.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("il centralino annuncia una chiamata e il nome compare in sala", async ({
  page,
  request,
}) => {
  const locale = await db.venue.findFirstOrThrow({
    where: { slug: E2E.venueSlug },
    select: { id: true },
  });

  /* Il telefono si accende con una licenza firmata, come per un cliente vero:
     non c'è una scorciatoia «in prova» — se ci fosse, questa prova non
     verificherebbe la strada che percorrono i clienti. */
  await db.venue.update({
    where: { id: locale.id },
    data: {
      phoneLicenseKey: licenzaDiProva(locale.id, "Locale di prova"),
      phoneLicenseActivatedAt: new Date(),
    },
  });

  const nome = unico("Chiamante");
  const numero = "3478812233";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "Aspetta",
      phone: numero,
      allergies: "Arachidi",
      noShowCount: 2,
    },
  });

  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (percorso)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });

  try {
    /* --- 1. La sala è aperta e non squilla niente ----------------------- */
    await page.goto("/service");
    await expect(page.getByText(/In sala|IN ARRIVO/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(nome)).toHaveCount(0);

    /* --- 2. Il centralino dice che sta squillando ----------------------- */
    const chiamata = unico("call");
    const risposta = await request.post("/api/v1/telefonia/chiamata", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { id: chiamata, phone: `+39${numero}`, stato: "RINGING" },
    });
    expect(risposta.ok()).toBe(true);
    // Il centralino riceve subito chi è: gli serve per il suo cruscotto, e non
    // deve fare una seconda domanda mentre il telefono squilla.
    expect((await risposta.json()).chi?.firstName).toBe(nome);

    /* --- 3. In sala compare, da sé -------------------------------------- */
    /* Nessun ricaricamento: la schermata chiede al server ogni cinque secondi
       «è cambiato qualcosa?». Se le chiamate non fossero in quel segnale, il
       riquadro comparirebbe solo quando si muove qualcos'altro in sala — cioè,
       in un locale tranquillo, mai. */
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sta chiamando/)).toBeVisible();

    // E le due cose per cui il riquadro esiste.
    await expect(page.getByText(/Allergie: Arachidi/)).toBeVisible();
    await expect(page.getByText(/2 volte non si è presentato/)).toBeVisible();

    /* --- 4. La chiamata finisce e il riquadro va via -------------------- */
    const fine = await request.post("/api/v1/telefonia/chiamata", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { id: chiamata, stato: "ENDED" },
    });
    expect(fine.ok()).toBe(true);

    /* Il riquadro non deve restare: un telefono che sembra squillare mentre il
       locale è silenzioso è peggio di nessun riquadro. */
    await expect(page.getByText(/sta chiamando/)).toBeHidden({
      timeout: 30_000,
    });
  } finally {
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("il simulatore fa squillare il telefono senza una linea telefonica", async ({
  page,
  request,
}) => {
  /* Il brief lo chiede (§92) e ha ragione: l'alternativa è costruire
     l'interfaccia a occhi chiusi, o metterci un pulsante che **finge** una
     telefonata. Questo non finge niente — scrive una chiamata vera nella
     tabella vera, che percorre la stessa strada di una del centralino.

     Il controllo «solo in sviluppo» sta nel codice e non in una variabile
     d'ambiente: una variabile la si accende per provare e la si dimentica
     accesa, e allora esiste un indirizzo che inventa telefonate a un cliente
     vero. In produzione questa rotta risponde 404. */
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

  const nome = unico("Simulato");
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "DalSimulatore",
      phone: "3491234567",
    },
  });

  try {
    await page.goto("/service");
    await expect(page.getByText(nome)).toHaveCount(0);

    /* Scenario «ospite noto»: il simulatore prende un ospite **vero** del
       locale col suo numero. Una prova con un numero inventato non
       verificherebbe il riconoscimento, verificherebbe che non trova niente. */
    const r = await request.post("/api/dev/voice/simula", {
      data: { scenario: "OSPITE_NOTO", phone: "+393491234567" },
    });
    expect(r.ok()).toBe(true);
    const corpo = await r.json();
    expect(corpo.simulata).toBe(true);
    expect(corpo.chi?.firstName).toBe(nome);

    // E in sala compare, da sé, come per una chiamata vera.
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sta chiamando/)).toBeVisible();

    // La chiamata ha lasciato il suo evento: la riga dice com'è, l'evento cos'è successo.
    const chiamata = await db.phoneCall.findFirstOrThrow({
      where: { venueId: locale.id, guestId: ospite.id },
      select: { id: true },
    });
    const eventi = await db.phoneCallEvent.findMany({
      where: { callId: chiamata.id },
    });
    expect(eventi.map((e) => e.kind)).toContain("CALL_RECEIVED");
  } finally {
    await db.phoneCallEvent.deleteMany({
      where: { call: { venueId: locale.id } },
    });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id } });
    await db.guest.delete({ where: { id: ospite.id } }).catch(() => {});
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("il telefono squilla anche per chi non sta guardando la sala", async ({
  page,
  request,
}) => {
  /**
   * Questa è la prova della fase 3, ed è la sola che conta davvero.
   *
   * Prima il riquadro della chiamata viveva **dentro Servizio**: chi stava
   * guardando la carta, le impostazioni o la scheda di un cliente non vedeva
   * squillare niente. Una telefonata dura venti secondi e non aspetta che
   * qualcuno cambi pagina. I due test qui sopra passavano comunque, perché
   * stanno entrambi su `/service` — cioè non potevano diventare rossi per
   * questo difetto.
   *
   * Qui si sta sulla **Carta**, che col telefono non ha niente a che fare, e si
   * pretende lo stesso riquadro.
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

  const nome = unico("Altrove");
  const numero = "3478844551";
  const ospite = await db.guest.create({
    data: {
      venueId: locale.id,
      firstName: nome,
      lastName: "InCarta",
      phone: numero,
    },
  });

  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (fuori dalla sala)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });

  try {
    /* --- 1. Si sta sulla Carta, non in sala ----------------------------- */
    await page.goto("/menu");
    await expect(page.getByText(nome)).toHaveCount(0);

    /* --- 2. Squilla ------------------------------------------------------ */
    const chiamata = unico("call");
    const risposta = await request.post("/api/v1/telefonia/chiamata", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { id: chiamata, phone: `+39${numero}`, stato: "RINGING" },
    });
    expect(risposta.ok()).toBe(true);

    /* --- 3. Il riquadro compare qui, senza cambiare pagina --------------- */
    await expect(page.getByText(nome).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/sta chiamando/)).toBeVisible();
    // E la testata lo dice, per chi in quel momento stava guardando altro.
    await expect(
      page.getByRole("button", { name: /Telefono: una chiamata in corso/ }),
    ).toBeVisible();

    /* --- 4. «Nascondi» nasconde, e non riattacca ------------------------- */
    /* Il riquadro deve potersi togliere di mezzo — c'è chi risponde dal
       telefono fisso e vuole continuare a lavorare. Ma non deve **tornare** al
       giro di sonda dopo cinque secondi, perché per il server la chiamata è
       ancora viva: un riquadro che ricompare dopo che lo hai chiuso è la cosa
       che fa smettere di usare una funzione. */
    await page
      .getByRole("button", { name: /^Nascondi questo riquadro/ })
      .click();
    await expect(page.getByText(/sta chiamando/)).toBeHidden();
    // Oltre un giro di sonda: se tornasse, tornerebbe qui.
    await page.waitForTimeout(8_000);
    await expect(page.getByText(/sta chiamando/)).toBeHidden();
    // La chiamata però è ancora in corso, e la testata continua a dirlo.
    await expect(
      page.getByRole("button", { name: /Telefono: una chiamata in corso/ }),
    ).toBeVisible();
  } finally {
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

test("Tavolo non risponde alle telefonate: nessun telefono nel guscio", async ({ page }) => {
  /**
   * La decisione di prodotto, e **è cambiata**: Tavolo governa i dati, non
   * risponde. Risponde il cellulare del locale; se non risponde o è occupato,
   * la telefonata la prende il risponditore del centralino.
   *
   * Rispondere dal browser era costruito e funzionante — WebRTC, permesso del
   * microfono, pannello su ogni schermata — e **non è stato cancellato**: sta
   * dietro `RISPONDE_DAL_BROWSER` in `src/lib/rispondere-da-tavolo.ts`, spento
   * da un punto solo. Il modello è cambiato tre volte in due giorni, e
   * cancellare una cosa che funziona sarebbe stato l'errore caro.
   *
   * Questa prova verifica il prodotto **come viene pubblicato**: con
   * l'interruttore spento non si monta nessun telefono, su nessuna pagina,
   * anche quando i dati SIP nel database ci sono. Il giorno che qualcuno
   * riaccende quella costante, questa prova diventa rossa — ed è giusto:
   * riaccendere una funzione va deciso, non scoperto.
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
      /* I dati SIP **ci sono**: è la parte che conta. Prima bastavano loro a
         far comparire il telefono, e adesso non bastano più. */
      phoneSipServer: "wss://esempio.invalido:7443/ws",
      phoneSipUser: "interno-99",
      phoneSipPassword: "prova-non-vera",
    },
  });

  try {
    for (const dove of ["/service", "/menu", "/telefono"]) {
      await page.goto(dove);
      /* L'elemento audio nascosto **è** il telefono montato: zero significa
         che non c'è, e con lui non c'è la richiesta del microfono. */
      await expect(page.locator("audio")).toHaveCount(0, { timeout: 30_000 });
    }

    // E niente riga che dica dove si risponde: non si risponde da qui.
    await expect(page.getByText(/qualunque pagina/)).toHaveCount(0);
  } finally {
    await db.venue.update({
      where: { id: locale.id },
      data: {
        phoneLicenseKey: null,
        phoneLicenseActivatedAt: null,
        phoneSipServer: null,
        phoneSipUser: null,
        phoneSipPassword: null,
      },
    });
  }
});
