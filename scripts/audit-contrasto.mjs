/**
 * Misura il contrasto di ogni testo visibile, schermata per schermata.
 *
 * Due trappole, che questo script evita entrambe (vedi DESIGN.md, «Come si
 * misura il contrasto qui»):
 *
 *  1. **Il token non è il fondo.** Schede e pagina hanno un gradiente più una
 *     velatura bianca al 5-7%: misurare sul token dà numeri troppo generosi
 *     di circa il 15%. Qui il fondo si compone risalendo gli antenati e
 *     sommando le velature.
 *  2. **Il DOM non dice tutto.** `backgroundColor` è trasparente dove c'è un
 *     gradiente, e un fondo dipinto da un *fratello* in posizione assoluta —
 *     la pillola crema della voce di menu attiva — non è un antenato. Quei
 *     casi finiscono in «da guardare», non fra i difetti: la sonda dichiara
 *     di non saperli misurare invece di inventare un numero.
 *
 * Uso:  BASE=http://localhost:3100 OUT=/tmp/contrasto.json node scripts/audit-contrasto.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://foodtech-app.vercel.app";
/** Le schermate dell'area operativa. `:id` viene sostituito con un
 *  identificativo trovato navigando: se non si trova, la schermata risulta
 *  **saltata** nel rapporto, non semplicemente assente. */
const OPERATIVE = [
  ["panoramica", "/overview"],
  ["servizio", "/service"],
  ["servizio-sala", "/service/room"],
  ["prenotazioni", "/bookings"],
  ["prenotazioni-sospese", "/bookings?status=pending"],
  ["prenotazioni-confermate", "/bookings?status=confirmed"],
  ["prenotazione-nuova", "/bookings/new"],
  ["prenotazione-scheda", "/bookings/:prenotazione"],
  ["lista-attesa", "/waitlist"],
  ["ospiti", "/guests"],
  ["ospite-scheda", "/guests/:ospite"],
  ["ospiti-doppioni", "/guests/doppioni"],
  ["analisi-andamento", "/insights?vista=andamento"],
  ["analisi-carta", "/insights?vista=carta"],
  ["analisi-servizio", "/insights?vista=servizio"],
  ["analisi-domanda", "/insights?vista=domanda"],
  ["analisi-30-giorni", "/insights?range=last30&vista=andamento"],
  ["carta", "/menu"],
  ["marketing", "/marketing"],
  ["automazioni", "/marketing/automations"],
  ["coupon", "/marketing/coupons"],
  ["gift-card", "/marketing/gift-cards"],
  ["codici-qr", "/marketing/qr-codes"],
  ["wifi-contatti", "/marketing/wifi"],
  ["campagne", "/campaigns"],
  ["campagna-scheda", "/campaigns/:campagna"],
  ["campagna-nuova", "/campaigns/new"],
  ["esperienze", "/experiences"],
  ["pagamenti", "/payments"],
  ["camerieri", "/waiters"],
  ["impostazioni-locale", "/settings?parte=locale"],
  ["impostazioni-prenotazioni", "/settings?parte=prenotazioni"],
  ["impostazioni-ospiti", "/settings?parte=ospiti"],
  ["impostazioni-sistema", "/settings?parte=sistema"],
  ["brand", "/settings/brand"],
  ["portale-wifi", "/settings/wifi"],
];

/** Quello che vede il cliente, che non ha mai fatto l'accesso. */
const PUBBLICHE = [
  ["vetrina", "/"],
  ["accesso", "/sign-in"],
  ["menu-dal-qr", "/m/aurora-bistrot"],
  ["portale-wifi-cliente", "/wifi/aurora-bistrot"],
  ["prenota", "/book?venue=aurora-bistrot"],
  ["link-scaduto", "/b/token-non-valido"],
];

/** I tre schermi su cui si lavora davvero. */
const SCHERMI = [
  ["scrivania", 1440, 900],
  ["tablet", 834, 1112],
  ["telefono", 390, 844],
];

