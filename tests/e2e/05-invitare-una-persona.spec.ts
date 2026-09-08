import { test, expect } from "@playwright/test";
import { unico } from "./aiuti";

/**
 * Dare accesso a una persona, e togliergliela.
 *
 * È il percorso che **crea un accesso ai dati di un ristorante**: se qualcosa
 * qui si rompe in silenzio, il danno non è una schermata sbagliata. Per
 * questo passa dall'interfaccia per intero, compresa la parte che nessun test
 * unitario può dire — che la persona invitata **entra davvero**.
 */
test("invitare qualcuno: il link vale una volta, e chi lo accetta entra", async ({ page, browser }) => {
  const email = `${unico("maria").toLowerCase()}@ristorante.test`;

  /* --- 1. Il manager invita ---------------------------------------------- */

  await page.goto("/settings");
  await page.getByRole("button", { name: "Invita" }).click();
  await page.locator("#team-email").fill(email);
  await page.locator("#team-ruolo").click();
  await page.locator("[role=option]", { hasText: "Cameriere" }).first().click();
  await page.getByRole("button", { name: "Crea l'invito" }).click();

  // L'invito compare in attesa, col ruolo e la scadenza.
  await expect(page.getByText("Inviti in attesa")).toBeVisible({ timeout: 20_000 });
  const riga = page.locator("div").filter({ hasText: email }).filter({ hasText: "Cameriere" }).last();
  await expect(riga).toBeVisible();

  // Il link si prende dagli appunti, che è il gesto vero: Tavolo non manda
  // email finché manca la chiave, e la scheda lo dice.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copia il link" }).first().click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("/invito/");

  /* --- 2. Chi lo riceve, in una finestra che non ha mai visto Tavolo ------ */

  const ospite = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const q = await ospite.newPage();
  await q.goto(link);

  // La pagina dice **dove** entra e **con che ruolo**, e niente di più.
  await expect(q.getByText(email)).toBeVisible({ timeout: 20_000 });
  await expect(q.getByText(/cameriere/i)).toBeVisible();

  await q.locator("#inv-nome").fill("Maria Prova");
  await q.locator("#inv-password").fill("unapasswordlunga");
  await q.getByRole("button", { name: "Accetta l'invito" }).click();
  await expect(q.getByText("Ci sei")).toBeVisible({ timeout: 20_000 });

  // Lo stesso link, una seconda volta: non vale più.
  await q.goto(link);
  await expect(q.getByText(/non è più valido/i)).toBeVisible({ timeout: 20_000 });

  /* --- 3. Entra davvero, e vede il locale -------------------------------- */

  const { csrfToken } = await q.request.get("/api/auth/csrf").then((r) => r.json());
  const accesso = await q.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password: "unapasswordlunga", callbackUrl: "/overview", json: "true" },
  });
  expect(accesso.ok()).toBe(true);

  await q.goto("/overview");
  await expect(q.getByText("Locale di prova").first()).toBeVisible({ timeout: 30_000 });

  // E non può invitare nessuno: non è manager. La difesa è sul server, non
  // solo un pulsante che non si vede.
  await q.goto("/settings");
  await expect(q.getByRole("button", { name: "Invita" })).toHaveCount(0);
  const rifiuto = await q.request.post("/api/team/invites", {
    data: { email: "altro@test.local", role: "MANAGER" },
  });
  expect(rifiuto.status()).toBe(403);
  await ospite.close();

  /* --- 4. Il manager le toglie l'accesso --------------------------------- */

  await page.goto("/settings");
  await expect(page.getByText(email)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: `Togli l'accesso a Maria Prova` }).click();
  await expect(page.getByText(email)).toHaveCount(0, { timeout: 20_000 });
});

test("su di sé non si agisce: il proprio ruolo si legge, non si cambia", async ({ page }) => {
  await page.goto("/settings");

  // La riga di chi sta guardando porta «(tu)» e nessun comando: è la difesa
  // contro il modo più comune di restare fuori dal proprio locale, e vale
  // anche sul server (`TeamError("non_su_di_te")`).
  const mia = page.locator("div").filter({ hasText: "(tu)" }).last();
  await expect(mia).toBeVisible({ timeout: 20_000 });
  await expect(mia.getByRole("button", { name: /Togli l'accesso/ })).toHaveCount(0);
});
