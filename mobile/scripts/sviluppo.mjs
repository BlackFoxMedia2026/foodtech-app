#!/usr/bin/env node
/**
 * L'app sul telefono, collegata al dev server: si salva un file e il telefono
 * si aggiorna da solo, come il browser.
 *
 *   npm run dev            → telefono via USB (o emulatore), con `adb reverse`
 *   npm run dev -- --rete  → telefono sulla stessa Wi-Fi del computer, senza cavo
 *
 * Con il cavo l'app apre `http://localhost:3000`: per il telefono è il computer,
 * grazie ad `adb reverse`, e per Chrome «localhost» è un'origine sicura, quindi
 * la fotocamera (Inquadra il QR) funziona e l'accesso di NextAuth torna sullo
 * stesso indirizzo. Via Wi-Fi l'indirizzo è quello di rete del computer: la
 * fotocamera il browser la nega in http, e l'accesso va fatto prima dal cavo
 * (NEXTAUTH_URL punta a localhost).
 *
 * Il dev server (`npm run dev` nella cartella principale) deve essere già acceso.
 * Si ricompila solo la prima volta e quando cambiano plugin o permessi: dopo,
 * le modifiche al sito arrivano da sole. `npm run apk` riporta l'app sulla
 * produzione.
 *
 * Non usa `cap run`: su Windows la sua chiamata a `./gradlew` non parte.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const cartella = join(dirname(fileURLToPath(import.meta.url)), "..");
const porta = process.env.PORT ?? "3000";
const viaRete = process.argv.includes("--rete");
const windows = process.platform === "win32";
const APP = "agency.blackfoxmedia.foodtech";

const env = { ...process.env };
if (!env.JAVA_HOME) {
  const jbr = "C:\\Program Files\\Android\\Android Studio\\jbr";
  if (existsSync(jbr)) env.JAVA_HOME = jbr;
}
if (!env.ANDROID_HOME && process.env.LOCALAPPDATA) {
  const sdk = join(process.env.LOCALAPPDATA, "Android", "Sdk");
  if (existsSync(sdk)) env.ANDROID_HOME = sdk;
}
const adb = env.ANDROID_HOME ? join(env.ANDROID_HOME, "platform-tools", windows ? "adb.exe" : "adb") : "adb";

function esegui(comando, argomenti, opzioni = {}) {
  const r = spawnSync(comando, argomenti, { stdio: "inherit", env, cwd: cartella, ...opzioni });
  if (r.status !== 0) {
    console.error(`\n«${comando} ${argomenti.join(" ")}» non è riuscito.`);
    process.exit(r.status ?? 1);
  }
  return r;
}

function ipDiRete() {
  for (const schede of Object.values(networkInterfaces())) {
    for (const s of schede ?? []) {
      if (s.family === "IPv4" && !s.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(s.address)) {
        return s.address;
      }
    }
  }
  return null;
}

// 1. Quale telefono.
const elenco = spawnSync(adb, ["devices"], { encoding: "utf8", env }).stdout ?? "";
const accesi = elenco
  .split(/\r?\n/)
  .slice(1)
  .map((r) => r.split("\t"))
  .filter(([, stato]) => stato === "device")
  .map(([id]) => id);
const scelto = process.env.ANDROID_SERIAL ?? accesi[0];
if (!scelto) {
  console.error("Nessun telefono collegato: attiva il debug USB e collegalo, oppure accendi un emulatore.");
  process.exit(1);
}
if (accesi.length > 1 && !process.env.ANDROID_SERIAL) {
  console.log(`Più dispositivi collegati, uso ${scelto} (per sceglierne un altro: ANDROID_SERIAL=<id>).`);
}
const sulTelefono = (...a) => [adb, ["-s", scelto, ...a]];

// 2. Dove guarda l'app.
const host = viaRete ? ipDiRete() : "localhost";
if (!host) {
  console.error("Non trovo l'indirizzo di rete del computer: collega il telefono col cavo e usa `npm run dev`.");
  process.exit(1);
}
const url = `http://${host}:${porta}`;
console.log(`L'app si collega a ${url} (${scelto})\n`);

// 3. Sincronizza, compila, installa, apri.
esegui("npx", ["cap", "sync", "android"], { env: { ...env, FOODTECH_URL: url }, shell: windows });
esegui(join(cartella, "android", windows ? "gradlew.bat" : "gradlew"), ["assembleDebug", "-q"], { cwd: join(cartella, "android"), shell: windows });
if (!viaRete) esegui(...sulTelefono("reverse", `tcp:${porta}`, `tcp:${porta}`));
esegui(...sulTelefono("install", "-r", join(cartella, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")));
esegui(...sulTelefono("shell", "am", "start", "-n", `${APP}/.MainActivity`));

console.log("\nFatto. Lascia acceso il dev server: ogni modifica salvata arriva sul telefono.");
