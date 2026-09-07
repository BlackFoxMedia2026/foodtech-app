/* eslint-disable no-console */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { esaminaMigrazione } from "../src/lib/migration-safety";

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

function applica() {
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
}

async function main() {
  const ambiente = process.env.VERCEL_ENV;

  // Fuori da Vercel (in locale, o a mano) chi lancia il comando sa cosa sta
  // facendo: nessun freno.
  if (!ambiente || ambiente === "production") {
    applica();
    return;
  }

  const applicate = await migrazioniApplicate();
  const inAttesa = migrazioniSuDisco().filter((m) => !applicate.has(m));

  if (inAttesa.length === 0) {
    console.log("[migrazioni] niente da applicare.");
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
