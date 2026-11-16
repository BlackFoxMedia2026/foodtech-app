import type { CapacitorConfig } from "@capacitor/cli";

/**
 * L'app Foodtech è il gestionale stesso, aperto in una finestra nativa.
 *
 * Il gestionale vive sul server (Next.js con API, database, sessioni): non si
 * può impacchettare come pagine statiche. Per questo l'app non contiene una
 * copia del sito ma lo **carica** da `server.url`, e Capacitor ci inietta il
 * ponte verso i plugin nativi. Così ogni deploy arriva anche nell'app senza
 * passare dagli store; si ripubblica l'app solo quando cambia un plugin.
 *
 * `www/` contiene soltanto la pagina che si vede se il server non risponde.
 *
 * Per provare l'app contro il computer di sviluppo:
 *   FOODTECH_URL=http://192.168.1.20:3000 npx cap sync android
 */
const url = process.env.FOODTECH_URL ?? "https://foodtech-app.vercel.app";

const config: CapacitorConfig = {
  appId: "agency.blackfoxmedia.foodtech",
  appName: "Foodtech",
  webDir: "www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    errorPath: "offline.html",
  },
  android: {
    // Il suffisso fa riconoscere l'app al server (vedi src/lib/app-nativa.ts)
    // anche prima che il ponte di Capacitor sia pronto.
    appendUserAgent: "FoodtechApp",
  },
  ios: {
    appendUserAgent: "FoodtechApp",
  },
};

export default config;
