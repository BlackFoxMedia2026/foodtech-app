import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Lo schema di Tavolo Voice, provato contro il database.
 *
 * Non sono test di logica: la fase 1 non ne ha. Sono la prova che le tabelle
 * **esistono, si scrivono e si legano** — e la ragione per cui servono è quello
 * che ho trovato nell'audit: tre tabelle per la telefonia nello schema dal
 * primo giorno, che nessuno ha mai scritto né letto, e che sembravano vive.
 *
 * Una tabella senza un test che la scrive è una tabella che potrebbe non
 * funzionare, e nessuno lo saprebbe fino al giorno in cui serve.
 */

const db = new PrismaClient();
const PREFISSO = "test-voice-schema-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let guestId = "";
let callId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
  guestId = (
    await db.guest.create({
      data: { venueId, firstName: "Chi", lastName: "Chiama", phone: "+393331112233" },
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("la linea del locale", () => {
  it("un numero appartiene a un locale, e lo stesso numero non sta su due fornitori", async () => {
    const n = await db.voiceNumber.create({
      data: {
        venueId,
        fornitore: "blackfox",
        numeroEsterno: "+390110000001",
        etichetta: "Il numero sul menu",
      },
    });
    expect(n.attivo).toBe(true);

    /* `(fornitore, numeroEsterno)` unico: lo stesso numero censito due volte
       farebbe arrivare le chiamate a due locali. */
    await expect(
      db.voiceNumber.create({
        data: { venueId, fornitore: "blackfox", numeroEsterno: "+390110000001" },
      }),
    ).rejects.toThrow();
  });
});

describe("la chiamata, con i campi nuovi", () => {
  it("nasce entrante, senza esito e senza chi l'ha gestita", async () => {
    const linea = await db.voiceNumber.create({
      data: { venueId, fornitore: "blackfox", numeroEsterno: "+390110000002" },
    });
    const c = await db.phoneCall.create({
      data: {
        venueId,
        externalId: "schema-1",
        fromNumber: "+393331112233",
        toNumber: "+390110000002",
        voiceNumberId: linea.id,
        guestId,
      },
    });
    callId = c.id;

    expect(c.direction).toBe("INBOUND");
    expect(c.handler).toBe("NONE");
    /* Nullo mentre è in corso: «non si sa ancora» è diverso da «niente da
       fare», e sono due righe diverse nello storico. */
    expect(c.outcome).toBeNull();
  });

  it("l'esito è un elenco chiuso, e una parola inventata non entra", async () => {
    await db.phoneCall.update({ where: { id: callId }, data: { outcome: "BOOKING_CREATED" } });
    const dopo = await db.phoneCall.findUniqueOrThrow({ where: { id: callId } });
    expect(dopo.outcome).toBe("BOOKING_CREATED");

    await expect(
      db.$executeRawUnsafe(
        `UPDATE "PhoneCall" SET "outcome" = 'PRENOTATO' WHERE "id" = '${callId}'`,
      ),
    ).rejects.toThrow();
  });

  it("gli stati nuovi ci sono: in attesa, segreteria, guasto", async () => {
    for (const stato of ["HELD", "VOICEMAIL", "FAILED"] as const) {
      const r = await db.phoneCall.update({ where: { id: callId }, data: { status: stato } });
      expect(r.status).toBe(stato);
    }
  });
});

describe("gli eventi della chiamata", () => {
  it("si scrivono in ordine e dicono chi li ha provocati", async () => {
    await db.phoneCallEvent.create({
      data: { callId, kind: "CALL_RECEIVED", actor: "system" },
    });
    await db.phoneCallEvent.create({
      data: { callId, kind: "BOOKING_CREATED", actor: "ai", meta: { persone: 4 } },
    });
    const eventi = await db.phoneCallEvent.findMany({
      where: { callId },
      orderBy: { createdAt: "asc" },
    });
    expect(eventi).toHaveLength(2);
    expect(eventi[0]?.kind).toBe("CALL_RECEIVED");
    // L'attore è testo e non una relazione: può non essere una persona.
    expect(eventi[1]?.actor).toBe("ai");
  });

  it("cancellando la chiamata se ne vanno anche gli eventi", async () => {
    const c = await db.phoneCall.create({
      data: { venueId, externalId: "schema-cascata", fromNumber: "+393330000000" },
    });
    await db.phoneCallEvent.create({ data: { callId: c.id, kind: "CALL_RECEIVED" } });
    await db.phoneCall.delete({ where: { id: c.id } });
    expect(await db.phoneCallEvent.count({ where: { callId: c.id } })).toBe(0);
  });
});

describe("registrazione e trascrizione", () => {
  it("una per chiamata, e con una scadenza propria", async () => {
    const scade = new Date(Date.now() + 30 * 86_400_000);
    await db.phoneCallRecording.create({
      data: { callId, url: "https://esempio.test/r.mp3", durationSec: 134, expiresAt: scade },
    });
    /* Unica per chiamata: due registrazioni della stessa telefonata non
       vogliono dire niente, e la seconda sovrascriverebbe in silenzio. */
    await expect(
      db.phoneCallRecording.create({ data: { callId, url: "https://esempio.test/altra.mp3" } }),
    ).rejects.toThrow();
  });

  it("la trascrizione sta in una tabella a parte, non sulla riga della chiamata", async () => {
    await db.phoneCallTranscript.create({
      data: { callId, testo: "Buonasera, vorrei prenotare…", lingua: "it" },
    });
    /* La prova che conta: leggendo la chiamata **non** si scarica il testo.
       Su `PhoneCall` un testo lungo verrebbe con ogni lettura dello storico. */
    const c = await db.phoneCall.findUniqueOrThrow({ where: { id: callId } });
    expect(Object.keys(c)).not.toContain("testo");
  });
});

describe("la configurazione del telefono", () => {
  it("una per locale, e nasce senza nessuna macchina che parla", async () => {
    const cfg = await db.voiceConfiguration.create({ data: { venueId } });
    /* `HUMAN_ONLY` per difetto, e non `AI_FIRST`: nessuna macchina parla con i
       clienti di nessuno senza che qualcuno l'abbia deciso. */
    expect(cfg.modalita).toBe("HUMAN_ONLY");
    expect(cfg.recuperoPerseAttivo).toBe(false);
    expect(cfg.registrazioniAttive).toBe(false);
    expect(cfg.registrazioniConsenso).toBe("OFF");

    await expect(db.voiceConfiguration.create({ data: { venueId } })).rejects.toThrow();
  });
});

describe("la coda da richiamare", () => {
  it("nasce aperta, con zero tentativi", async () => {
    const r = await db.voiceCallback.create({
      data: { venueId, numero: "+393331112233", guestId, callId },
    });
    expect(r.stato).toBe("OPEN");
    expect(r.tentativi).toBe(0);
  });

  it("se la chiamata sparisce, il lavoro da fare resta", async () => {
    /* `SetNull` e non `Cascade`: la persona da richiamare esiste anche se la
       riga della chiamata viene cancellata. Il contrario farebbe sparire un
       lavoro da fare per un dato di contorno. */
    const c = await db.phoneCall.create({
      data: { venueId, externalId: "schema-cb", fromNumber: "+393339998877" },
    });
    const cb = await db.voiceCallback.create({
      data: { venueId, numero: "+393339998877", callId: c.id },
    });
    await db.phoneCall.delete({ where: { id: c.id } });
    const dopo = await db.voiceCallback.findUniqueOrThrow({ where: { id: cb.id } });
    expect(dopo.callId).toBeNull();
    expect(dopo.stato).toBe("OPEN");
  });
});

describe("le informazioni rilevate in chiamata", () => {
  it("nascono da approvare, non salvate", async () => {
    /* È il punto di quella tabella: quello che una macchina deduce da una
       telefonata non entra nel profilo di un cliente finché una persona non
       preme «salva». */
    const i = await db.voiceCRMInsight.create({
      data: { venueId, callId, guestId, tipo: "preferenza", valore: "Preferisce il tavolo fuori" },
    });
    expect(i.stato).toBe("PENDING");
    expect(i.decisoDa).toBeNull();
  });
});

describe("la base di conoscenza", () => {
  it("una risposta per categoria, con le forme in cui la domanda arriva", async () => {
    const k = await db.voiceKnowledgeItem.create({
      data: {
        venueId,
        categoria: "PARCHEGGIO",
        argomenti: ["parcheggio", "dove parcheggio", "posto auto"],
        risposta: "C'è un parcheggio gratuito a cinquanta metri, in via delle Prove.",
      },
    });
    expect(k.attivo).toBe(true);
    expect(k.argomenti).toContain("dove parcheggio");
  });
});

describe("il telefono come fonte di prenotazioni", () => {
  it("«VOICE» esiste accanto a «PHONE», e il passato non si riscrive", async () => {
    /* `PHONE` resta per le righe esistenti e per chi scrive a mano: sono
       prenotazioni prese al telefono da una persona. `VOICE` è quello che nasce
       dentro Tavolo Voice. */
    const b = await db.booking.create({
      data: {
        venueId,
        partySize: 2,
        startsAt: new Date(Date.now() + 86_400_000),
        source: "VOICE",
      },
    });
    expect(b.source).toBe("VOICE");
  });
});

describe("le tre tabelle superate", () => {
  it("esistono ancora, e nessuna tabella nuova le tocca", async () => {
    /* Restano solo perché contengono righe di demo di aprile 2026, e il brief
       dice di non perdere dati. Sono marcate nello schema: è quello che mi è
       mancato il 17 settembre, quando ne ho creata una quarta perché queste
       sembravano vive. */
    expect(await db.callLog.count({ where: { venueId } })).toBe(0);
    expect(await db.missedCall.count({ where: { venueId } })).toBe(0);
    expect(await db.voiceBookingDraft.count({ where: { venueId } })).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   Gli eventi che nascono da soli.

   La riga della chiamata dice com'è adesso; questi dicono cos'è successo.
   Senza, una chiamata andata storta tre giorni prima è una riga con uno stato
   e nessuna storia.
   ──────────────────────────────────────────────────────────────────────────── */

describe("gli eventi si scrivono da sé", () => {
  it("una chiamata che squilla lascia «ricevuta»", async () => {
    const { registraEventoChiamata } = await import("@/server/chiamate");
    const e = await registraEventoChiamata(venueId, {
      externalId: "ev-1",
      phone: "+393331112233",
      stato: "RINGING",
    });
    /* L'evento si scrive senza attesa, quindi si concede un istante: è
       voluto — se l'evento non si scrive, la chiamata compare comunque sullo
       schermo di chi risponde. */
    await new Promise((r) => setTimeout(r, 150));
    const eventi = await db.phoneCallEvent.findMany({ where: { callId: e.id } });
    expect(eventi.map((x) => x.kind)).toContain("CALL_RECEIVED");
  });

  it("«nessuno ha risposto» e «finita» restano due eventi diversi", async () => {
    /* Per il ristoratore sono due cose diverse: una persona da richiamare e
       una conversazione avvenuta. Nel registro devono restare distinte, o la
       differenza si perde proprio dove serve rileggerla. */
    const { registraEventoChiamata } = await import("@/server/chiamate");
    const persa = await registraEventoChiamata(venueId, {
      externalId: "ev-persa",
      phone: "+393334445566",
      stato: "MISSED",
    });
    const finita = await registraEventoChiamata(venueId, {
      externalId: "ev-finita",
      phone: "+393334445566",
      stato: "ENDED",
    });
    await new Promise((r) => setTimeout(r, 150));

    const a = await db.phoneCallEvent.findMany({ where: { callId: persa.id } });
    const b = await db.phoneCallEvent.findMany({ where: { callId: finita.id } });
    expect(a.map((x) => x.kind)).toContain("CALL_MISSED");
    expect(b.map((x) => x.kind)).toContain("CALL_ENDED");
  });

  it("un evento perso non fa fallire l'operazione che lo ha prodotto", async () => {
    /* `segnaEventoChiamata` su una chiamata che non esiste: non solleva. Una
       prenotazione creata e non annotata è molto meglio di una prenotazione
       non creata. */
    const { segnaEventoChiamata } = await import("@/server/chiamate");
    await expect(
      segnaEventoChiamata("chiamata-che-non-esiste", "BOOKING_CREATED", { actor: "ai" }),
    ).resolves.toBeUndefined();
  });

  it("gli eventi di un'altra chiamata non si leggono per sbaglio", async () => {
    const { eventiDiChiamata } = await import("@/server/chiamate");
    /* Filtrata per locale come ogni lettura: un identificativo altrui non deve
       restituire la storia di una chiamata di un altro ristorante. */
    expect(await eventiDiChiamata(venueId, "non-esiste")).toEqual([]);
  });
});