const MISURA = () => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rap = (a, b) => { const [x, y] = [lum(...a), lum(...b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const rgb = (s) => { const m = (s || "").match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number).concat(m[3] === undefined ? 1 : Number(m[3])) : null; };
  const sopra = (f, d) => { const a = f[3]; return [0, 1, 2].map((i) => Math.round(f[i] * a + d[i] * (1 - a))); };
  const tutti = [...document.querySelectorAll("body *")];

  const buoni = [], incerti = [], spenti = [];
  for (const el of tutti) {
    const testo = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!testo) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const col = rgb(s.color); if (!col) continue;

    // il fondo dagli antenati, componendo le velature
    const strati = []; let gradiente = null;
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.backgroundImage && c.backgroundImage !== "none" && !gradiente) gradiente = `${n.tagName}: ${c.backgroundImage.slice(0, 60)}`;
      const q = rgb(c.backgroundColor);
      if (q && q[3] > 0) { strati.unshift(q); if (q[3] === 1) break; }
    }
    let bg = [255, 255, 255];
    for (const q of strati) bg = sopra(q, bg);

    // qualcosa dipinto dietro che non è un antenato? (pillole assolute, indicatori scorrevoli)
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dietro = null;
    for (const n of tutti) {
      if (n === el || n.contains(el) || el.contains(n)) continue;
      const q = n.getBoundingClientRect();
      if (cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) continue;
      const c = getComputedStyle(n);
      const bgc = rgb(c.backgroundColor);
      const haFondo = (bgc && bgc[3] > 0) || (c.backgroundImage && c.backgroundImage !== "none");
      if (haFondo && c.visibility !== "hidden" && Number(c.opacity) > 0) { dietro = `${n.tagName}.${(n.className || "").toString().slice(0, 60)}`; break; }
    }

    /** I controlli disattivati sono esenti (WCAG 1.4.3 esclude i componenti
     *  inattivi): non sono difetti, ma non sono nemmeno leggibili — vanno in
     *  un secchio a parte, non nascosti. */
    const disattivato = !!el.closest("[disabled], [aria-disabled='true'], fieldset[disabled]");

    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    const soglia = grande ? 3 : 4.5;
    const primo = col[3] < 1 ? sopra(col, bg) : col.slice(0, 3);
    const v = Math.round(rap(primo, bg) * 100) / 100;
    const voce = { testo: testo.slice(0, 70), rapporto: v, soglia, colore: s.color, fondo: `rgb(${bg.join(", ")})`, px: Math.round(px), peso: s.fontWeight, classi: (el.className || "").toString().slice(0, 110) };
    if (v >= soglia) continue;
    if (disattivato) spenti.push(voce);
    else if (gradiente || dietro) incerti.push({ ...voce, motivo: gradiente ? `gradiente — ${gradiente}` : `dipinto dietro — ${dietro}` });
    else buoni.push(voce);
  }
  return { buoni, incerti, spenti };
};

/** I toni del badge, letti dal componente: così il banco non va fuori sincrono. */
const toniDelBadge = () => {
  const src = readFileSync(new URL("../src/components/ui/badge.tsx", import.meta.url), "utf8");
  const blocco = src.match(/tone:\s*\{([\s\S]*?)\n\s{6}\}/);
  if (!blocco) throw new Error("mappa dei toni non trovata in badge.tsx: l'audit dei toni va aggiornato");
  const base = src.match(/cva\(\s*\n?\s*"([^"]+)"/);
  const voci = [...blocco[1].matchAll(/^\s*(?:\/\*[\s\S]*?\*\/\s*)?([a-z]+):\s*"([^"]*)"/gm)];
  return { base: base ? base[1] : "", toni: voci.map((m) => ({ nome: m[1], classi: m[2] })) };
};

/**
 * Gli stati rari non compaiono nelle schermate se nei dati non ci sono: la
 * pillola «Cancellata» era sotto soglia da sempre e nessuna sonda l'aveva mai
 * incontrata. Questo banco rende OGNI tono dentro una scheda vera, con il CSS
 * vero, così l'assenza di dati non diventa assenza di difetti.
 */
const BANCO = ({ base, toni }) => {
  const scheda = document.createElement("div");
  scheda.className = "surface riquadro";
  scheda.style.cssText = "position:fixed;left:8px;top:8px;z-index:99999;padding:16px;display:flex;flex-direction:column;gap:8px";
  scheda.setAttribute("data-banco", "1");
  for (const t of toni) {
    const riga = document.createElement("div");
    const p = document.createElement("span");
    p.className = `${base} ${t.classi}`;
    p.textContent = t.nome;
    p.setAttribute("data-tono", t.nome);
    riga.appendChild(p);
    scheda.appendChild(riga);
  }
  document.body.appendChild(scheda);
  return toni.length;
};

const b = await chromium.launch();

/** Un identificativo vero per ogni schermata di dettaglio: senza questi le
 *  schede non si misurano, ed è proprio dove vivono i casi particolari.
 *
 *  Le prenotazioni non si prendono dall'interfaccia: nella lista «Apri» apre
 *  un pannello e non lascia un collegamento in pagina. Si chiede all'API, che
 *  usa la stessa sessione del browser. */
