import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Le prove che toccano il database condividono le stesse righe: in
    // parallelo si darebbero fastidio a vicenda.
    fileParallelism: false,
    // I percorsi end-to-end stanno in `tests/e2e` e li fa girare Playwright
    // (`npm run test:e2e`): a Vitest servirebbe un browser, e li vedrebbe
    // fallire per il motivo sbagliato.
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    env: {
      TZ: "UTC", // così un fuso locale diverso non maschera i bug di fuso
      /*
        Nessuna chiave dei fornitori esterni, qualunque cosa ci sia nel `.env`
        di chi lancia le prove.

        Vitest carica i file `.env`, e il giorno in cui una chiave OpenAI vera
        è finita lì dentro una prova è diventata rossa: «senza fornitore
        esterno non consuma niente della quota» presume che il fornitore non
        ci sia, e all'improvviso c'era. Una prova che cambia esito a seconda
        di cosa ha configurato chi la lancia non prova niente — e peggio,
        nasconde il caso che il prodotto incontra più spesso, cioè
        l'installazione senza chiave.
      */
      OPENAI_API_KEY: "",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
