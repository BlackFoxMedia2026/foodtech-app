import { test, expect } from "@playwright/test";
import { leggiVenue, oggiNelLocale, unico } from "./aiuti";

/**
 * Il percorso per cui Tavolo esiste.
 *
 * Una persona prenota dal sito, il locale la conferma, la accomoda, le batte
 * un piatto, chiude il conto — e alla fine il cliente **esiste nel CRM** con
 * la sua visita e i suoi punti.
 *
 * Ogni pezzo di questa catena ha i suoi test unitari. Nessuno di loro dice se
 * la catena tiene: è questa la cosa che nessun altro test può dire, e che
 * finora ho verificato a mano.
 */
test("dal sito al conto chiuso, e il cliente compare nel CRM coi suoi punti", async ({ page }) => {
  const { venueId } = leggiVenue();
  const nome = unico("Prova");
  const email = `${nome.toLowerCase()}@tavolo.test`;

  /* ---------------------------------------------------------------------- */
  /* 1. Il cliente prenota dal sito                                          */
  /* ---------------------------------------------------------------------- */

  await page.goto(`/book?venue=${venueId}`);
  await page.locator('input[type="date"]').first().fill(oggiNelLocale());

  // Persone: il selettore è un combobox, e il primo della pagina è quello.
  await page.locator("button[role=combobox]").first().click();
  await page.locator("[role=option]", { hasText: "2 persone" }).first().click();

  // Il primo orario libero della giornata. Gli orari arrivano dal server: se
  // non ce ne fosse nessuno, il locale di prova sarebbe configurato male e
  // questa attesa lo direbbe subito.
  const orari = page.locator("fieldset button", { hasText: /^\d{2}:\d{2}$/ });
  await expect(orari.first()).toBeVisible();
  const primoLibero = orari.filter({ hasNot: page.locator("[disabled]") }).first();
  await primoLibero.click();

  await page.locator("#firstName").fill(nome);
  await page.locator("#lastName").fill("Cognome");
  await page.locator("#email").fill(email);
  await page.locator("#phone").fill("+39 333 000 0001");
  await page.getByRole("button", { name: "Prenota ora" }).click();

  // La conferma del cliente: da qui in poi la prenotazione esiste.
  await expect(page.getByText(/richiesta.*ricevut|prenotazione.*confermat|grazie/i).first()).toBeVisible({
    timeout: 30_000,
  });

  /* ---------------------------------------------------------------------- */
  /* 2. Il locale la trova in attesa di conferma e la conferma               */
  /* ---------------------------------------------------------------------- */

  await page.goto("/bookings");
  const riga = page.locator("tr", { hasText: nome });
  await expect(riga).toBeVisible({ timeout: 30_000 });
  // Dal widget una prenotazione nasce **da confermare**: è una scelta del
  // prodotto, non un caso, e vale la pena verificarla qui.
  await expect(riga).toContainText(/attesa/i);

  // Una prenotazione da confermare non ha il menu degli stati: ha due
  // pulsanti espliciti, «Approva» e «Rifiuta». È la scelta giusta — su quella
  // riga c'è una decisione da prendere, non uno stato da correggere — e il
  // percorso segue il prodotto, non il contrario.
  await riga.getByRole("button", { name: "Approva" }).click();
  await expect(riga).toContainText(/confermat/i, { timeout: 20_000 });

  /* ---------------------------------------------------------------------- */
  /* 3. Arriva, e la si accomoda a un tavolo                                 */
  /* ---------------------------------------------------------------------- */

  await page.goto("/service");

  // «Arrivato» e «Accomoda» sono uguali su ogni scheda, quindi prima di
  // toccarli si verifica che ce ne sia **uno solo**: il locale di prova ha
  // questa prenotazione e nient'altro. Se un giorno ce ne fossero due, il
  // percorso si fermerebbe qui invece di toccare la persona sbagliata in
  // silenzio.
  const arrivato = page.getByRole("button", { name: "Arrivato" });
  await expect(arrivato).toHaveCount(1, { timeout: 30_000 });
  await arrivato.click();

  // In sala l'ordine dei gesti è questo, e il percorso lo rispetta:
  // arriva → si accomoda → si apre il conto.
  const accomoda = page.getByRole("button", { name: "Accomoda", exact: true });
  await expect(accomoda).toHaveCount(1, { timeout: 30_000 });
  await accomoda.click();

  // Il selettore propone solo tavoli **liberi a quell'ora**: se ne mostra uno,
  // il motore di disponibilità ha già detto sì.
  //
  // E ne propone già uno scelto — il primo che basta da solo — perché durante
  // il servizio un tocco in meno conta. Il percorso verifica quel
  // comportamento invece di combatterlo: la prima volta questo test toccava
  // il tavolo, e così lo **deselezionava**.
  const dialogo = page.locator('[role="dialog"]');
  await expect(dialogo).toBeVisible();
  const primoTavolo = dialogo.getByRole("button").filter({ hasText: /^P\d/ }).first();
  await expect(primoTavolo).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });

  await dialogo.getByRole("button", { name: "Accomoda", exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 20_000 });

  /* ---------------------------------------------------------------------- */
  /* 4. Si apre il conto, si batte un piatto, si chiude                      */
  /* ---------------------------------------------------------------------- */

  await page.getByRole("button", { name: `Apri il conto di ${nome}` }).click();
  const conto = page.locator('[role="dialog"]');
  await expect(conto).toBeVisible();

  await conto.locator('input[aria-label="Cerca un piatto da aggiungere"]').fill("Tagliatelle");
  await conto.locator("button", { hasText: "Tagliatelle di prova" }).first().click();

  // Il totale si calcola dalle righe, non si somma a mano nell'interfaccia.
  await expect(conto).toContainText("15,00 €", { timeout: 20_000 });

  await conto.getByRole("button", { name: /Chiudi il conto|^Incassa/ }).click();

  // Chiudendo, la finestra non se ne va: mostra l'esito e i punti accreditati,
  // perché quella frase serve a chi deve dirlo al cliente («Diglielo»). Il
  // percorso la legge — è il pezzo di catena che unisce il conto alla
  // fedeltà — e solo dopo chiude.
  await expect(conto).toContainText("Conto chiuso", { timeout: 30_000 });
  await expect(conto).toContainText("15 punti");
  await conto.getByRole("button", { name: "Fine" }).click();
  await expect(conto).toBeHidden({ timeout: 20_000 });

  /* ---------------------------------------------------------------------- */
  /* 5. Il cliente esiste, con la visita e i punti                           */
  /* ---------------------------------------------------------------------- */

  await page.goto("/guests");
  await page.getByPlaceholder("Cerca per nome, email o telefono…").fill(nome);
  const inElenco = page.getByRole("link", { name: new RegExp(nome) }).first();
  await expect(inElenco).toBeVisible({ timeout: 30_000 });
  await inElenco.click();

  // Una visita: quella di adesso. E quindici punti, perché il locale di prova
  // dà un punto per euro su un conto da quindici.
  await expect(page.getByText("Punti fedeltà")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("body")).toContainText("15");
});