async function scopriId(p) {
  const daElenco = async (via, prefisso) => {
    await p.goto(`${BASE}${via}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(2200);
    const href = await p.$$eval(`a[href^="${prefisso}"]`, (as) => as.map((a) => a.getAttribute("href"))).catch(() => []);
    const buono = href.find((h) => new RegExp(`^${prefisso}[^/?#]+$`).test(h) && !/\/(new|doppioni)$/.test(h));
    return buono ? buono.slice(prefisso.length) : null;
  };

  const daApi = async (via, prendi) => {
    const r = await p.request.get(`${BASE}${via}`).catch(() => null);
    if (!r || !r.ok()) return null;
    const dati = await r.json().catch(() => null);
    return dati ? (prendi(dati) ?? null) : null;
  };

  const primoId = (d) => {
    const righe = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.bookings) ? d.bookings : [];
    const con = righe.find((x) => typeof x?.id === "string");
    return con?.id;
  };

  return {
    prenotazione: (await daApi("/api/bookings", primoId)) ?? (await daElenco("/bookings", "/bookings/")),
    ospite: await daElenco("/guests", "/guests/"),
    campagna: await daElenco("/campaigns", "/campaigns/"),
  };
}

async function accedi(p) {
  await p.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await p.fill('input[type="email"]', "owner@tavolo.demo");
  await p.fill('input[type="password"]', "tavolo2026");
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 60000 }).catch(() => {});
  return !p.url().includes("sign-in");
}

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT", timezoneId: "Europe/Rome" });
const primo = await ctx.newPage();
if (!(await accedi(primo))) { console.log("ACCESSO FALLITO — probabilmente il limite di tentativi (10 ogni 10 minuti)"); await b.close(); process.exit(1); }
const ID = await scopriId(primo);
console.log("identificativi trovati:", Object.entries(ID).map(([k, v]) => `${k}=${v ?? "NESSUNO"}`).join("  "));
const sessione = await ctx.storageState();
await ctx.close();

const tutto = {};
const saltate = [];
let daBanco = [];

for (const [schermo, width, height] of SCHERMI) {
  console.log(`\n===== ${schermo} (${width}×${height}) =====`);
  const c = await b.newContext({ viewport: { width, height }, storageState: sessione, locale: "it-IT", timezoneId: "Europe/Rome" });
  const p = await c.newPage();

  for (const [nome, viaGrezza] of OPERATIVE) {
    const via = viaGrezza.replace(/:(\w+)/g, (_, k) => ID[k] ?? "");
    if (viaGrezza.includes(":") && /\/(\?|$)/.test(via)) { saltate.push(`${schermo}/${nome}`); console.log(`⊘ ${nome.padEnd(26)} saltata: nessun identificativo`); continue; }
    await p.goto(`${BASE}${via}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await p.waitForTimeout(2400);
    const r = await p.evaluate(MISURA);
    tutto[`${schermo}/${nome}`] = r;
    console.log(`${r.buoni.length ? "❌" : "✅"} ${nome.padEnd(26)} ${r.buoni.length} certi · ${r.incerti.length} da guardare · ${r.spenti.length} esenti`);
  }

  for (const [nome, via] of PUBBLICHE) {
    const pub = await (await b.newContext({ viewport: { width, height }, locale: "it-IT", timezoneId: "Europe/Rome" })).newPage();
    await pub.goto(`${BASE}${via}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await pub.waitForTimeout(2400);
    const r = await pub.evaluate(MISURA);
    tutto[`${schermo}/pubblica-${nome}`] = r;
    console.log(`${r.buoni.length ? "❌" : "✅"} ${("(pubblica) " + nome).padEnd(26)} ${r.buoni.length} certi · ${r.incerti.length} da guardare · ${r.spenti.length} esenti`);
    await pub.context().close();
  }

  // il banco dei toni: una volta per schermo, perché la tipografia cambia
  const mappa = toniDelBadge();
  await p.goto(`${BASE}/bookings`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.evaluate(BANCO, mappa);
  await p.waitForTimeout(400);
  const q = (await p.evaluate(MISURA)).buoni.filter((x) => mappa.toni.some((t) => t.nome === x.testo));
  console.log(`${q.length ? "❌" : "✅"} ${"banco degli " + mappa.toni.length + " toni"}`.padEnd(30) + (q.length ? q.map((x) => `${x.testo} ${x.rapporto}`).join(", ") : ""));
  daBanco = daBanco.concat(q.map((x) => ({ ...x, schermo })));
  await c.close();
}

writeFileSync(process.env.OUT, JSON.stringify({ schermate: tutto, toni: daBanco, saltate, identificativi: ID }, null, 2));
const conta = (k) => Object.values(tutto).flatMap((x) => x[k]).length;
console.log(`\nSCHERMATE MISURATE: ${Object.keys(tutto).length}   SALTATE: ${saltate.length}`);
console.log(`CERTI sotto soglia: ${conta("buoni") + daBanco.length}   DA GUARDARE: ${conta("incerti")}   DISATTIVATI (esenti): ${conta("spenti")}`);
await b.close();
