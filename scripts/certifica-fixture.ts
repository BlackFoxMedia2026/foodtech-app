/**
 * Registra le evidenze FIXTURE di un fornitore **eseguendo davvero** le sue
 * prove automatiche. Nessuna evidenza si scrive a mano: se le prove passano,
 * ogni capacità che coprono riceve un FIXTURE PASSED; se falliscono, FAILED.
 *
 *   DATABASE_URL=… npx tsx scripts/certifica-fixture.ts tilby [--operatore nome@foodtech.it]
 *
 * Le prove usano il database di `DATABASE_URL` (quello di prova), e le
 * evidenze finiscono **nello stesso database**: su produzione si registrano
 * con la `DATABASE_URL` di produzione solo dopo averle viste passare.
 */
import { execSync } from "node:child_process";
import { registraEvidenza } from "../src/server/integrations/certificazione/evidenze";

/** Quali capacità coprono le prove di ciascun fornitore (dal contenuto delle prove, non dalle speranze). */
const PROVE: Record<string, { file: string[]; capacita: string[] }> = {
  "lightspeed-k": {
    file: ["tests/integrazioni-lightspeed.test.ts"],
    capacita: ["connection", "locations", "tables", "menu", "tax_rates", "payment_methods", "create_order", "table_association"],
  },
  "cassa-in-cloud": {
    file: ["tests/integrazioni-cassa-in-cloud.test.ts", "tests/integrazioni-cassa-in-cloud-piattaforma.test.ts"],
    capacita: ["connection", "locations", "floors", "tables", "menu", "tax_rates", "create_order", "table_association", "read_bill"],
  },
  tilby: {
    file: ["tests/integrazioni-tilby.test.ts", "tests/integrazioni-tilby-piattaforma.test.ts"],
    capacita: ["connection", "locations", "floors", "tables", "menu", "tax_rates", "payment_methods", "create_order", "table_association", "add_round", "kitchen", "read_bill", "payment"],
  },
  "oracle-simphony": {
    file: ["tests/integrazioni-oracle-simphony.test.ts", "tests/integrazioni-oracle-simphony-piattaforma.test.ts"],
    capacita: ["connection", "locations", "tables", "menu", "tax_rates", "payment_methods", "create_order", "table_association", "add_round", "read_bill", "payment"],
  },
};

function argomento(nome: string): string | null {
  const i = process.argv.indexOf(nome);
  return i > 0 ? process.argv[i + 1] ?? null : null;
}

function comando(c: string): string {
  try {
    return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const slug = process.argv[2];
  const prove = slug ? PROVE[slug] : undefined;
  if (!prove) {
    console.error(`Uso: npx tsx scripts/certifica-fixture.ts <${Object.keys(PROVE).join("|")}> [--operatore email]`);
    process.exit(2);
  }
  const operatore = argomento("--operatore") ?? (comando("git config user.email") || "prove-automatiche");
  const commit = comando("git rev-parse --short HEAD") || null;

  let riuscite = true;
  try {
    // Un comando in forma di stringa passa dalla shell: su Windows `npx` è un .cmd.
    execSync(`npx vitest run ${prove.file.join(" ")}`, { stdio: "inherit", env: process.env });
  } catch {
    riuscite = false;
  }

  for (const capacita of prove.capacita) {
    await registraEvidenza({
      slug,
      capacita,
      livello: "FIXTURE",
      esito: riuscite ? "PASSED" : "FAILED",
      venueId: "piattaforma",
      operatore,
      correlationId: commit,
      note: `Prove automatiche: ${prove.file.join(", ")}${commit ? ` (commit ${commit}, con eventuali modifiche locali)` : ""}`,
    });
  }
  console.log(`${slug}: ${prove.capacita.length} evidenze FIXTURE ${riuscite ? "PASSED" : "FAILED"} registrate.`);
  process.exit(riuscite ? 0 : 1);
}

void main();
