import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  NOME_TIPO_RICHIESTA,
  RichiestaError,
  creaRichiesta,
  daDecidere,
  decidiRichiesta,
  richiesteDi,
} from "@/server/staff-richieste";

/**
 * Le richieste del personale: ferie, permessi, cambi turno.
 *
 * `StaffRequest` stava nello schema con ventinove righe, due enum e un indice
 * per stato, e **nessuna riga di codice la toccava**: le ferie si chiedevano a
 * voce e si segnavano su un foglio. Le prove guardano le cose che, sbagliate,
 * fanno litigare due persone su cosa era stato chiesto e cosa approvato.
 */

const db = new PrismaClient();
const PREFISSO = "test-staff-richieste-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let altroVenueId = "";
let personaId = "";
let personaAltrove = "";
let userId = "";

const attore = () => ({
  userId,
  email: "capo@test.local",
  orgId,
  venueId,
  ip: null,
  userAgent: null,
});
let orgId = "";

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  venueId = (
    await db.venue.create({
      data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
    })
  ).id;
  altroVenueId = (
    await db.venue.create({
      data: { orgId: org.id, name: `${unico}-b`, slug: `${unico}-b`, timezone: "Europe/Rome" },
    })
  ).id;
  personaId = (
    await db.waiter.create({
      data: {
        venueId,
        firstName: "Anna",
        lastName: "Bianchi",
        /* Obbligatoria nello schema: il personale ha una data di nascita
           perché serve ai contratti e alle visite mediche. */
        birthday: new Date("1994-05-12T00:00:00.000Z"),
        phone: "+39 333 1112223",
        role: "Sala",
      },
    })
  ).id;
  personaAltrove = (
    await db.waiter.create({
      data: {
        venueId: altroVenueId,
        firstName: "Luca",
        lastName: "Verdi",
        birthday: new Date("1990-01-20T00:00:00.000Z"),
        phone: "+39 333 4445556",
        role: "Sala",
      },
    })
  ).id;
  userId = (await db.user.create({ data: { email: `${unico}@test.local` } })).id;
}, 60_000);

afterEach(async () => {
  await db.staffRequest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
});

afterAll(async () => {
  await db.staffRequest.deleteMany({ where: { venueId: { in: [venueId, altroVenueId] } } });
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("chiedere", () => {
  it("una ferie su più giorni si scrive come giorni, non come istanti", async () => {
    /**
     * Le colonne sono `@db.Date`: una ferie dal 24 al 26 non ha un'ora, e
     * scriverla con i millisecondi la farebbe cominciare o finire un giorno
     * prima a seconda del fuso del server — che su Vercel è UTC.
     */
    const r = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "VACATION", dal: "2026-12-24", al: "2026-12-26" },
      attore(),
    );
    expect(r.requestedFrom?.toISOString()).toBe("2026-12-24T00:00:00.000Z");
    expect(r.requestedTo?.toISOString()).toBe("2026-12-26T00:00:00.000Z");
    expect(r.status).toBe("PENDING");
  });

  it("un giorno solo non chiede due date", async () => {
    const r = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "DAY_OFF", dal: "2026-11-02" },
      attore(),
    );
    expect(r.requestedFrom?.toISOString()).toBe(r.requestedTo?.toISOString());
  });

  it("il cambio turno porta gli orari, gli altri no", async () => {
    const r = await creaRichiesta(
      venueId,
      {
        waiterId: personaId,
        type: "SHIFT_CHANGE",
        dal: "2026-10-10",
        dalleMinuti: 18 * 60,
        alleMinuti: 23 * 60,
        motivo: "visita medica",
      },
      attore(),
    );
    expect(r.requestedStartMinute).toBe(1080);
    expect(r.requestedEndMinute).toBe(1380);
    expect(r.reason).toBe("visita medica");
  });

  it("le date al contrario si rifiutano", async () => {
    await expect(
      creaRichiesta(
        venueId,
        { waiterId: personaId, type: "VACATION", dal: "2026-12-26", al: "2026-12-24" },
        attore(),
      ),
    ).rejects.toThrow();
  });

  it("due richieste aperte sugli stessi giorni non si duplicano", async () => {
    /**
     * Due ferie sovrapposte per la stessa persona sono due righe da decidere
     * che dicono la stessa cosa: chi approva la prima lascia la seconda in
     * sospeso per sempre.
     */
    await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "VACATION", dal: "2026-12-24", al: "2026-12-26" },
      attore(),
    );
    await expect(
      creaRichiesta(
        venueId,
        { waiterId: personaId, type: "VACATION", dal: "2026-12-25", al: "2026-12-28" },
        attore(),
      ),
    ).rejects.toMatchObject({ code: "sovrapposta" });
  });

  it("dopo un rifiuto si può richiedere: è il caso normale", async () => {
    /* Una ferie rifiutata si sposta di una settimana e si richiede. Se il
       controllo guardasse anche le decise, quella persona non potrebbe più
       chiedere niente per quei giorni. */
    const r = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "VACATION", dal: "2026-12-24", al: "2026-12-26" },
      attore(),
    );
    await decidiRichiesta(venueId, r.id, { stato: "REJECTED" }, attore());

    const seconda = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "VACATION", dal: "2026-12-25", al: "2026-12-27" },
      attore(),
    );
    expect(seconda.status).toBe("PENDING");
  });

  it("una persona di un altro locale non esiste da qui", async () => {
    await expect(
      creaRichiesta(
        venueId,
        { waiterId: personaAltrove, type: "DAY_OFF", dal: "2026-10-01" },
        attore(),
      ),
    ).rejects.toMatchObject({ code: "persona_di_altro_locale" });
  });
});

