/**
 * Il lato di **miocentralino**: genera le chiavi ed emette le licenze.
 *
 * ## La strada normale non è questa
 *
 * Dal 17 settembre 2026 le chiavi si generano e le licenze si emettono
 * **dall'interfaccia di miocentralino**, su `sip.ilmiocentralino.it` →
 * *Gestionali*: chi vende preme un pulsante, non apre un terminale, e resta
 * scritto chi ha emesso cosa e per chi.
 *
 * Questo comando resta per due casi: **avviare** la cosa la prima volta, e
 * **rimediare** se l'interfaccia non è raggiungibile. Emettere una licenza da
 * qui non lascia traccia nel registro di miocentralino — si sa che esiste solo
 * perché il cliente ce l'ha.
 *
 * Questo script non serve al ristoratore e non serve a Tavolo in produzione:
 * serve a chi **vende** il centralino. Sta nel repo di Tavolo per una ragione
 * sola — il testo su cui si firma deve essere identico da entrambe le parti
 * (`src/lib/licenza-centralino.ts`), e tenerlo in due posti è il modo sicuro
 * di farli divergere.
 *
 * ## Una volta sola: le chiavi
 *
 *     npm run centralino:chiavi
 *
 * Stampa due cose. La **pubblica** va nell'ambiente di Tavolo, come
 * `CENTRALINO_CHIAVE_PUBBLICA`: con quella Tavolo verifica e non può emettere.
 * La **privata** resta in miocentralino e non entra mai nell'ambiente di
 * Tavolo — se ci entrasse, chi legge i segreti di Tavolo potrebbe fabbricarsi
 * una licenza, che è tutto quello che questo disegno serve a impedire.
 *
 * ## Ogni volta che si vende: la licenza
 *
 *     CENTRALINO_CHIAVE_PRIVATA=… npm run centralino:licenza -- \
 *       --locale <slug> --scade 2027-09-17
 *
 * Stampa la chiave da consegnare. Il ristoratore la incolla in Tavolo, in
 * Impostazioni, e il telefono si accende nel suo gestionale. Non installa
 * niente e non vede nessun secondo prodotto.
 */
import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  FUNZIONI_CENTRALINO,
  componiLicenza,
  testoDaFirmare,
  type ContenutoLicenza,
} from "../src/lib/licenza-centralino";

const db = new PrismaClient();

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return null;
  const valore = process.argv[i + 1];
  return valore && !valore.startsWith("--") ? valore : "";
}

function uso(messaggio: string): never {
  console.error(`\n${messaggio}\n`);
  console.error("  npm run centralino:chiavi");
  console.error("  npm run centralino:licenza -- --locale <slug> [--scade 2027-09-17]");
  console.error(`\nFunzioni: ${FUNZIONI_CENTRALINO.join(", ")} (senza --funzioni: tutte)\n`);
  process.exit(1);
}

/** Il giorno di oggi in forma `AAAA-MM-GG`. */
function oggi(): string {
  return new Date().toISOString().slice(0, 10);
}

function generaChiavi(): never {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubblica = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const privata = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

  console.log("\n─── Chiave PUBBLICA — va nell'ambiente di Tavolo ───\n");
  console.log(`CENTRALINO_CHIAVE_PUBBLICA=${pubblica}\n`);
  console.log("─── Chiave PRIVATA — resta in miocentralino ───\n");
  console.log(`CENTRALINO_CHIAVE_PRIVATA=${privata}\n`);
  console.log("La privata NON va nell'ambiente di Tavolo: se ci entrasse, chi legge i");
  console.log("segreti di Tavolo potrebbe emettersi una licenza da solo. Con la sola");
  console.log("pubblica, Tavolo può verificare e non può fabbricare.\n");
  console.log("Cambiarle spegne tutte le licenze già emesse: si fa una volta.\n");
  process.exit(0);
}

async function emettiLicenza(): Promise<void> {
  const grezza = process.env.CENTRALINO_CHIAVE_PRIVATA?.replace(/\s+/g, "");
  if (!grezza) {
    uso(
      "Serve la chiave privata in CENTRALINO_CHIAVE_PRIVATA. La generi con `npm run centralino:chiavi`.",
    );
  }

  let privata;
  try {
    privata = createPrivateKey({
      key: Buffer.from(grezza, "base64"),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    uso("CENTRALINO_CHIAVE_PRIVATA non è una chiave valida (attesa: Ed25519 PKCS#8 in base64).");
  }

  const slug = argomento("locale");
  if (!slug) uso("Serve il locale: --locale <slug>.");

  /* Lo slug è unico per organizzazione, non nel mondo: se ne trova più di uno
     non si sceglie in silenzio, o si emetterebbe la licenza al ristorante
     sbagliato — e quella licenza non accenderebbe niente da nessuna parte. */
  const candidati = await db.venue.findMany({
    where: { slug },
    select: { id: true, name: true, org: { select: { name: true } } },
  });
  if (candidati.length === 0) uso(`Nessun locale con slug «${slug}».`);
  const idScelto = argomento("id");
  if (candidati.length > 1 && !idScelto) {
    console.error(`\nLo slug «${slug}» è di più locali. Indica quale con --id:\n`);
    for (const c of candidati) console.error(`  --id ${c.id}   ${c.name} (${c.org.name})`);
    console.error("");
    process.exit(1);
  }
  const locale = idScelto ? candidati.find((c) => c.id === idScelto) : candidati[0];
  if (!locale) uso(`Nessun locale «${slug}» con identificativo «${idScelto}».`);

  const scade = argomento("scade");
  if (scade && !/^\d{4}-\d{2}-\d{2}$/.test(scade)) {
    uso(`Data non valida: «${scade}». Usa il formato 2027-09-17.`);
  }

  const chieste = argomento("funzioni");
  const funzioni = chieste
    ? chieste
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : undefined;
  if (funzioni) {
    const sconosciute = funzioni.filter((f) => !(FUNZIONI_CENTRALINO as readonly string[]).includes(f));
    if (sconosciute.length > 0) {
      uso(`Funzioni che non esistono: ${sconosciute.join(", ")}. Disponibili: ${FUNZIONI_CENTRALINO.join(", ")}`);
    }
  }

  const contenuto: ContenutoLicenza = {
    v: 1,
    l: locale.id,
    n: locale.name,
    ...(scade ? { e: scade } : {}),
    ...(funzioni ? { f: funzioni } : {}),
    d: oggi(),
  };

  const firma = sign(null, Buffer.from(testoDaFirmare(contenuto), "utf8"), privata).toString(
    "base64url",
  );
  const chiave = componiLicenza(contenuto, firma);

  console.log(`\nLicenza per ${locale.name}`);
  console.log(
    `Funzioni: ${funzioni ? funzioni.join(", ") : "tutte"}${scade ? `   scade il ${scade}` : "   senza scadenza"}`,
  );
  console.log("\n" + chiave + "\n");
  console.log("Il ristoratore la incolla in Tavolo → Impostazioni → Telefono.");
  console.log("Non è un segreto da custodire: vale solo per questo locale.\n");
}

async function main() {
  if (process.argv.includes("--chiavi")) generaChiavi();
  await emettiLicenza();
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
