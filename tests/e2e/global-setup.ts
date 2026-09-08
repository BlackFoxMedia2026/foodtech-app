import { chromium, request } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { seedE2E, E2E } from "../../prisma/seed-e2e";
import { BASE_URL, IP_DI_PROVA } from "../../playwright.config";

/**
 * Prima di tutti i percorsi: dati puliti e **un solo accesso**.
 *
 * L'accesso è limitato a dieci tentativi ogni dieci minuti per indirizzo: una
 * suite che si autentica a ogni prova si chiuderebbe fuori da sola alla
 * undicesima. Si entra una volta qui, si salva lo stato del browser, e ogni
 * prova lo riusa (`storageState` in `playwright.config.ts`).
 *
 * Il seed gira **prima**: i percorsi devono trovare un locale nello stesso
 * stato ogni volta, altrimenti la prima esecuzione della giornata passa e la
 * seconda no.
 */
export default async function globalSetup() {
  const dati = await seedE2E();
  await mkdir("tests/e2e/.auth", { recursive: true });
  await writeFile("tests/e2e/.auth/venue.json", JSON.stringify(dati, null, 1));

  // Anche l'accesso ha il suo limite (dieci ogni dieci minuti): l'esecuzione
  // si presenta con lo stesso indirizzo di provenienza dei percorsi, così una
  // sessione di lavoro non si chiude fuori da sola.
  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": IP_DI_PROVA },
  });
  const { csrfToken } = await (await api.get("/api/auth/csrf")).json();
  const esito = await api.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: E2E.email,
      password: E2E.password,
      callbackUrl: `${BASE_URL}/overview`,
      json: "true",
    },
  });
  if (!esito.ok()) {
    throw new Error(`Accesso di prova rifiutato (${esito.status()}): senza sessione i percorsi non partono.`);
  }
  const stato = await api.storageState();
  await api.dispose();

  // Lo stato va salvato passando da un contesto del browser: Playwright lo
  // rilegge da lì, e i cookie di NextAuth devono avere lo stesso dominio.
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: stato });
  await ctx.storageState({ path: "tests/e2e/.auth/staff.json" });
  await ctx.close();
  await browser.close();
}
