import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  SenzaOspiteError,
  approvaInsight,
  ignoraInsight,
  insightDaApprovare,
  proponiInsight,
} from "@/server/voice/insight";
import { registraEventoChiamata } from "@/server/chiamate";

/**
 * Le informazioni che emergono al telefono, da approvare.
 *
 * La regola che questi test difendono è una sola, e viene dal brief: **niente
 * si scrive nel profilo di un ospite senza approvazione umana**. Vale oggi,
 * che le frasi le scrive una persona, e varrà di più domani, quando le
 * proporrà un risponditore che ha *sentito* «celiaca» in una frase in cui
 * c'era «celiaco mio cognato».
 */

const db = new PrismaClient();
const PREFISSO = "test-insight-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let venueId = "";
let altroVenueId = "";
let ospiteId = "";

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
}, 60_000);

afterEach(async () => {
  await db.voiceCRMInsight.deleteMany({
    where: { venueId: { in: [venueId, altroVenueId] } },
  });
  await db.phoneCallEvent.deleteMany({
    where: { call: { venueId: { in: [venueId, altroVenueId] } } },
  });
  await db.phoneCall.deleteMany({
    where: { venueId: { in: [venueId, altroVenueId] } },
  });
  await db.guest.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

/** Una chiamata con un ospite riconosciuto, come quella di ogni sera. */
async function chiamataConOspite(dati?: {
  allergie?: string;
  note?: string;
  preferenze?: unknown;
}) {
  const g = await db.guest.create({
    data: {
      venueId,
      firstName: "Marta",
      lastName: "Bianchi",
      phone: "+393471112222",
      allergies: dati?.allergie ?? null,
      privateNotes: dati?.note ?? null,
      preferences: (dati?.preferenze ?? null) as never,
    },
  });
  ospiteId = g.id;
  const c = await registraEventoChiamata(venueId, {
    externalId: `${PREFISSO}${Math.random()}`,
    phone: "+393471112222",
    stato: "ENDED",
  });
  return c.id;
}

describe("proporre non è scrivere", () => {
  it("la proposta non tocca la scheda", async () => {
    const callId = await chiamataConOspite();
    await proponiInsight(
      venueId,
      callId,
      { tipo: "allergia", valore: "celiaca" },
      "sala@locale.it",
    );

    /* Il punto di tutta la fase: nella scheda non c'è **niente** finché
       qualcuno non guarda. */
    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { allergies: true },
    });
    expect(g.allergies).toBeNull();

    const attesa = await insightDaApprovare(venueId);
    expect(attesa).toHaveLength(1);
    expect(attesa[0]?.ospite?.nome).toBe("Marta Bianchi");
  });

  it("resta l'evento sulla chiamata: chi l'ha scritta e quando", async () => {
    const callId = await chiamataConOspite();
    await proponiInsight(
      venueId,
      callId,
      { tipo: "nota", valore: "chiama per il padre" },
      "anna@locale.it",
    );
    const eventi = await db.phoneCallEvent.findMany({ where: { callId } });
    const e = eventi.find((x) => x.kind === "CRM_INSIGHT_CREATED");
    expect(e?.actor).toBe("anna@locale.it");
  });

  it("la chiamata di un altro locale non esiste", async () => {
    const callId = await chiamataConOspite();
    await expect(
      proponiInsight(altroVenueId, callId, { tipo: "nota", valore: "x" }),
    ).rejects.toThrowError("not_found");
  });
});

