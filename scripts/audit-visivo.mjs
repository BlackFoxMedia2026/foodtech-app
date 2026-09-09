import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://foodtech-app.vercel.app";
const OUT = process.env.OUT ?? "/tmp/claude-501/audit/foto";
const V = process.env.VENUE;
const BOOKING = process.env.BOOKING;
const GUEST = process.env.GUEST;
const CAMPAIGN = process.env.CAMPAIGN;
const SURVEY = process.env.SURVEY;

/** Le schermate dell'area operativa, in ordine di come si lavora. */
const SCRIVANIA = [
  ["01-panoramica", "/overview"],
  ["02-servizio", "/service"],
  ["03-sala-viva", "/service/room"],
  ["04-prenotazioni-giorno", "/bookings"],
  ["05-prenotazioni-da-confermare", "/bookings?status=pending"],
  ["06-nuova-prenotazione", "/bookings/new"],
  ["07-scheda-prenotazione", `/bookings/${BOOKING}`],
  ["08-piantina-sala", "/floor"],
  ["09-lista-attesa", "/waitlist"],
  ["10-crm-ospiti", "/guests"],
  ["11-scheda-ospite", `/guests/${GUEST}`],
  ["12-ospiti-doppioni", "/guests/doppioni"],
  ["13-analisi-comè-andata", "/insights?vista=andamento"],
  ["14-analisi-cibo-e-carta", "/insights?vista=carta"],
  ["15-analisi-servizio", "/insights?vista=servizio"],
  ["16-analisi-domanda-e-ospiti", "/insights?vista=domanda"],
  ["17-analisi-30-giorni", "/insights?range=last30&vista=andamento"],
  ["18-carta-e-piatti", "/menu"],
  ["19-marketing", "/marketing"],
  ["20-automazioni", "/marketing/automations"],
  ["21-coupon", "/marketing/coupons"],
  ["22-gift-card", "/marketing/gift-cards"],
  ["23-codici-qr", "/marketing/qr-codes"],
  ["24-wifi-contatti", "/marketing/wifi"],
  ["25-campagne", "/campaigns"],
  ["26-campagna-risultati", `/campaigns/${CAMPAIGN}`],
  ["27-campagna-nuova", "/campaigns/new"],
  ["28-esperienze", "/experiences"],
  ["29-pagamenti", "/payments"],
  ["30-camerieri", "/waiters"],
  ["31-impostazioni-locale", "/settings?parte=locale"],
  ["32-impostazioni-prenotazioni", "/settings?parte=prenotazioni"],
  ["33-impostazioni-ospiti", "/settings?parte=ospiti"],
  ["34-impostazioni-sistema", "/settings?parte=sistema"],
  ["35-brand", "/settings/brand"],
  ["36-portale-wifi", "/settings/wifi"],
];

/** Le stesse schermate dove si lavora davvero: in mano, durante il servizio. */
const TELEFONO = [
  ["01-panoramica", "/overview"],
  ["02-servizio", "/service"],
  ["03-sala-viva", "/service/room"],
  ["04-prenotazioni", "/bookings"],
  ["05-lista-attesa", "/waitlist"],
  ["06-crm-ospiti", "/guests"],
  ["07-analisi", "/insights?vista=andamento"],
  ["08-carta", "/menu"],
  ["09-impostazioni", "/settings?parte=locale"],
  ["10-camerieri", "/waiters"],
];

/** Quello che vede il cliente, che non ha mai fatto l'accesso. */
const PUBBLICHE = [
  ["01-vetrina", "/", true],
  ["02-accesso", "/sign-in", false],
  ["03-prenota", `/book?venue=${V}`, true],
  ["04-prenota-slug", "/book?venue=aurora-bistrot", true],
  ["05-menu-dal-qr", "/m/aurora-bistrot", true],
  ["06-portale-wifi", "/wifi/aurora-bistrot", true],
  ["07-sondaggio", `/s/${SURVEY}`, true],
  ["08-link-scaduto", "/b/token-non-valido", false],
];

const rapporto = [];

