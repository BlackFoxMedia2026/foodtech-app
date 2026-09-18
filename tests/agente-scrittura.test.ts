import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { classifyIntent } from "@/server/ai/intent-router";
import { toolRegistry } from "@/server/ai/tool-registry";
import { actionExecutors } from "@/server/ai/action-executors";
import { can } from "@/lib/abilities";
import { interpretaQuando } from "@/server/ai/quando";
import type { AgentContext } from "@/server/ai/types";

/**
 * Gli strumenti dell'assistente che **scrivono**, e le tre regole.
 *
 * 1. non si dice «confermato» prima che la scrittura sia riuscita;
 * 2. la validazione si rifà al momento della scrittura, non su quello che
 *    l'anteprima aveva letto;
 * 3. quello che manca si chiede, non si inventa.
 *
 * La terza è quella che fa più danno se cede: un'ora messa da noi finisce in
 * una prenotazione vera, e nessuno saprà mai che l'abbiamo messa noi.
 */

const db = new PrismaClient();
const PREFISSO = "test-ag-scrittura-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.",
  );
}

let ctx: AgentContext;
let venueId = "";
let tavoloId = "";

function domaniAlle(ore: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(ore, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({
    data: { name: unico, slug: unico },
  });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = venue.id;
  /* Il locale ha degli orari: senza nessun turno, `checkAvailability` salta la
     domanda «è aperto?» — e una prova sulle regole passerebbe senza che ci sia
     nessuna regola da violare. */
  for (let weekday = 0; weekday < 7; weekday++) {
    await db.shift.create({
      data: {
        venueId,
        name: "Cena",
        weekday,
        startMinute: 19 * 60,
        endMinute: 23 * 60,
        capacity: 20,
      },
    });
  }
  const room = await db.room.create({ data: { venueId, name: "Sala" } });
  const t = await db.table.create({
    data: { venueId, roomId: room.id, label: "T1", seats: 4 },
  });
  tavoloId = t.id;

  ctx = {
    venueId,
    venueName: venue.name,
    venueTimezone: "Europe/Rome",
    role: "MANAGER",
    userId: "prova",
    orgId: org.id,
  };
}, 60_000);

afterEach(async () => {
  await db.auditLog.deleteMany({ where: { venueId } });
  await db.waitlistEntry.deleteMany({ where: { venueId } });
  await db.voiceCallback.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.organization.deleteMany({
    where: { slug: { startsWith: PREFISSO } },
  });
  await db.$disconnect();
});

/* -------------------------------------------------------------------------- */
/*  Regola 3: quello che manca si chiede                                      */
/* -------------------------------------------------------------------------- */

