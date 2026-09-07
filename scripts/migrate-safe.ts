/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { esaminaMigrazione, serraturaOccupata } from "../src/lib/migration-safety";

/**
 * Applica le migrazioni, con un freno per le anteprime.
 *
 * Su Vercel il database è lo stesso per produzione e anteprime, e il build
 * esegue le migrazioni: quindi **l'anteprima di una richiesta di modifica
 * migrava il database di produzione**, prima che nessuno avesse fuso niente.
 * Scoperto il 7 settembre 2026, quando le migrazioni delle fasi 0-4 erano già
 * tutte in produzione senza che nessuno le avesse pubblicate.
 *
 * La regola: una pubblicazione vera applica tutto; un'anteprima applica solo
 * migrazioni che **aggiungono**. Se fra quelle in attesa ce n'è una che porta
 * via dati, l'anteprima non ne applica nessuna e lo scrive nel registro del
 * build. Il codice nuovo lì potrà rompersi — un'anteprima rotta si vede e si
 * aggiusta, dati cancellati no.
 *
 * La soluzione definitiva è un database separato per le anteprime. Questo è il
 * freno che serve finché non c'è.
 */

const CARTELLA = join(process.cwd(), "prisma", "migrations");

function migrazioniSuDisco(): string[] {
  if (!existsSync(CARTELLA)) return [];
  return readdirSync(CARTELLA, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

async function migrazioniApplicate(): Promise<Set<string>> {
  const db = new PrismaClient();
  try {
    const righe = await db.$queryRawUnsafe<{ migration_name: string }[]>(
      `select migration_name from "_prisma_migrations" where finished_at is not null`
    );
    return new Set(righe.map((r) => r.migration_name));
  } catch {
    // La tabella non esiste ancora: database nuovo, nessuna applicata.
    return new Set();
  } finally {
    await db.$disconnect();
  }
}

/** Quante volte riprovare quando la serratura del database è occupata. */
const TENTATIVI = 5;
const ATTESA_MS = 12_000;

/**
 * Applica le migrazioni, aspettando il proprio turno.
 *
 * `prisma migrate deploy` prende una serratura sul database (un *advisory
 * lock*) e dopo dieci secondi rinuncia. Su Vercel due build si sovrappongono
 * spesso — l'anteprima di una richiesta e la pubblicazione della stessa
 * fusione — e quella che arriva seconda **falliva il build**. È successo due
 * volte in un giorno: la prima ha messo un segno rosso su una richiesta, la
 * seconda ha fatto fallire una pubblicazione di produzione per un motivo che
 * non aveva niente a che vedere col codice.
 *
 * Aspettare è la risposta giusta: la serratura serve proprio a mettere in fila
 * chi migra, e chi è in fila deve attendere, non morire. Si riprova solo su
 * quell'errore: una migrazione scritta male deve fallire subito e forte.
 */
function applica() {
  for (let tentativo = 1; tentativo <= TENTATIVI; tentativo++) {
    try {
      const esito = execFileSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8" });
      console.log(esito.trim());
      return;
    } catch (err) {
      // Tutti e tre insieme: Prisma scrive il motivo su stderr, e leggere solo
      // stdout significherebbe non riconoscere mai la serratura occupata.
      const e = err as { stdout?: string; stderr?: string; message?: string };
      const testo = [e.stdout, e.stderr, e.message].filter(Boolean).join("\n");
      if (!serraturaOccupata(testo) || tentativo === TENTATIVI) {
        console.error(testo);
        throw err;
      }
      console.warn(
        `[migrazioni] il database è occupato da un'altra pubblicazione (tentativo ${tentativo}/${TENTATIVI}): aspetto ${
          ATTESA_MS / 1000
        }s.`
      );
      // Attesa sincrona: siamo in uno script di build, non c'è nient'altro da fare.
      execFileSync("sleep", [String(ATTESA_MS / 1000)]);
    }
  }
}

async function main() {
  const ambiente = process.env.VERCEL_ENV;

  const applicate = await migrazioniApplicate();
  const inAttesa = migrazioniSuDisco().filter((m) => !applicate.has(m));

  /**
   * Se non c'è niente da applicare non si chiama `migrate deploy`.
   *
   * Sembra un dettaglio e non lo è: anche senza niente da fare quel comando
   * prende la serratura del database, e due build che si sovrappongono si
   * bloccavano a vicenda per un lavoro che non c'era. È così che una
   * pubblicazione di produzione è fallita con il database perfettamente in
   * ordine.
   */
  if (inAttesa.length === 0) {
    console.log("[migrazioni] niente da applicare.");
    return;
  }

  // Fuori da Vercel (in locale, o a mano) e in produzione: si applica tutto.
  if (!ambiente || ambiente === "production") {
    console.log(`[migrazioni] ${inAttesa.length} da applicare.`);
    applica();
    return;
  }

  const pericolose = inAttesa
    .map((nome) => {
      const file = join(CARTELLA, nome, "migration.sql");
      if (!existsSync(file)) return null;
      const verdetto = esaminaMigrazione(readFileSync(file, "utf8"));
      return verdetto.distruttiva ? { nome, motivi: verdetto.motivi } : null;
    })
    .filter((x): x is { nome: string; motivi: string[] } => x !== null);

  if (pericolose.length === 0) {
    console.log(`[migrazioni] ${inAttesa.length} in attesa, tutte additive: le applico.`);
    applica();
    return;
  }

  console.warn("");
  console.warn("═══════════════════════════════════════════════════════════════");
  console.warn(`  ANTEPRIMA (${ambiente}): NON applico le migrazioni.`);
  console.warn("");
  for (const p of pericolose) {
    console.warn(`  · ${p.nome} — ${p.motivi.join(", ")}`);
  }
  console.warn("");
  console.warn("  Il database delle anteprime è quello di produzione: una");
  console.warn("  migrazione che porta via dati la applica solo una");
  console.warn("  pubblicazione vera. Questa anteprima gira sullo schema");
  console.warn("  attuale, quindi le parti nuove possono non funzionare.");
  console.warn("═══════════════════════════════════════════════════════════════");
  console.warn("");
  // Si esce bene: l'anteprima si costruisce comunque, e il resto della
  // modifica si può guardare.
}

main().catch((err) => {
  console.error("[migrazioni] non riuscito:", err);
  process.exit(1);
});
