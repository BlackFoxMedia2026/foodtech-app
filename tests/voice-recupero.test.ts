import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createBooking } from "@/server/bookings";
import {
  ORE_VALIDITA_RECUPERO,
  apriRecupero,
  consumaRipresa,
  leggiRipresa,
  testoRecupero,
} from "@/server/voice/recupero-link";

/**
 * Riprendere una telefonata interrotta a meta.
 *
 * E il punto in cui questo prodotto e piu avanti del concorrente: di quelle
 * chiamate lui consegna al ristoratore **un elenco da scaricare**, noi
 * mandiamo un link che riapre la prenotazione con dentro quello che la persona
 * aveva gia detto.
 *
 * Quello che questi test difendono e **quello che non deve succedere**:
 *
 * - due link per la stessa telefonata, cioe due messaggi alla stessa persona;
 * - un token leggibile nel database;
 * - un link che vale due volte, o dopo la scadenza, e che quindi scrive due
 *   prenotazioni per una;
 * - un invio dichiarato «mandato» dove non c'e nessun canale per mandarlo —
 *   la bugia che si scopre solo dal cliente che non richiama;
 * - il locale o il numero presi dal corpo della richiesta invece che dal
 *   token.
 */

const db = new PrismaClient();
const PREFISSO = "test-recupero-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

const ORIGINE = "https://prova.tavolo.test";
const T0 = new Date("2026-09-19T18:00:00.000Z").getTime();

let venueId = "";
let orgId = "";
let chiamataId = "";
const ESTERNO = `${PREFISSO}call-1`;

async function chiamata(externalId: string, numero = "+393330000091") {
  return db.phoneCall.create({
    data: { venueId, externalId, fromNumber: numero, status: "ENDED", startedAt: new Date(T0) },
  });
}

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId, name: "Locale di prova", slug: unico, active: true, timezone: "Europe/Rome" },
    })
  ).id;
});

beforeEach(async () => {
  await db.voiceRecovery.deleteMany({ where: { venueId } });
  await db.phoneCall.deleteMany({ where: { venueId } });
  chiamataId = (await chiamata(ESTERNO)).id;
});

afterAll(async () => {
  await db.voiceRecovery.deleteMany({ where: { venueId } });
  await db.booking.deleteMany({ where: { venueId } });
  await db.phoneCall.deleteMany({ where: { venueId } });
  await db.guest.deleteMany({ where: { venueId } });
  await db.venue.delete({ where: { id: venueId } }).catch(() => {});
  await db.organization.delete({ where: { id: orgId } }).catch(() => {});
  await db.$disconnect();
});

