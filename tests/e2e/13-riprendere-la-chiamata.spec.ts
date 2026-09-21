import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { E2E } from "../../prisma/seed-e2e";
import { emettiApiToken } from "../../src/server/api-token";
import { licenzaDiProva } from "./licenza-prova";
import { unico } from "./aiuti";

/**
 * La telefonata che si interrompe a metà, e torna.
 *
 * È il punto in cui questo prodotto è più avanti del concorrente, e non per
 * poco: di quelle chiamate lui consegna al ristoratore **un elenco da
 * scaricare** — lo ha detto il suo cliente — mentre qui parte un link che
 * riapre la prenotazione **con dentro quello che la persona aveva già detto**.
 *
 * Tre cose che nessun test di unità mette in fila:
 *
 *  1. il risponditore dichiara l'interruzione e Tavolo restituisce un link;
 *  2. quel link apre una schermata **già compilata** — giorno, ora, persone —
 *     e non chiede l'email, che di chi ha telefonato non abbiamo;
 *  3. completandola nasce una prenotazione vera, attribuita al telefono, e il
 *     link non vale più.
 */

const db = new PrismaClient();

test.afterAll(async () => {
  await db.$disconnect();
});

test("dal link di recupero a una prenotazione, e il link si consuma", async ({ page, request }) => {
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

  const numero = "3330000099";
  const idChiamata = unico("interrotta");
  const token = await emettiApiToken(locale.id, {
    nome: "Centralino (recupero)",
    ambiti: ["telefonia:read", "telefonia:write"],
  });

  /* Domani alle 20:30 nel fuso del locale: si costruisce dalla data e non da
     una stringa fissa, o il test scadrebbe da solo fra un mese. */
  const domani = new Date();
  domani.setDate(domani.getDate() + 1);
  domani.setHours(20, 30, 0, 0);

  try {
    /* --- 1. La chiamata arriva, e si interrompe -------------------------- */
    const arrivo = await request.post("/api/v1/telefonia/chiamata", {
      headers: { authorization: `Bearer ${token.token}` },
      data: { id: idChiamata, phone: `+39${numero}`, stato: "ANSWERED" },
    });
    expect(arrivo.ok()).toBe(true);

    const interrotta = await request.post("/api/v1/telefonia/interrotta", {
      headers: { authorization: `Bearer ${token.token}` },
      data: {
        chiamata: idChiamata,
        numero: `+39${numero}`,
        persone: 4,
        quando: domani.toISOString(),
        passo: "conferma",
      },
    });
    expect(interrotta.ok()).toBe(true);

    const esito = (await interrotta.json()) as { link: string; invio: string };
    expect(esito.link).toContain("/riprendi/");
    /* Su questa installazione non c'è un canale per mandare messaggi, e la
       risposta **lo dice** invece di far credere che il cliente l'abbia
       ricevuto. */
    expect(esito.invio).toBe("SENZA_CANALE");

    /* --- 2. Il link apre una schermata già compilata --------------------- */
    const percorso = new URL(esito.link).pathname;
    await page.goto(percorso);

    await expect(page.getByRole("heading", { name: /Riprendiamo da dove eravamo/ })).toBeVisible({
      timeout: 30_000,
    });
    // Le persone sono quelle che aveva detto: nessuno le richiede.
    await expect(page.getByLabel("Persone")).toHaveValue("4");
    // E l'email **non** si chiede: di chi ha telefonato abbiamo il numero.
    await expect(page.getByLabel(/Email/)).toHaveCount(0);

    /* --- 3. Si completa, e diventa una prenotazione ---------------------- */
    const nome = unico("Interrotta");
    /* `exact`: senza, «Nome» prende anche «Cognome». */
    await page.getByLabel("Nome", { exact: true }).fill(nome);
    await page.getByRole("button", { name: /Completa la prenotazione/ }).click();

    await expect(page.getByRole("heading", { name: "Ci siamo" })).toBeVisible({ timeout: 30_000 });
    /* E non si dice «confermata»: le prenotazioni che arrivano da fuori le
       conferma il locale, e dire il contrario farebbe presentare qualcuno a un
       tavolo che non c'è. */
    await expect(page.getByText(/conferma appena può/)).toBeVisible();

    const prenotazione = await db.booking.findFirstOrThrow({
      where: { venueId: locale.id, guest: { firstName: nome } },
      select: { source: true, status: true, partySize: true, id: true },
    });
    expect(prenotazione.source).toBe("VOICE");
    expect(prenotazione.partySize).toBe(4);

    /* L'attribuzione del recupero sta sulla riga del recupero, e non in un
       valore nuovo fra le fonti: la fonte resta «il telefono». */
    const recupero = await db.voiceRecovery.findFirstOrThrow({
      where: { venueId: locale.id, numero: `+39${numero}` },
      select: { bookingId: true, convertitoIl: true },
    });
    expect(recupero.bookingId).toBe(prenotazione.id);
    expect(recupero.convertitoIl).not.toBeNull();

    /* --- 4. Il link non vale più ----------------------------------------- */
    await page.goto(percorso);
    await expect(page.getByRole("heading", { name: /non è più valido/ })).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await db.voiceRecovery.deleteMany({ where: { venueId: locale.id } });
    await db.booking.deleteMany({ where: { venueId: locale.id, source: "VOICE" } });
    await db.guest.deleteMany({ where: { venueId: locale.id, phone: `+39${numero}` } });
    await db.phoneCall.deleteMany({ where: { venueId: locale.id, externalId: idChiamata } });
    await db.apiToken.deleteMany({ where: { venueId: locale.id } });
    await db.venue.update({
      where: { id: locale.id },
      data: { phoneLicenseKey: null, phoneLicenseActivatedAt: null },
    });
  }
});
