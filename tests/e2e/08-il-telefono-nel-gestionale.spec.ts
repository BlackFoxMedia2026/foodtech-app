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
  await page.goto("/settings?sez=centralino");

  const titolo = page.getByRole("heading", {
    name: "Il collegamento",
    exact: true,
  });
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
     «integrazione»: per il ristoratore è il suo telefono.

     Stanno in un gruppo loro, «Cosa è acceso»: dal 18 settembre il centralino
     è una sezione delle Impostazioni e non una riga dentro «Sistema». */
  const acceso = page
    .getByRole("heading", { name: "Cosa è acceso", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(
    acceso.getByText("Chi sta chiamando", { exact: true }),
  ).toBeVisible();
  await expect(acceso.getByText(/mostra chi sta chiamando/)).toBeVisible();
  await expect(
    acceso.getByText("Prenotazioni al telefono", { exact: true }),
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
  /* E il passo resta da fare: una chiave rifiutata non deve spuntare niente.
     Il conto dipende dalla strada scelta al primo passo — cinque con la
     scatoletta, sei con la deviazione — quindi si guarda il numero del passo
     e non il totale. */
  await expect(page.getByText(/Passo 1 di [56]/)).toBeVisible();
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

    /* La prima domanda è **come arrivano le telefonate**, e viene prima di
       tutto: le due strade chiedono gesti diversi — una scatoletta da
       attaccare alla linea, oppure una deviazione da farsi impostare
       dall'operatore telefonico — e partire da quella sbagliata manda a fare
       lavoro per niente. */
    await expect(page.getByText(/Passo 1 di [56]/)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Dimmi come ti arrivano le telefonate"),
    ).toBeVisible();

    /* Il cellulare: l'unica strada possibile quando il locale non ha un fisso,
       perché a una SIM non si attacca nessuna scatoletta. Compare un passo in
       più — quello dell'operatore — e il totale lo dice. */
    await page.getByRole("button", { name: /Un cellulare/ }).click();
    await expect(page.getByText("1 di 6 fatti")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Chiedi la deviazione al tuo operatore"),
    ).toBeVisible();
    /* E i codici da comporre sulla SIM **non ci sono**, finché non li abbiamo
       provati con una SIM di quell'operatore: un codice sbagliato non fa
       perdere le nostre telefonate, fa perdere le sue. */
    await expect(page.getByText(/non abbiamo provato/)).toBeVisible();

    /* Il fisso: il passo dell'operatore sparisce, e il conto torna a cinque.
       Senza questa riga, un passo aggiunto e mai più togliuto passerebbe. */
    await page.getByRole("button", { name: /Un telefono fisso/ }).click();
    await expect(page.getByText("1 di 5 fatti")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText("Chiedi la deviazione al tuo operatore"),
    ).toHaveCount(0);

    // Il codice del locale, da mandare a chi emette la chiave.
    await expect(page.getByText(locale.id)).toBeVisible();
    /* La chiave di collegamento non si può emettere prima della licenza, e lo
       dice invece di far premere un pulsante che risponde con un errore. */
    await expect(page.getByText(/Prima serve la chiave/)).toBeVisible();

    // Si incolla la chiave vera, firmata come per un cliente.
    await page
      .getByLabel(/La chiave/)
      .fill(licenzaDiProva(locale.id, "Locale di prova"));
    await page.getByRole("button", { name: "Attiva" }).click();

    /* E il passo si spunta **da sé**, perché lo stato viene dai dati: tre
       passi fatti su cinque, senza che nessuno abbia dichiarato niente. */
    await expect(page.getByText("3 di 5 fatti")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Passo 4 di 5")).toBeVisible();
    await expect(page.getByText(/Prima serve la chiave/)).toHaveCount(0);
  } finally {
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.voiceConfiguration.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});

test("il microfono si concede dalla procedura, non da un menu di Chrome", async ({
  page,
  context,
}) => {
  /**
   * Il difetto, trovato usandolo: il telefono chiedeva il microfono **al
   * caricamento della pagina**. Da quando sta nel guscio quella richiesta
   * parte su ogni schermata senza che nessuno abbia toccato niente, Chrome la
   * blocca in silenzio, e resta la riga «manca il permesso» **senza niente da
   * premere**: l'unica strada erano le impostazioni del browser, dove un
   * ristoratore non va.
   *
   * Qui si verifica che il permesso si possa concedere **dalla procedura**, e
   * che quando è concesso la riga lo dica.
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
      phoneSipServer: "wss://esempio.invalido:8089/ws",
      phoneSipUser: "wrtc-prova",
      phoneSipPassword: "non-vera",
    },
  });

  try {
    /* Il permesso **negato**: è lo stato in cui si era trovato Luca, e quello
       in cui la vecchia riga non dava niente da fare. */
    await context.clearPermissions();
    await page.goto("/settings/telefono/collega");
    /* La parola dipende da cosa il pulsante può fare — «Consenti» quando la
       finestra comparirà, «Controlla» quando il browser dice già bloccato — e
       in un browser di prova, senza un microfono vero, lo stato è il secondo.
       Quello che questa prova difende è che **ci sia qualcosa da premere**,
       non quale parola ci sia scritta. */
    await expect(
      page.getByRole("button", { name: /Consenti il microfono|Controlla il microfono/ }),
    ).toBeVisible({ timeout: 30_000 });

    /* Concesso: la riga cambia da sé — `permissions.query` avvisa senza
       ricaricare, che è la differenza fra «riprova» e «ricarica la pagina». */
    await context.grantPermissions(["microphone"]);
    await expect(page.getByText("Microfono consentito")).toBeVisible({
      timeout: 15_000,
    });
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

test("col microfono bloccato, premere il pulsante dice cosa fare", async ({
  page,
  context,
}) => {
  /**
   * Il difetto, premuto tre volte in due giorni: «clicco il pulsante per
   * attivarlo ma niente».
   *
   * Era vero alla lettera. Quando il browser ha **già bloccato** un sito,
   * `getUserMedia` rifiuta senza far comparire nessuna finestra: da dentro la
   * pagina non c'è modo di riaprirla. E il clic non cambiava nemmeno una
   * parola sullo schermo, perché lo stato era già «bloccato» e l'indicatore
   * copriva la risposta del tentativo.
   *
   * Il pulsante però **non va togliuto**: `permissions.query` risponde
   * «bloccato» anche dove manca il microfono, e le due cose portano a gesti
   * opposti. Un clic le distingue, ed è l'unico modo. Quindi il pulsante resta
   * e cambia mestiere: non promette di sbloccare, **risponde**.
   *
   * Perché non era stato preso da nessun test: `clearPermissions()` di
   * Playwright mette il permesso su **«da chiedere»**, non su «bloccato» — lo
   * stato che funziona, non quello rotto. Qui il browser viene fatto rispondere
   * come risponde a un sito bloccato, che è l'unico modo di provarlo.
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
      phoneSipServer: "wss://esempio.invalido:8089/ws",
      phoneSipUser: "wrtc-prova",
      phoneSipPassword: "non-vera",
    },
  });

  try {
    await context.addInitScript(() => {
      /* Un sito bloccato in Chrome: lo stato dice «denied» e la richiesta
         viene rifiutata **senza** finestra. */
      Object.defineProperty(navigator, "permissions", {
        configurable: true,
        value: {
          query: async () => ({ state: "denied", onchange: null }),
        },
      });
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => {
            throw new DOMException("Permission denied", "NotAllowedError");
          },
        },
      });
    });

    await page.goto("/service");

    // Il pannello si fa vedere da fermo: è l'unico guasto che rompe la
    // risposta prima che il telefono squilli.
    await expect(page.getByText("Microfono spento")).toBeVisible({ timeout: 30_000 });

    /* Le strade che esistono davvero, e sono **due**: su Mac il permesso del
       sito e quello di sistema sono due interruttori diversi, e mandare a
       girare solo il primo lascia chi ha il secondo spento a girarlo per
       niente. */
    await expect(page.getByText(/icona a sinistra dell'indirizzo/)).toBeVisible();
    await expect(page.getByText(/Privacy e sicurezza/)).toBeVisible();

    /* E la riga che conta: **premere dice qualcosa**.

       È il difetto vero. Prima il clic non cambiava nemmeno una parola sullo
       schermo, perché lo stato era già «bloccato» e l'indicatore copriva la
       risposta del tentativo. Senza questa asserzione, un pulsante che non
       risponde tornerebbe a passare. */
    await page.getByRole("button", { name: /Controlla il microfono/ }).click();
    await expect(page.getByText(/ha detto no senza chiedere/)).toBeVisible({
      timeout: 15_000,
    });
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