describe("aprire il recupero", () => {
  it("scrive la riga, e nel database c'è l'hash del token e non il token", async () => {
    const esito = await apriRecupero(
      venueId,
      { chiamata: ESTERNO, numero: "333 0000091", persone: 4, passo: "conferma" },
      ORIGINE,
      new Date(T0),
    );

    expect(esito.link).toContain(`${ORIGINE}/riprendi/`);
    const token = esito.link.split("/").pop()!;

    const riga = await db.voiceRecovery.findFirstOrThrow({ where: { venueId } });
    expect(riga.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(riga.tokenHash).not.toBe(token);
    expect(riga.persone).toBe(4);
    expect(riga.passo).toBe("conferma");
    // Il numero si scrive in forma internazionale: e' la stessa linea.
    expect(riga.numero).toBe("+393330000091");
    expect(riga.scadeIl.getTime()).toBe(T0 + ORE_VALIDITA_RECUPERO * 3_600_000);
  });

  it("due racconti della stessa interruzione non fanno due link", async () => {
    /* Il centralino puo ripetere l'evento: una rete che ritenta, un riavvio a
       meta. Due link vogliono dire due messaggi alla stessa persona. */
    await apriRecupero(venueId, { chiamata: ESTERNO, numero: "3330000091" }, ORIGINE, new Date(T0));
    const secondo = await apriRecupero(
      venueId,
      { chiamata: ESTERNO, numero: "3330000091" },
      ORIGINE,
      new Date(T0 + 60_000),
    );

    expect(secondo.giaAperto).toBe(true);
    // E nessun link nuovo: quello vecchio non e ricostruibile, e va bene cosi.
    expect(secondo.link).toBe("");
    expect(await db.voiceRecovery.count({ where: { venueId } })).toBe(1);
  });

  it("dice che non c'è un canale per mandarlo, invece di dirsi mandato", async () => {
    /* Su questa installazione gli SMS non sono configurati, ed e la verita che
       spiega perche il cliente non ha ricevuto niente. «Mandato» sarebbe una
       bugia che si scopre solo dal cliente che non richiama. */
    const esito = await apriRecupero(
      venueId,
      { chiamata: ESTERNO, numero: "3330000091" },
      ORIGINE,
      new Date(T0),
    );
    expect(esito.invio).toBe("SENZA_CANALE");
    const riga = await db.voiceRecovery.findFirstOrThrow({ where: { venueId } });
    expect(riga.invio).toBe("SENZA_CANALE");
    expect(riga.messageLogId).toBeNull();
  });

  it("il messaggio dice da dove viene la telefonata e porta il link", () => {
    const testo = testoRecupero("Trattoria di prova", `${ORIGINE}/riprendi/abc`, "Mario");
    expect(testo).toContain("Mario");
    expect(testo).toContain("Trattoria di prova");
    expect(testo).toContain(`${ORIGINE}/riprendi/abc`);
  });
});

describe("il link che arriva", () => {
  async function apri(quando?: Date) {
    const esito = await apriRecupero(
      venueId,
      {
        chiamata: ESTERNO,
        numero: "3330000091",
        persone: 4,
        ...(quando ? { quando } : {}),
      },
      ORIGINE,
      new Date(T0),
    );
    return esito.link.split("/").pop()!;
  }

  it("apre la schermata con dentro quello che la persona aveva già detto", async () => {
    const token = await apri(new Date("2026-09-26T19:30:00.000Z"));
    const vista = await leggiRipresa(token, new Date(T0 + 60_000));
    expect(vista?.persone).toBe(4);
    expect(vista?.quando?.toISOString()).toBe("2026-09-26T19:30:00.000Z");
    expect(vista?.numero).toBe("+393330000091");
    expect(vista?.nomeLocale).toBe("Locale di prova");
  });

  it("scaduto non vale, e non dice perché", async () => {
    const token = await apri();
    const dopo = new Date(T0 + (ORE_VALIDITA_RECUPERO + 1) * 3_600_000);
    expect(await leggiRipresa(token, dopo)).toBeNull();
  });

  it("inventato non vale, e non dice se ha indovinato", async () => {
    expect(await leggiRipresa("f".repeat(64))).toBeNull();
    expect(await leggiRipresa("non-e-un-token")).toBeNull();
  });

  it("vale una volta: la seconda non apre più niente", async () => {
    const token = await apri(new Date("2026-09-26T19:30:00.000Z"));
    const prenotazione = await createBooking(
      venueId,
      {
        guest: { firstName: "Mario", phone: "+393330000091" },
        partySize: 4,
        startsAt: new Date("2026-09-26T19:30:00.000Z"),
      },
      { source: "VOICE", skipAvailabilityCheck: true, idempotencyKey: `riprendi-${token}` },
    );

    expect(await consumaRipresa(token, prenotazione.id, new Date(T0 + 60_000))).toBe(true);
    expect(await leggiRipresa(token, new Date(T0 + 120_000))).toBeNull();

    /* La prenotazione nasce **da confermare**, come quelle del risponditore:
       chi l'ha completata da se su un modulo non cambia il fatto che il locale
       non l'ha ancora vista. */
    expect(prenotazione.status).toBe("PENDING");
    expect(prenotazione.source).toBe("VOICE");
  });

  it("due richieste insieme: una sola prenotazione risulta recuperata", async () => {
    /* L'unicita e nel database e non in un controllo: due `if` che passano
       entrambi farebbero contare due recuperi per una prenotazione, e il tasso
       di recupero direbbe piu del vero. */
    const token = await apri();
    const [a, b] = await Promise.all([
      consumaRipresa(token, `finta-a-${Date.now()}`, new Date(T0 + 60_000)),
      consumaRipresa(token, `finta-b-${Date.now()}`, new Date(T0 + 60_000)),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("un recupero già convertito non si riconverte", async () => {
    const token = await apri();
    await consumaRipresa(token, `finta-${Date.now()}`, new Date(T0 + 60_000));
    expect(await consumaRipresa(token, "un-altra", new Date(T0 + 120_000))).toBe(false);
  });
});

describe("il legame con la chiamata", () => {
  it("il recupero resta attaccato alla telefonata da cui nasce", async () => {
    await apriRecupero(venueId, { chiamata: ESTERNO, numero: "3330000091" }, ORIGINE, new Date(T0));
    const riga = await db.voiceRecovery.findFirstOrThrow({ where: { venueId } });
    expect(riga.phoneCallId).toBe(chiamataId);
  });

  it("una chiamata che non conosciamo non impedisce il recupero", async () => {
    /* Il numero ce l'abbiamo comunque, ed e quello che serve per mandare il
       link: rifiutare qui vorrebbe dire perdere la prenotazione per una riga
       mancante nello storico. */
    const esito = await apriRecupero(
      venueId,
      { chiamata: "mai-vista", numero: "3330000092" },
      ORIGINE,
      new Date(T0),
    );
    expect(esito.link).toContain("/riprendi/");
    const riga = await db.voiceRecovery.findFirstOrThrow({
      where: { venueId, numero: "+393330000092" },
    });
    expect(riga.phoneCallId).toBeNull();
  });
});
