import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Le prove che toccano il database condividono le stesse righe: in
    // parallelo si darebbero fastidio a vicenda.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    env: { TZ: "UTC" }, // così un fuso locale diverso non maschera i bug di fuso
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