describe("decidere", () => {
  async function unaRichiesta() {
    return creaRichiesta(
      venueId,
      { waiterId: personaId, type: "LEAVE", dal: "2026-10-05" },
      attore(),
    );
  }

  it("approvare scrive chi ha deciso e quando", async () => {
    const r = await unaRichiesta();
    const decisa = await decidiRichiesta(venueId, r.id, { stato: "APPROVED", nota: "ok" }, attore());
    expect(decisa.status).toBe("APPROVED");
    expect(decisa.reviewedByUserId).toBe(userId);
    expect(decisa.reviewedAt).toBeTruthy();
    expect(decisa.reviewNote).toBe("ok");
  });

  it("una richiesta già decisa non si decide un'altra volta", async () => {
    const r = await unaRichiesta();
    await decidiRichiesta(venueId, r.id, { stato: "APPROVED" }, attore());
    await expect(
      decidiRichiesta(venueId, r.id, { stato: "REJECTED" }, attore()),
    ).rejects.toMatchObject({ code: "gia_decisa" });

    /* E la prima decisione resta quella: le decisioni si aggiungono, non si
       sovrascrivono. */
    const riletta = await db.staffRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(riletta.status).toBe("APPROVED");
  });

  it("due responsabili che decidono insieme non scrivono due decisioni", async () => {
    /**
     * La condizione sta **dentro** la scrittura. Con un «leggi lo stato, poi
     * scrivi» passerebbero entrambi, e il registro direbbe una cosa mentre la
     * persona ne ha sentita un'altra.
     */
    const r = await unaRichiesta();
    const esiti = await Promise.allSettled([
      decidiRichiesta(venueId, r.id, { stato: "APPROVED" }, attore()),
      decidiRichiesta(venueId, r.id, { stato: "REJECTED" }, attore()),
    ]);
    expect(esiti.filter((e) => e.status === "fulfilled")).toHaveLength(1);
  });

  it("una richiesta di un altro locale non si decide", async () => {
    const r = await creaRichiesta(
      altroVenueId,
      { waiterId: personaAltrove, type: "DAY_OFF", dal: "2026-10-01" },
      { ...attore(), venueId: altroVenueId },
    );
    await expect(
      decidiRichiesta(venueId, r.id, { stato: "APPROVED" }, attore()),
    ).rejects.toMatchObject({ code: "non_trovata" });
  });
});

describe("gli elenchi", () => {
  it("da decidere: le più vecchie in cima, perché aspettano da più tempo", async () => {
    const prima = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "VACATION", dal: "2026-12-24" },
      attore(),
    );
    const dopo = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "DAY_OFF", dal: "2026-11-02" },
      attore(),
    );

    const elenco = await daDecidere(venueId);
    expect(elenco.map((r) => r.id)).toEqual([prima.id, dopo.id]);
    /* Ogni riga porta il nome della persona e il nome leggibile del tipo: una
       schermata che mostra «VACATION» fa tradurre a chi legge. */
    expect(elenco[0]!.persona?.nome).toBe("Anna Bianchi");
    expect(elenco[0]!.tipoNome).toBe(NOME_TIPO_RICHIESTA.VACATION);
  });

  it("le decise escono da «da decidere» e restano nella storia della persona", async () => {
    const r = await creaRichiesta(
      venueId,
      { waiterId: personaId, type: "LEAVE", dal: "2026-10-05" },
      attore(),
    );
    await decidiRichiesta(venueId, r.id, { stato: "APPROVED" }, attore());

    expect(await daDecidere(venueId)).toHaveLength(0);
    const storia = await richiesteDi(venueId, personaId);
    expect(storia).toHaveLength(1);
    expect(storia[0]!.stato).toBe("APPROVED");
  });
});
