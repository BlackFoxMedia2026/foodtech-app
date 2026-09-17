/**
 * Emette, elenca e revoca i token con cui un servizio esterno parla con Tavolo.
 *
 * Esiste perché senza di lui la rotta `/api/v1/telefonia/ospite` non sarebbe
 * usabile da nessuno: sarebbe autenticazione scritta e mai raggiungibile —
 * lo stesso difetto della tabella `ApiToken` che stava nello schema senza che
 * una riga di codice la toccasse.
 *
 * Il token si vede **una volta sola**, quando lo si emette: nel database ne
 * resta solo l'impronta. Se si perde, se ne fa un altro e si revoca il vecchio.
 *
 *   npm run token:telefonia -- --locale <slug> --nome "Centralino"
 *   npm run token:telefonia -- --locale <slug> --elenca
 *   npm run token:telefonia -- --locale <slug> --revoca <id>
 *
 * Su quale database agisce lo decide `DATABASE_URL`, come per ogni altro
 * comando: emettere un token di produzione è un'operazione di produzione, e
 * va fatta sapendo di farla.
 */
import { PrismaClient } from "@prisma/client";
import { AMBITI, type Ambito } from "../src/lib/api-token-forma";
import { elencaApiToken, emettiApiToken, revocaApiToken } from "../src/server/api-token";

const db = new PrismaClient();

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1) return null;
  const valore = process.argv[i + 1];
  return valore && !valore.startsWith("--") ? valore : "";
}

function presente(nome: string): boolean {
  return process.argv.includes(`--${nome}`);
}

function uso(messaggio: string): never {
  console.error(`\n${messaggio}\n`);
  console.error("  npm run token:telefonia -- --locale <slug> --nome \"Centralino\"");
  console.error("  npm run token:telefonia -- --locale <slug> --elenca");
  console.error("  npm run token:telefonia -- --locale <slug> --revoca <id>");
  console.error(`\nAmbiti disponibili: ${AMBITI.join(", ")}`);
  console.error("Opzionali: --ambiti a,b   --scade 2027-01-31\n");
  process.exit(1);
}

function data(valore: string): Date {
  const d = new Date(`${valore}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) uso(`Data non valida: «${valore}». Usa il formato 2027-01-31.`);
  return d;
}

async function main() {
  const slug = argomento("locale");
  if (!slug) uso("Serve il locale: --locale <slug>. Nessun valore predefinito, di proposito.");

  /* Lo slug è unico **per organizzazione**, non nel mondo: due gruppi diversi
     possono avere entrambi un locale «centro». Se ne trova più di uno non si
     sceglie in silenzio: si emetterebbe il token del ristorante sbagliato. */
  const candidati = await db.venue.findMany({
    where: { slug },
    select: { id: true, name: true, org: { select: { name: true, slug: true } } },
  });
  if (candidati.length === 0) uso(`Nessun locale con slug «${slug}».`);
  if (candidati.length > 1) {
    console.error(`\nLo slug «${slug}» è di più locali. Indica l'identificativo con --id:\n`);
    for (const c of candidati) console.error(`  --id ${c.id}   ${c.name} (${c.org.name})`);
    console.error("");
    process.exit(1);
  }
  const idScelto = argomento("id");
  const locale = idScelto ? candidati.find((c) => c.id === idScelto) : candidati[0];
  if (!locale) uso(`Nessun locale «${slug}» con identificativo «${idScelto}».`);

  if (presente("elenca")) {
    const righe = await elencaApiToken(locale.id);
    console.log(`\nToken di ${locale.name} (${righe.length}):\n`);
    if (righe.length === 0) console.log("  nessuno.");
    for (const r of righe) {
      const stato = r.revocatoIl
        ? "REVOCATO"
        : r.scadeIl && r.scadeIl <= new Date()
          ? "SCADUTO"
          : "attivo";
      const uso_ = r.ultimoUso ? r.ultimoUso.toISOString().slice(0, 16).replace("T", " ") : "mai usato";
      console.log(`  ${r.id}  ${r.prefisso}  ${stato.padEnd(9)}  ${r.nome}`);
      console.log(`    ambiti: ${r.ambiti.join(", ") || "nessuno"}   ultimo uso: ${uso_}`);
    }
    console.log("");
    return;
  }

  const daRevocare = argomento("revoca");
  if (daRevocare !== null) {
    if (!daRevocare) uso("Serve l'identificativo: --revoca <id>. Lo trovi con --elenca.");
    await revocaApiToken(locale.id, daRevocare);
    console.log(`\nRevocato. Il token non apre più niente su ${locale.name}.\n`);
    return;
  }

  const nome = argomento("nome");
  if (!nome) uso("Serve un nome: --nome \"Centralino\". Serve a riconoscerlo fra sei mesi.");

  const richiesti = (argomento("ambiti") || "telefonia:read")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  const sconosciuti = richiesti.filter((a) => !(AMBITI as readonly string[]).includes(a));
  if (sconosciuti.length > 0) {
    uso(`Ambiti che non esistono: ${sconosciuti.join(", ")}. Disponibili: ${AMBITI.join(", ")}`);
  }

  const scade = argomento("scade");
  const emesso = await emettiApiToken(locale.id, {
    nome,
    ambiti: richiesti as Ambito[],
    scadeIl: scade ? data(scade) : null,
    creatoDa: "token-telefonia.ts",
  });

  console.log(`\nToken per ${locale.name} — «${nome}»`);
  console.log(`Ambiti: ${richiesti.join(", ")}${scade ? `   scade il ${scade}` : "   senza scadenza"}`);
  console.log("\n  " + emesso.token + "\n");
  console.log("Copialo adesso: non è più leggibile. Nel database c'è solo la sua impronta.");
  console.log(`Per revocarlo: npm run token:telefonia -- --locale ${slug} --revoca ${emesso.id}\n`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