describe("quello che manca si chiede, non si inventa", () => {
  it("«prenota per 4» senza quando non scrive niente e chiede l'ora", async () => {
    const r = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi per 4",
    });
    expect(r.text).toMatch(/quando/i);
    /* Nessuna anteprima da confermare: non c'è niente da confermare, e un
       riquadro «conferma» con un'ora inventata dentro è il difetto peggiore
       che questo strumento possa avere. */
    expect(r.structured).toBeUndefined();
    expect(await db.booking.count({ where: { venueId } })).toBe(0);
  });

  it("senza quante persone chiede quante persone", async () => {
    const r = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi domani alle 20:30",
    });
    expect(r.text).toMatch(/quante persone/i);
    expect(r.structured).toBeUndefined();
  });

  it("senza nome chiede il nome", async () => {
    const r = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota per 4 domani alle 20:30",
    });
    expect(r.text).toMatch(/a nome di chi/i);
    expect(r.structured).toBeUndefined();
  });

  it("«alle 8 di sera» sono le venti, non le otto del mattino", () => {
    const q = interpretaQuando(
      "prenota a nome rossi per 2 domani alle 8 di sera",
      "Europe/Rome",
    );
    expect(q?.come).toBe("domani alle 20:00");
  });

  it("un numero in mezzo a una frase non è un'ora", () => {
    /* La prima versione prendeva il primo numero: su «2 persone il 24
       dicembre alle 21» leggeva il 2 e scriveva le 14:00. */
    const q = interpretaQuando(
      "prenota a nome rossi 2 persone il 24 dicembre alle 21",
      "Europe/Rome",
    );
    expect(q?.come).toBe("24/12 alle 21:00");
  });

  it("una frase vaga non produce un momento", () => {
    expect(
      interpretaQuando("prenota per il weekend", "Europe/Rome"),
    ).toBeNull();
    expect(interpretaQuando("prenota domani", "Europe/Rome")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  Regola 1: l'anteprima non scrive, e non dice «fatto»                      */
/* -------------------------------------------------------------------------- */

describe("l'anteprima non scrive niente", () => {
  it("costruisce la conferma e lascia il database intatto", async () => {
    const r = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi per 4 domani alle 20:30",
    });
    expect(r.structured?.type).toBe("action_confirmation");
    /* Il tempo del verbo è la regola numero uno resa leggibile: «sto per»,
       non «ho preso». Una macchina che dice «confermato» e poi non scrive è
       il modo più veloce di far perdere un tavolo. */
    expect(r.text).toMatch(/sto per/i);
    expect(r.text).not.toMatch(/\b(fatto|confermat|ho preso)/i);
    expect(await db.booking.count({ where: { venueId } })).toBe(0);
  });

  it("gli avvertimenti si leggono prima di confermare, e non bloccano", async () => {
    /* Le quattro del mattino: il locale è chiuso. L'anteprima lo **dice** —
       il controllo si fa sul canale pubblico, che applica le regole — e chi
       risponde decide. Un software che rifiuta viene aggirato con una penna. */
    const r = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi per 2 domani alle 4:00",
    });
    expect(r.text).toMatch(/attenzione/i);
    expect(r.structured?.type).toBe("action_confirmation");
  });
});

/* -------------------------------------------------------------------------- */
/*  La scrittura                                                              */
/* -------------------------------------------------------------------------- */

describe("la conferma scrive, e lo dice al passato", () => {
  it("dalla frase alla prenotazione vera", async () => {
    const anteprima = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi per 4 domani alle 20:30",
    });
    const params = (anteprima.structured as { params: Record<string, unknown> })
      .params;

    const esito = await actionExecutors.crea_prenotazione!.run(ctx, params);
    expect(esito.text).toMatch(/^Fatto/);

    const b = await db.booking.findFirstOrThrow({
      where: { venueId },
      include: { guest: true },
    });
    expect(b.partySize).toBe(4);
    expect(b.guest?.firstName).toBe("Rossi");
    expect(b.source).toBe("PHONE");
    // Presa da una persona che parla col cliente: si conferma da sé.
    expect(b.status).toBe("CONFIRMED");
  });

  it("due conferme sullo stesso riquadro fanno una prenotazione", async () => {
    const anteprima = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi per 2 domani alle 21:00",
    });
    const params = (anteprima.structured as { params: Record<string, unknown> })
      .params;

    await actionExecutors.crea_prenotazione!.run(ctx, params);
    await actionExecutors.crea_prenotazione!.run(ctx, params);

    /* Su un tablet in sala il doppio tocco è la norma. La chiave nasce con
       l'anteprima e sta su un indice unico: la seconda scrittura ritrova la
       prima invece di raddoppiarla, e lo scopre il database — non un
       controllo che due richieste in parallelo si scambierebbero senza
       vedersi. */
    expect(await db.booking.count({ where: { venueId } })).toBe(1);
  });

  it("quello che cambia fra l'anteprima e la conferma viene detto", async () => {
    const anteprima = await toolRegistry.prenota!.run(ctx, {
      frase: "prenota a nome rossi per 2 domani alle 20:00",
    });
    const params = (anteprima.structured as { params: Record<string, unknown> })
      .params;
    // L'anteprima non aveva niente da segnalare: il turno era libero.
    expect(params.avvisati).toEqual([]);

    /* Fra l'anteprima e la conferma il turno si riempie: è il caso del §69
       tradotto in quello che può succedere davvero qui — due telefonate dello
       stesso sabato, e la seconda conferma arriva su un turno pieno. */
    const ospite = await db.guest.create({
      data: { venueId, firstName: "Gruppo", lastName: "Grosso" },
    });
    await db.booking.create({
      data: {
        venueId,
        guestId: ospite.id,
        partySize: 20,
        /* L'istante viene dall'anteprima, non da `domaniAlle(20)`: quello usa
           il fuso della **macchina**, e su una macchina a UTC le due
           prenotazioni cadrebbero a due ore di distanza — non si
           sovrapporrebbero, il turno non risulterebbe pieno, e questa prova
           passerebbe in Italia per poi non provare niente in CI. */
        startsAt: new Date(params.quando as string),
        durationMin: 120,
        status: "CONFIRMED",
        source: "PHONE",
        reference: `X${Date.now().toString().slice(-6)}`,
      },
    });

    const esito = await actionExecutors.crea_prenotazione!.run(ctx, params);
    /* Si scrive **comunque** — chi ha confermato sta parlando con una persona,
       e un software che gli dice no viene aggirato con una penna — ma quello
       che è cambiato si legge. Senza questa riga l'unico modo di accorgersene
       sarebbe riaprire la prenotazione. */
    expect(esito.text).toMatch(/^Fatto/);
    expect(esito.text).toMatch(/nel frattempo/i);
    expect(await db.booking.count({ where: { venueId } })).toBe(2);
  });

  it("in lista d'attesa e fra le richiamate", async () => {
    const attesa = await toolRegistry.metti_in_attesa!.run(ctx, {
      frase: "metti in attesa a nome bianchi per 3",
    });
    await actionExecutors.metti_in_attesa!.run(
      ctx,
      (attesa.structured as { params: Record<string, unknown> }).params,
    );
    expect(await db.waitlistEntry.count({ where: { venueId } })).toBe(1);

    const richiamata = await toolRegistry.crea_richiamata!.run(ctx, {
      frase: "da richiamare il 347 1234567",
    });
    await actionExecutors.crea_richiamata!.run(
      ctx,
      (richiamata.structured as { params: Record<string, unknown> }).params,
    );
    const coda = await db.voiceCallback.findFirstOrThrow({
      where: { venueId },
    });
    expect(coda.numero).toBe("+393471234567");
  });
});

