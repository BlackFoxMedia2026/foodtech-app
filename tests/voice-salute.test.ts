import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { saluteVoice } from "@/server/voice/salute";
import { emettiApiToken, revocaApiToken } from "@/server/api-token";
import { registraEventoChiamata } from "@/server/chiamate";

/**
 * «Non mi arrivano le chiamate.»
 *
 * È la telefonata che arriva al supporto, ed è sempre una di tre cose: licenza
 * scaduta, nessuna chiave di collegamento, o nessuno ha chiamato. Le ultime
 * due si presentano identiche — una pagina del telefono vuota — e fin qui si
 * distinguevano solo leggendo i registri del server.
 */

const db = new PrismaClient();
const PREFISSO = "test-salute-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
}, 60_000);

afterEach(async () => {
  await db.apiToken.deleteMany({ where: { venueId } });
  await db.phoneCallEvent.deleteMany({ where: { call: { venueId } } });
  await db.phoneCall.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

describe("lo stato del telefono", () => {
  it("senza chiave di collegamento lo dice: il centralino non può mandare niente", async () => {
    const s = await saluteVoice(venueId);
    expect(s.collegamentoAttivo).toBe(false);
    expect(s.ultimaChiamata).toBeNull();
    expect(s.ultime24h).toBe(0);
  });

  it("con una chiave viva è pronto", async () => {
    await emettiApiToken(venueId, {
      nome: "Centralino",
      ambiti: ["telefonia:write"],
    });
    const s = await saluteVoice(venueId);
    expect(s.collegamentoAttivo).toBe(true);
  });

  it("una chiave revocata non conta", async () => {
    const t = await emettiApiToken(venueId, {
      nome: "Centralino",
      ambiti: ["telefonia:write"],
    });
    await revocaApiToken(venueId, t.id);
    /* Il caso che conta: la chiave c'era, è stata revocata, e da quel momento
       non arriva più niente. Se qui si leggesse «pronto» la schermata
       dell'assistenza direbbe la cosa sbagliata proprio nel momento in cui
       serve. */
    const s = await saluteVoice(venueId);
    expect(s.collegamentoAttivo).toBe(false);
  });

  /* Non c'è una prova per «una chiave di un'altra integrazione non conta»:
     oggi gli ambiti emettibili sono **solo** quelli della telefonia, e il tipo
     non ne accetta altri. Il filtro sugli ambiti in `saluteVoice` resta
     perché il giorno che ne esistesse un altro — un POS, un gestionale di
     magazzino — una sua chiave non deve far dire «telefono pronto». Scriverne
     la prova oggi vorrebbe dire inventare un ambito che non esiste. */

  it("dice quando è arrivata l'ultima chiamata, e quante in un giorno", async () => {
    await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}1`,
      phone: "+393471110000",
      stato: "MISSED",
    });
    const vecchia = await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}2`,
      phone: "+393471110001",
      stato: "MISSED",
    });
    await db.phoneCall.update({
      where: { id: vecchia.id },
      data: { startedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000) },
    });

    const s = await saluteVoice(venueId);
    expect(s.ultime24h).toBe(1);
    expect(s.ultimaChiamata).not.toBeNull();
  });

  it("dice cosa la linea non sa fare: è la risposta a «perché non posso trasferire?»", async () => {
    const s = await saluteVoice(venueId);
    /* I pulsanti che non funzionerebbero non esistono da nessuna parte — è la
       regola di Voice — e senza questa riga la loro assenza sembrerebbe un
       difetto del prodotto invece di un limite della linea. */
    expect(s.sannoFare).toContain("Riceve le chiamate");
    expect(s.nonSannoFare).toContain("Trasferisce");
    expect(s.fornitore).toBeTruthy();
  });

  it("le chiamate di un altro locale non entrano in questo stato", async () => {
    await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}mio`,
      phone: "+393471110000",
      stato: "MISSED",
    });
    const s = await saluteVoice("un-altro-locale");
    expect(s.ultime24h).toBe(0);
    expect(s.ultimaChiamata).toBeNull();
  });
});
