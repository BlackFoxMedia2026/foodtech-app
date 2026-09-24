/**
 * **Verifica dal vivo di un'integrazione già collegata, in sola lettura.**
 *
 *   DATABASE_URL=…/tavolo_test_integrazioni npx tsx scripts/verifica-dal-vivo.ts \
 *     --locale prova-cassa-in-cloud --integrazione cassa-in-cloud --operatore nome@foodtech.it
 *
 * Le credenziali non passano da qui: le ha già inserite una persona nel
 * wizard di Foodtech, e stanno cifrate nel database. Questo script usa la
 * console di certificazione (`server/integrations/certificazione/console.ts`)
 * per la prova di connessione e per ogni lettura che l'adattatore offre —
 * sedi, sale, tavoli, menu, prodotti, IVA, metodi, ordini e pagamenti delle
 * ultime 48 ore — e registra le evidenze PROVIDER_API come farebbe la console
 * dal pannello.
 *
 * Tre regole:
 * - **nessuna scrittura presso il fornitore**: si chiamano solo le letture
 *   della console; ordini, pagamenti e chiusure non sono raggiungibili da qui;
 * - **nessun dato stampato**: per ogni lettura, esito, numero di elementi,
 *   codice d'errore e durata. I dati restano nel registro ripulito della
 *   console, per chi deve guardarli;
 * - **solo il database di prova**: rifiuta un `DATABASE_URL` che non contenga
 *   «test».
 */
import { db } from "../src/lib/db";
import { provaConnessioneReale, leggi, RISORSE_LETTURA, type Lettura } from "../src/server/integrations/certificazione/console";
import { adattatoreDi } from "../src/server/integrations/adapters";
import { eAdattatorePos } from "../src/server/integrations/adapters/tipi";

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] ?? null : null;
}

const METODO: Record<Lettura, string> = {
  locations: "getLocations",
  floors: "getFloors",
  tables: "getTables",
  menu: "getMenu",
  products: "getProducts",
  tax_rates: "getTaxRates",
  payment_methods: "getPaymentMethods",
  orders: "getOrders",
  payments: "getPayments",
};

async function main() {
  if (!/test/i.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Solo sul database di prova: DATABASE_URL deve contenere «test».");
  }
  const localeSlug = argomento("--locale");
  const slug = argomento("--integrazione");
  const operatore = argomento("--operatore") ?? "verifica-dal-vivo@foodtech.local";
  if (!localeSlug || !slug) throw new Error("Uso: --locale <slug del locale> --integrazione <slug> [--operatore email]");

  const venue = await db.venue.findFirst({ where: { slug: localeSlug }, select: { id: true, name: true } });
  if (!venue) throw new Error(`Locale «${localeSlug}» non trovato.`);
  const adattatore = adattatoreDi(slug);
  if (!adattatore) throw new Error(`Nessun adattatore per «${slug}».`);

  const c = { venueId: venue.id, email: operatore, origine: process.env.NEXTAUTH_URL ?? "http://localhost:3200" };
  const righe: { prova: string; esito: string; elementi: number | string; errore: string; ms: number | string }[] = [];

  const t0 = Date.now();
  const conn = await provaConnessioneReale(c, slug);
  if (!conn.ambienteVero) throw new Error(`Non è un fornitore vero: ${conn.motivoAmbienteFinto}`);
  const esito = conn.esito as { ok?: boolean; errore?: string | null; titolo?: string };
  righe.push({ prova: "connessione", esito: esito.ok ? "RIUSCITA" : "FALLITA", elementi: "—", errore: esito.ok ? "" : String(esito.errore ?? esito.titolo ?? ""), ms: Date.now() - t0 });

  if (esito.ok && eAdattatorePos(adattatore)) {
    for (const risorsa of RISORSE_LETTURA) {
      if (typeof (adattatore.pos as Record<string, unknown>)[METODO[risorsa]] !== "function") {
        righe.push({ prova: risorsa, esito: "NON OFFERTA", elementi: "—", errore: "", ms: "—" });
        continue;
      }
      const t = Date.now();
      const r = await leggi(c, slug, risorsa);
      righe.push({
        prova: risorsa,
        esito: r.errore ? "FALLITA" : "RIUSCITA",
        elementi: Array.isArray(r.normalizzata) ? r.normalizzata.length : "—",
        errore: r.errore ?? "",
        ms: Date.now() - t,
      });
    }
  }

  console.log(`\n${slug} · locale «${venue.name}» · ambiente ${conn.ambiente} · ${new Date().toISOString()}\n`);
  console.table(righe);
  console.log("Le evidenze PROVIDER_API sono registrate: /admin/integrazioni/" + slug);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
