import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  aggiornaRisposta,
  cercaRisposte,
  creaRisposta,
  eliminaRisposta,
  risposteDelLocale,
} from "@/server/voice/conoscenza";
import { classifyIntent } from "@/server/ai/intent-router";
import { toolRegistry } from "@/server/ai/tool-registry";
import type { AgentContext } from "@/server/ai/types";

/**
 * Le risposte che il telefono deve dare.
 *
 * Il valore di questa tabella sta in una cosa sola: che la risposta **si
 * trovi** mentre una persona aspetta in linea. Una risposta scritta e non
 * trovata è peggio di una non scritta, perché si è pagato il lavoro di
 * scriverla.
 */

const db = new PrismaClient();
const PREFISSO = "test-conoscenza-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";
let altroVenueId = "";
let ctx: AgentContext;

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
  const altro = await db.venue.create({
    data: {
      orgId: org.id,
      name: `${unico}-2`,
      slug: `${unico}-2`,
      timezone: "Europe/Rome",
    },
  });
  altroVenueId = altro.id;
  ctx = {
    venueId,
    venueName: v.name,
    venueTimezone: "Europe/Rome",
    role: "MANAGER",
    userId: "prova",
    orgId: org.id,
  };
}, 60_000);

afterEach(async () => {
  await db.voiceKnowledgeItem.deleteMany({
    where: { venueId: { in: [venueId, altroVenueId] } },
  });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

async function ilCane() {
  return creaRisposta(venueId, {
    categoria: "ANIMALI",
    argomenti: ["cane", "cani", "animali"],
    risposta: "I cani sono benvenuti nel dehors, in sala solo i cani guida.",
  });
}

describe("cercare una risposta", () => {
  it("si trova con la parola che usa chi chiama, non con quella della categoria", async () => {
    await ilCane();
    /* Il punto di tutto: chi cerca al telefono scrive «cane», non «animali
       domestici». Senza gli argomenti la risposta c'è e non si trova. */
    const trovate = await cercaRisposte(venueId, "posso portare il cane?");
    expect(trovate).toHaveLength(1);
    expect(trovate[0]?.risposta).toContain("dehors");
  });

  it("le parole di servizio non fanno trovare tutto", async () => {
    await ilCane();
    /* «si può» sta in ogni domanda: se contasse, qualunque domanda
       restituirebbe qualunque risposta — e chi legge al telefono si fiderebbe
       della prima. */
    expect(await cercaRisposte(venueId, "si può")).toHaveLength(0);
  });

  it("quello che non è scritto non si inventa", async () => {
    await ilCane();
    expect(await cercaRisposte(venueId, "avete il karaoke?")).toHaveLength(0);
  });

  it("una risposta spenta non si trova", async () => {
    const r = await ilCane();
    await aggiornaRisposta(venueId, r.id, { attivo: false });
    /* «Il dehors è aperto» vale da aprile a ottobre: spenta resta scritta con
       le sue parole, e a novembre non la si legge al telefono. */
    expect(await cercaRisposte(venueId, "cane")).toHaveLength(0);
    expect(await risposteDelLocale(venueId)).toHaveLength(1);
  });

  it("le risposte di un altro locale non si leggono", async () => {
    await ilCane();
    expect(await cercaRisposte(altroVenueId, "cane")).toHaveLength(0);
  });

  it("gli argomenti si ripuliscono: doppioni e spazi non contano", async () => {
    const r = await creaRisposta(venueId, {
      categoria: "PARCHEGGIO",
      argomenti: [" parcheggio ", "Parcheggio", "posteggio", ""],
      risposta: "C'è un parcheggio gratuito dietro il locale.",
    });
    const riga = await db.voiceKnowledgeItem.findUniqueOrThrow({
      where: { id: r.id },
      select: { argomenti: true },
    });
    expect(riga.argomenti).toEqual(["parcheggio", "posteggio"]);
  });

  it("la risposta di un altro locale non si modifica né si cancella", async () => {
    const r = await ilCane();
    await expect(
      aggiornaRisposta(altroVenueId, r.id, { risposta: "No." }),
    ).rejects.toThrowError("not_found");
    await expect(eliminaRisposta(altroVenueId, r.id)).rejects.toThrowError(
      "not_found",
    );
  });
});

describe("l'assistente legge le risposte del locale", () => {
  it("«cosa rispondo per il cane» dà la frase scritta dal locale", async () => {
    await ilCane();
    const r = await toolRegistry.cosa_rispondo!.run(ctx, {
      frase: "cosa rispondo a chi chiede del cane?",
    });
    expect(r.text).toContain("dehors");
  });

  it("quando non c'è scritto lo dice, e non inventa", async () => {
    const r = await toolRegistry.cosa_rispondo!.run(ctx, {
      frase: "cosa rispondo per il karaoke?",
    });
    /* Un modello che immagina gli orari di Pasqua fa dire al telefono una cosa
       falsa **con la voce del ristorante**. */
    expect(r.text).toMatch(/non è scritto/i);
    expect(r.text).toMatch(/faccio verificare/i);
  });

  it("serve il permesso del telefono, non quello delle prenotazioni", () => {
    expect(toolRegistry.cosa_rispondo!.ability).toBe("use_phone");
  });

  it("«cosa rispondo a chi vuole prenotare» non prende una prenotazione", () => {
    /* La regola sta prima di «prenota» di proposito: un'anteprima di
       prenotazione al posto di una risposta è il modo peggiore di sbagliare,
       perché somiglia a quello giusto. */
    const m = classifyIntent("cosa rispondo a chi vuole prenotare per venti?");
    expect(m).toMatchObject({ intent: "cosa_rispondo" });
  });
});
