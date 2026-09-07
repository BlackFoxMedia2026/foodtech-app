import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { esaminaMigrazione, senzaCommenti, serraturaOccupata } from "@/lib/migration-safety";

/**
 * Il freno sulle migrazioni delle anteprime.
 *
 * Su Vercel il database delle anteprime è quello di produzione, e il build
 * esegue le migrazioni: l'anteprima di una richiesta di modifica migrava i
 * dati veri prima che nessuno avesse fuso niente. Il freno lascia passare ciò
 * che aggiunge e ferma ciò che porta via.
 *
 * Sbagliare in un verso costa un'anteprima rotta. Sbagliare nell'altro costa
 * dati cancellati, e per questo la lista pende dalla parte della prudenza.
 */

describe("cosa porta via dati", () => {
  const distruttive = [
    ['DROP TABLE "Guest";', "cancellare una tabella"],
    ['ALTER TABLE "Guest" DROP COLUMN "email";', "cancellare una colonna"],
    ['TRUNCATE TABLE "Booking";', "svuotare"],
    ['DELETE FROM "Booking" WHERE id = \'x\';', "cancellare righe"],
    ['DROP TYPE "BookingStatus";', "cancellare un tipo"],
    ['ALTER TABLE "Venue" ALTER COLUMN "name" TYPE VARCHAR(10);', "restringere un tipo"],
    ['ALTER TABLE "Guest" ALTER COLUMN "email" SET NOT NULL;', "rendere obbligatoria una colonna"],
    ['ALTER TABLE "Guest" RENAME COLUMN "email" TO "mail";', "rinominare"],
  ] as const;

  for (const [sql, cosa] of distruttive) {
    it(`ferma ${cosa}`, () => {
      expect(esaminaMigrazione(sql).distruttiva).toBe(true);
    });
  }
});

describe("cosa si può applicare anche in anteprima", () => {
  const additive = [
    ['CREATE TABLE "Nuova" ("id" TEXT NOT NULL);', "creare una tabella"],
    ['ALTER TABLE "Guest" ADD COLUMN "soprannome" TEXT;', "aggiungere una colonna"],
    ['CREATE INDEX "Guest_venueId_idx" ON "Guest"("venueId");', "creare un indice"],
    ['CREATE UNIQUE INDEX "x_key" ON "Y"("z");', "creare un indice unico"],
    [`ALTER TYPE "CampaignStatus" ADD VALUE 'SENDING';`, "aggiungere un valore a un tipo"],
    ['ALTER TABLE "A" ADD CONSTRAINT "A_b_fkey" FOREIGN KEY ("b") REFERENCES "B"("id");', "aggiungere un vincolo"],
    // Togliere un vincolo o un indice non porta via righe, ed è il modo
    // normale di rinominarli: vietarlo bloccherebbe metà delle migrazioni.
    ['ALTER TABLE "A" DROP CONSTRAINT "A_b_fkey";', "togliere un vincolo"],
    ['DROP INDEX "Guest_venueId_idx";', "togliere un indice"],
  ] as const;

  for (const [sql, cosa] of additive) {
    it(`lascia passare ${cosa}`, () => {
      expect(esaminaMigrazione(sql).distruttiva).toBe(false);
    });
  }

  it("una nota nei commenti non fa scattare il freno", () => {
    const sql = `
      -- Prima qui c'era un DROP TABLE "Vecchia": ora si aggiunge soltanto.
      /* DELETE FROM "Booking" era la versione precedente */
      ALTER TABLE "Guest" ADD COLUMN "nota" TEXT;
    `;
    expect(esaminaMigrazione(sql).distruttiva).toBe(false);
    expect(senzaCommenti(sql)).not.toContain("DROP TABLE");
  });

  it("il motivo è scritto, e non si ripete", () => {
    const verdetto = esaminaMigrazione('ALTER TABLE "A" DROP COLUMN "x"; ALTER TABLE "B" DROP COLUMN "y";');
    expect(verdetto).toEqual({ distruttiva: true, motivi: ["cancella una colonna"] });
  });
});

describe("le migrazioni di questo repo", () => {
  /**
   * Le migrazioni distruttive dichiarate, se e quando ce ne saranno.
   *
   * Questa prova fallisce appena qualcuno aggiunge una migrazione che porta
   * via dati — ed è voluto: la si mette qui a mano, e mettercela significa
   * aver deciso che quel dato si può perdere e che il codice vecchio non lo
   * usa più. Vedi prisma/migrations/README.md (aggiungi prima, togli dopo).
   */
  const DICHIARATE_DISTRUTTIVE: string[] = [
    // `Campaign.bookedCount`: colonna morta. Dentro c'erano solo lo zero del
    // default e i numeri finti del seed della demo — nessuno la scriveva — e
    // il codice aveva già smesso di dichiararla in una pubblicazione
    // precedente, così durante il deploy nessun client Prisma ha selezionato
    // una colonna appena cancellata. Vedi prisma/migrations/README.md.
    "20260907230000_via_bookedcount",
  ];

  const cartella = join(process.cwd(), "prisma", "migrations");
  const nomi = existsSync(cartella)
    ? readdirSync(cartella, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  it("ci sono migrazioni da esaminare", () => {
    expect(nomi.length).toBeGreaterThan(0);
  });

  for (const nome of nomi) {
    const file = join(cartella, nome, "migration.sql");
    if (!existsSync(file)) continue;
    it(`${nome} è additiva`, () => {
      const verdetto = esaminaMigrazione(readFileSync(file, "utf8"));
      if (DICHIARATE_DISTRUTTIVE.includes(nome)) {
        expect(verdetto.distruttiva).toBe(true);
        return;
      }
      expect(verdetto, `${nome} porta via dati: dichiarala in DICHIARATE_DISTRUTTIVE`).toEqual({
        distruttiva: false,
      });
    });
  }
});

describe("la serratura del database", () => {
  it("riconosce chi ha trovato occupato, e solo lui", () => {
    // È l'errore che ha fatto fallire una pubblicazione di produzione con il
    // database perfettamente in ordine: va aspettato il turno, non abbandonato.
    expect(
      serraturaOccupata(
        "Error: P1002\nThe database server was reached but timed out.\nContext: Timed out trying to acquire a postgres advisory lock"
      )
    ).toBe(true);
    expect(serraturaOccupata("Timed out trying to acquire a postgres advisory lock (SELECT pg_advisory_lock)")).toBe(
      true
    );
  });

  it("una migrazione scritta male non si riprova: deve fallire subito", () => {
    expect(serraturaOccupata('ERROR: relation "Guest" does not exist')).toBe(false);
    expect(serraturaOccupata("syntax error at or near ALTAR")).toBe(false);
    expect(serraturaOccupata("")).toBe(false);
  });
});