describe("approvare scrive, e si accoda", () => {
  it("un'allergia entra fra le allergie", async () => {
    const callId = await chiamataConOspite();
    const p = await proponiInsight(venueId, callId, {
      tipo: "allergia",
      valore: "celiaca",
    });
    await approvaInsight(venueId, p.id, "anna@locale.it");

    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { allergies: true },
    });
    expect(g.allergies).toBe("celiaca");

    const riga = await db.voiceCRMInsight.findUniqueOrThrow({
      where: { id: p.id },
      select: { stato: true, decisoDa: true, decisoIl: true },
    });
    expect(riga.stato).toBe("SAVED");
    expect(riga.decisoDa).toBe("anna@locale.it");
    expect(riga.decisoIl).not.toBeNull();
  });

  it("non cancella quello che c'era", async () => {
    const callId = await chiamataConOspite({ allergie: "arachidi" });
    const p = await proponiInsight(venueId, callId, {
      tipo: "allergia",
      valore: "lattosio",
    });
    await approvaInsight(venueId, p.id);

    /* Una scrittura che sostituisce il campo farebbe sparire «arachidi» il
       giorno in cui qualcuno approva «lattosio», e la differenza si
       scoprirebbe in cucina. */
    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { allergies: true },
    });
    expect(g.allergies).toBe("arachidi · lattosio");
  });

  it("la stessa frase due volte non si accoda due volte", async () => {
    const callId = await chiamataConOspite({ allergie: "celiaca" });
    const p = await proponiInsight(venueId, callId, {
      tipo: "allergia",
      valore: "Celiaca",
    });
    await approvaInsight(venueId, p.id);
    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { allergies: true },
    });
    /* «celiaca · Celiaca» nella riga che in sala si legge di corsa è peggio di
       niente. */
    expect(g.allergies).toBe("celiaca");
  });

  it("una preferenza entra nelle preferenze, senza toccare il resto", async () => {
    const callId = await chiamataConOspite({
      preferenze: { note: "vino rosso", altro: "tenere" },
    });
    const p = await proponiInsight(venueId, callId, {
      tipo: "preferenza",
      valore: "tavolo in fondo",
    });
    await approvaInsight(venueId, p.id);

    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { preferences: true },
    });
    expect(g.preferences).toEqual({
      note: "vino rosso · tavolo in fondo",
      altro: "tenere",
    });
  });

  it("un tipo che non conosciamo finisce nelle note, non si perde", async () => {
    const callId = await chiamataConOspite();
    /* Una riga scritta da una versione futura, o vecchia: perderla sarebbe
       peggio che metterla nel posto dove non fa danni. */
    const riga = await db.voiceCRMInsight.create({
      data: {
        venueId,
        callId,
        guestId: ospiteId,
        tipo: "occasione",
        valore: "anniversario",
      },
      select: { id: true },
    });
    await approvaInsight(venueId, riga.id);
    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { privateNotes: true },
    });
    expect(g.privateNotes).toBe("anniversario");
  });

  it("senza una scheda non si può approvare, e lo dice", async () => {
    /* Non è un limite tecnico: non esiste nessun posto dove scrivere
       l'allergia di un numero di telefono. */
    const c = await registraEventoChiamata(venueId, {
      externalId: `${PREFISSO}${Math.random()}`,
      phone: "+393479998888",
      stato: "ENDED",
    });
    const p = await proponiInsight(venueId, c.id, {
      tipo: "allergia",
      valore: "celiaca",
    });
    await expect(approvaInsight(venueId, p.id)).rejects.toThrow(
      SenzaOspiteError,
    );
    expect(
      (
        await db.voiceCRMInsight.findUniqueOrThrow({
          where: { id: p.id },
          select: { stato: true },
        })
      ).stato,
    ).toBe("PENDING");
  });

  it("approvata due volte non scrive due volte", async () => {
    const callId = await chiamataConOspite();
    const p = await proponiInsight(venueId, callId, {
      tipo: "nota",
      valore: "chiama per il padre",
    });
    await approvaInsight(venueId, p.id, "anna@locale.it");
    await approvaInsight(venueId, p.id, "secondo@locale.it");

    const g = await db.guest.findUniqueOrThrow({
      where: { id: ospiteId },
      select: { privateNotes: true },
    });
    expect(g.privateNotes).toBe("chiama per il padre");
    /* E la firma resta del primo: due persone che premono insieme non devono
       cambiarsi la decisione a vicenda. */
    const riga = await db.voiceCRMInsight.findUniqueOrThrow({
      where: { id: p.id },
      select: { decisoDa: true },
    });
    expect(riga.decisoDa).toBe("anna@locale.it");
  });

  it("«no» è una decisione e resta scritta", async () => {
    const callId = await chiamataConOspite();
    const p = await proponiInsight(venueId, callId, {
      tipo: "nota",
      valore: "voleva lamentarsi",
    });
    await ignoraInsight(venueId, p.id, "anna@locale.it");

    const riga = await db.voiceCRMInsight.findUniqueOrThrow({
      where: { id: p.id },
      select: { stato: true, decisoDa: true },
    });
    expect(riga.stato).toBe("IGNORED");
    expect(riga.decisoDa).toBe("anna@locale.it");
    expect(await insightDaApprovare(venueId)).toHaveLength(0);
  });

  it("la proposta di un altro locale non si approva", async () => {
    const callId = await chiamataConOspite();
    const p = await proponiInsight(venueId, callId, {
      tipo: "nota",
      valore: "x",
    });
    await expect(approvaInsight(altroVenueId, p.id)).rejects.toThrowError(
      "not_found",
    );
  });
});