/* -------------------------------------------------------------------------- */
/*  I permessi                                                                */
/* -------------------------------------------------------------------------- */

describe("gli esecutori hanno un permesso, e non è «essere del locale»", () => {
  it("ogni esecutore dichiara una capacità che la sola lettura non ha", () => {
    /* Il difetto corretto in questa fase: la rotta di conferma chiedeva solo
       di essere membri del locale, quindi un accesso in sola lettura scriveva
       passando per l'assistente — mentre la schermata che fa la stessa cosa
       chiede un permesso. */
    for (const [nome, esecutore] of Object.entries(actionExecutors)) {
      expect(
        esecutore.ability,
        `l'esecutore ${nome} non ha capacità`,
      ).toBeTruthy();
      expect(can("READ_ONLY", esecutore.ability!)).toBe(false);
    }
  });

  it("assegnare un cameriere chiede lo stesso permesso della sua schermata", () => {
    expect(actionExecutors.assign_waiter!.ability).toBe("manage_staff");
  });

  it("gli strumenti che scrivono chiedono il permesso della loro schermata", () => {
    expect(toolRegistry.prenota!.ability).toBe("manage_bookings");
    expect(toolRegistry.crea_richiamata!.ability).toBe("use_phone");
  });
});

describe("il router riconosce i verbi che scrivono", () => {
  it("«prenota…» va allo strumento e porta la frase intera", () => {
    const m = classifyIntent("Prenota a nome Rossi per 4 domani alle 20:30");
    expect(m).toMatchObject({ kind: "internal", intent: "prenota" });
    expect(
      (m as unknown as { params: { frase: string } }).params.frase,
    ).toContain("rossi");
  });

  it("«quante prenotazioni oggi» resta una domanda", () => {
    const m = classifyIntent("quante prenotazioni ci sono oggi?");
    expect(m).toMatchObject({ intent: "get_today_reservations" });
  });
});
