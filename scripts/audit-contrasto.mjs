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
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://foodtech-app.vercel.app";
const SCHERMATE = [
  ["panoramica", "/overview"], ["servizio", "/service"], ["prenotazioni", "/bookings"],
  ["da-confermare", "/bookings?status=pending"], ["lista-attesa", "/waitlist"], ["ospiti", "/guests"],
  ["analisi", "/insights?vista=andamento"], ["analisi-carta", "/insights?vista=carta"],
  ["carta", "/menu"], ["marketing", "/marketing"], ["automazioni", "/marketing/automations"],
  ["campagne", "/campaigns"], ["camerieri", "/waiters"], ["impostazioni", "/settings?parte=locale"],
];

const MISURA = () => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rap = (a, b) => { const [x, y] = [lum(...a), lum(...b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const rgb = (s) => { const m = (s || "").match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number).concat(m[3] === undefined ? 1 : Number(m[3])) : null; };
  const sopra = (f, d) => { const a = f[3]; return [0, 1, 2].map((i) => Math.round(f[i] * a + d[i] * (1 - a))); };
  const tutti = [...document.querySelectorAll("body *")];

  const buoni = [], incerti = [];
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

    const px = parseFloat(s.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
    const soglia = grande ? 3 : 4.5;
    const primo = col[3] < 1 ? sopra(col, bg) : col.slice(0, 3);
    const v = Math.round(rap(primo, bg) * 100) / 100;
    const voce = { testo: testo.slice(0, 70), rapporto: v, soglia, colore: s.color, fondo: `rgb(${bg.join(", ")})`, px: Math.round(px), peso: s.fontWeight, classi: (el.className || "").toString().slice(0, 110) };
    if (v >= soglia) continue;
    if (gradiente || dietro) incerti.push({ ...voce, motivo: gradiente ? `gradiente — ${gradiente}` : `dipinto dietro — ${dietro}` });
    else buoni.push(voce);
  }
  return { buoni, incerti };
};

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
await p.fill('input[type="email"]', "owner@tavolo.demo");
await p.fill('input[type="password"]', "tavolo2026");
await p.click('button[type="submit"]');
await p.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 45000 }).catch(() => {});
if (p.url().includes("sign-in")) { console.log("ACCESSO FALLITO"); await b.close(); process.exit(1); }

const tutto = {};
for (const [nome, via] of SCHERMATE) {
  await p.goto(`${BASE}${via}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(2500);
  tutto[nome] = await p.evaluate(MISURA);
  const { buoni, incerti } = tutto[nome];
  console.log(`${buoni.length ? "❌" : "✅"} ${nome.padEnd(16)} ${buoni.length} certi · ${incerti.length} da guardare`);
}
writeFileSync(process.env.OUT, JSON.stringify(tutto, null, 2));
const c = Object.values(tutto).flatMap((x) => x.buoni).length, i = Object.values(tutto).flatMap((x) => x.incerti).length;
console.log(`\nCERTI sotto soglia: ${c}   DA GUARDARE: ${i}`);
await b.close();
