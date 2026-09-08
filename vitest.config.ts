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
    env: { TZ: "UTC" }, // così un fuso locale diverso non maschera i bug di fuso
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