async function scatta(p, cartella, nome, rotta, intera = false) {
  const errori = [];
  const onErr = (m) => { if (m.type() === "error") errori.push(m.text().slice(0, 160)); };
  p.on("console", onErr);
  let stato = 0;
  const onRes = (r) => { if (r.url() === BASE + rotta) stato = r.status(); };
  p.on("response", onRes);

  await p.goto(BASE + rotta, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);

  const m = await p.evaluate(() => {
    const el = document.scrollingElement;
    const main = document.querySelector("main");
    return {
      scorrimentoPagina: el.scrollHeight - el.clientHeight,
      scorrimentoMain: main ? main.scrollHeight - main.clientHeight : 0,
      scorrimentoOrizzontale: el.scrollWidth - el.clientWidth,
      caratteri: (document.body.innerText ?? "").trim().length,
      titolo: document.title,
    };
  });

  mkdirSync(`${OUT}/${cartella}`, { recursive: true });
  await p.screenshot({ path: `${OUT}/${cartella}/${nome}.png`, fullPage: intera });

  p.off("console", onErr);
  p.off("response", onRes);
  rapporto.push({ cartella, nome, rotta, stato, urlFinale: new URL(p.url()).pathname + new URL(p.url()).search, ...m, errori });
  const male = errori.length > 0 || m.caratteri < 120 || m.scorrimentoOrizzontale > 4;
  console.log(`${male ? "✗" : "✓"} ${cartella}/${nome}  ${m.caratteri} caratteri` +
    (m.scorrimentoPagina > 4 ? ` · pagina scorre ${m.scorrimentoPagina}px` : "") +
    (m.scorrimentoOrizzontale > 4 ? ` · ORIZZONTALE ${m.scorrimentoOrizzontale}px` : "") +
    (errori.length ? ` · ${errori.length} errori in console` : ""));
}

const SEZIONI = (process.env.SEZIONI ?? "1,2,3,4").split(",");
const b = await chromium.launch();

// --- scrivania
if (SEZIONI.includes("1")) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT", timezoneId: "Europe/Rome", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await p.fill('input[type="email"]', "owner@tavolo.demo").catch(() => {});
  await p.fill('input[type="password"]', "tavolo2026").catch(() => {});
  await p.click('button[type="submit"]');
  await p.waitForURL(/overview|service|onboarding/, { timeout: 90000 });
  for (const [nome, rotta] of SCRIVANIA) await scatta(p, "01-scrivania", nome, rotta);
  await ctx.storageState({ path: "/tmp/claude-501/audit/sessione.json" });
  await ctx.close();
}

// --- telefono, riusando la sessione
if (SEZIONI.includes("2")) {
  const ctx = await b.newContext({
    storageState: "/tmp/claude-501/audit/sessione.json",
    viewport: { width: 390, height: 844 }, locale: "it-IT", timezoneId: "Europe/Rome",
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const p = await ctx.newPage();
  for (const [nome, rotta] of TELEFONO) await scatta(p, "02-telefono", nome, rotta);
  await ctx.close();
}

// --- pubbliche, senza accesso
if (SEZIONI.includes("3")) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT", timezoneId: "Europe/Rome", deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  for (const [nome, rotta, intera] of PUBBLICHE) await scatta(p, "03-pubbliche", nome, rotta, intera);
  await ctx.close();
}

// --- pubbliche dal telefono: è da lì che si prenota e si legge il menu
if (SEZIONI.includes("4")) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, locale: "it-IT", timezoneId: "Europe/Rome",
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const p = await ctx.newPage();
  for (const [nome, rotta, intera] of PUBBLICHE.filter(([n]) => /prenota$|menu-dal-qr|portale-wifi|sondaggio|vetrina/.test(n))) {
    await scatta(p, "04-pubbliche-telefono", nome, rotta, intera);
  }
  await ctx.close();
}

writeFileSync(`${OUT}/../rapporto-${SEZIONI.join("")}.json`, JSON.stringify(rapporto, null, 2));
const male = rapporto.filter((r) => r.errori.length > 0 || r.caratteri < 120 || r.scorrimentoOrizzontale > 4);
console.log(`\n${rapporto.length} schermate acquisite, ${male.length} da guardare.`);
await b.close();
