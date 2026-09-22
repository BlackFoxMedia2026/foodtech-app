import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  accettaRichiesta,
  apriRichiestaEvento,
  contaRichiesteAperte,
  elencaRichieste,
  legaLaPrenotazione,
  perdiRichiesta,
  scriviPreventivo,
} from "@/server/eventi";

/**
 * Eventi e gruppi: dalla richiesta alla prenotazione.
 *
 * È il pezzo con cui i concorrenti fanno margine e che in Tavolo non c'era:
 * «siamo quaranta per una laurea, un sabato di dicembre, quanto viene?» finiva
 * in un «richiameranno» detto a voce, senza che restasse una riga da nessuna
 * parte. E i tre campi che lo dicevano — `Booking.isGroup`, `eventType`,
 * `budgetCents` — stavano nello schema e non li scriveva nessuno.
 *
 * Quello che questi test difendono:
 *
 * - **una richiesta non occupa la sala**: quaranta coperti bloccati per
 *   qualcosa che forse non si fa sono mezza sala persa a ogni preventivo;
 * - **accettare scrive una prenotazione, e una sola**, anche se due persone
 *   accettano insieme;
 * - **i tre campi morti si riempiono**, o questa funzione non serve a niente;
 * - **perdere si scrive col motivo**: «perse: dodici» non insegna niente.
 */

const db = new PrismaClient();
const PREFISSO = "test-eventi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

/* Numeri e indirizzi inventati, e devono restarlo. */
const TELEFONO = "333 444 5566";
const SABATO = new Date("2026-12-12T20:00:00.000Z");

let orgId = "";
let venueId = "";
let attore = { userId: "u-prova", email: null as string | null, orgId: "", venueId: "" };

async function pulisci() {
  await db.auditLog.deleteMany({ where: { Organization: { name: { startsWith: PREFISSO } } } });
  await db.eventRequest.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.notification.deleteMany({ where: { Venue: { name: { startsWith: PREFISSO } } } });
  await db.booking.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.guest.deleteMany({ where: { venue: { name: { startsWith: PREFISSO } } } });
  await db.venue.deleteMany({ where: { name: { startsWith: PREFISSO } } });
  await db.organization.deleteMany({ where: { name: { startsWith: PREFISSO } } });
}

beforeEach(async () => {
  await pulisci();
  const unico = `${PREFISSO}${Date.now()}-${Math.random()}`;
  orgId = (await db.organization.create({ data: { name: `${PREFISSO}org`, slug: unico } })).id;
  venueId = (
    await db.venue.create({
      data: {
        orgId,
        name: `${PREFISSO}locale`,
        slug: `v-${unico}`,
        active: true,
        timezone: "Europe/Rome",
      },
    })
  ).id;
  attore = { userId: "u-prova", email: null, orgId, venueId };
});

afterAll(async () => {
  await pulisci();
  await db.$disconnect();
});

const RICHIESTA = {
  nome: "Chiara",
  telefono: TELEFONO,
  persone: 40,
  quandoTesto: "un sabato di dicembre",
  tipo: "laurea",
  budgetCents: 200_000,
  note: "vorrebbero la sala grande",
};

describe("la richiesta che arriva", () => {
  it("si apre, e **non occupa la sala**", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA, { actor: attore });
    expect(id).toBeTruthy();

    /* Il controllo che conta: nessuna prenotazione. Finché è una trattativa,
       la sala resta libera per chi prenota davvero. */
    expect(await db.booking.count({ where: { venueId } })).toBe(0);

    const aperte = await elencaRichieste(venueId);
    expect(aperte).toHaveLength(1);
    expect(aperte[0]).toMatchObject({
      nome: "Chiara",
      persone: 40,
      stato: "NUOVA",
      quandoTesto: "un sabato di dicembre",
      tipo: "laurea",
    });
  });

  it("non crea una scheda cliente per chi chiede solo un prezzo", async () => {
    /* Chi chiama per un evento spesso non è un cliente: è la figlia che
       organizza la laurea. Una scheda per ogni preventivo riempirebbe la
       rubrica di gente che non è mai venuta. */
    await apriRichiestaEvento(venueId, RICHIESTA);
    expect(await db.guest.count({ where: { venueId } })).toBe(0);
  });

  it("si attacca alla scheda di chi è già cliente", async () => {
    const abituale = await db.guest.create({
      data: { venueId, firstName: "Chiara", lastName: "Abituale", phone: "+393334445566" },
    });

    await apriRichiestaEvento(venueId, RICHIESTA);
    const riga = await db.eventRequest.findFirstOrThrow({ where: { venueId } });
    /* Lo stesso numero scritto in due forme: se qui si confrontassero i
       contatti a modo proprio, la stessa persona sarebbe nuova chiedendo un
       preventivo e conosciuta prenotando. */
    expect(riga.guestId).toBe(abituale.id);
  });

  it("avvisa la sala, perché una richiesta di evento scade", async () => {
    /* Chi chiede un preventivo per quaranta persone lo chiede a tre
       ristoranti lo stesso pomeriggio: chi risponde domani ha già perso. */
    await apriRichiestaEvento(venueId, RICHIESTA);
    const avviso = await db.notification.findFirstOrThrow({
      where: { venueId, kind: "EVENT_REQUEST" },
    });
    expect(avviso.title).toContain("40 persone");
    expect(avviso.link).toBe("/eventi");
  });

  it("la stessa telefonata non apre due trattative", async () => {
    /* Il centralino ritenta: due trattative per la stessa chiamata sono due
       preventivi alla stessa persona. */
    const prima = await apriRichiestaEvento(venueId, { ...RICHIESTA, callId: "call-1" });
    const seconda = await apriRichiestaEvento(venueId, { ...RICHIESTA, callId: "call-1" });

    expect(seconda.giaAperta).toBe(true);
    expect(seconda.id).toBe(prima.id);
    expect(await db.eventRequest.count({ where: { venueId } })).toBe(1);
  });

  it("due telefonate diverse aprono due trattative", async () => {
    await apriRichiestaEvento(venueId, { ...RICHIESTA, callId: "call-1" });
    await apriRichiestaEvento(venueId, { ...RICHIESTA, callId: "call-2" });
    expect(await db.eventRequest.count({ where: { venueId } })).toBe(2);
  });

  it("due richieste a mano non si disturbano", async () => {
    /* Senza `callId` il vincolo non deve scattare: in Postgres i nulli non si
       scontrano fra loro, e due gruppi che chiamano lo stesso giorno sono due
       trattative. */
    await apriRichiestaEvento(venueId, RICHIESTA);
    await apriRichiestaEvento(venueId, { ...RICHIESTA, nome: "Marco" });
    expect(await db.eventRequest.count({ where: { venueId } })).toBe(2);
  });
});

describe("il preventivo", () => {
  it("si scrive, e la trattativa cambia coda", async () => {
    /* «Nessuno l'ha guardata» e «abbiamo risposto e aspettiamo» sono le due
       code di lavoro di chi vende eventi: se sono lo stesso stato, non si sa
       mai quale delle due si sta smaltendo. */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);

    const dopo = await scriviPreventivo(
      venueId,
      id,
      { preventivoCents: 180_000, perPersonaCents: 4_500, menuConcordato: "Antipasto, due primi, dolce", quando: SABATO },
      { actor: attore },
    );

    expect(dopo.stato).toBe("PREVENTIVO");
    expect(dopo.preventivoCents).toBe(180_000);
    expect(dopo.perPersonaCents).toBe(4_500);
    expect(dopo.quando?.toISOString()).toBe(SABATO.toISOString());
    expect(await contaRichiesteAperte(venueId)).toBe(1);
  });

  it("una trattativa chiusa non si ritocca", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await perdiRichiesta(venueId, id, "troppo caro", { actor: attore });
    await expect(scriviPreventivo(venueId, id, { preventivoCents: 1 })).rejects.toThrow(
      "non_modificabile",
    );
  });

  it("la trattativa di un altro locale non si tocca", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    const unico = `${PREFISSO}altro-${Date.now()}`;
    const org2 = await db.organization.create({ data: { name: `${PREFISSO}org2`, slug: unico } });
    const v2 = await db.venue.create({
      data: { orgId: org2.id, name: `${PREFISSO}altro`, slug: `v-${unico}`, timezone: "Europe/Rome" },
    });

    await expect(scriviPreventivo(v2.id, id, { preventivoCents: 1 })).rejects.toThrow(
      "non_modificabile",
    );
  });
});

describe("accettare", () => {
  it("nasce la prenotazione, e i tre campi morti si riempiono", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await scriviPreventivo(venueId, id, {
      preventivoCents: 180_000,
      menuConcordato: "Antipasto, due primi, dolce",
      quando: SABATO,
    });

    const { bookingId } = await accettaRichiesta(venueId, id, {}, { actor: attore });

    const b = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.partySize).toBe(40);
    expect(b.startsAt.toISOString()).toBe(SABATO.toISOString());
    expect(b.status).toBe("CONFIRMED");
    /* I tre campi che stavano nello schema e non scriveva nessuno. Senza
       questi, questa funzione non serve a niente. */
    expect(b.isGroup).toBe(true);
    expect(b.eventType).toBe("laurea");
    expect(b.budgetCents).toBe(180_000);
    /* Il menu concordato sta nelle note **interne**: è un accordo col locale,
       non una richiesta da leggere in sala insieme alle allergie. */
    expect(b.internalNotes).toContain("due primi");

    const riga = await db.eventRequest.findUniqueOrThrow({ where: { id } });
    expect(riga.stato).toBe("ACCETTATA");
    expect(riga.bookingId).toBe(bookingId);
    expect(riga.decisoDa).toBe("u-prova");
  });

  it("chi ha accettato diventa un cliente", async () => {
    /* Prima era qualcuno che chiedeva un prezzo; adesso ha una prenotazione, e
       la prossima volta che chiama il telefono deve riconoscerlo. */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    const { bookingId } = await accettaRichiesta(venueId, id, { quando: SABATO }, { actor: attore });

    const b = await db.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { guest: true },
    });
    expect(b.guest?.firstName).toBe("Chiara");
    expect(b.guest?.phone).toBe(TELEFONO);
  });

  it("senza una data non si accetta", async () => {
    /* Un evento «verso Natale» si accetta quando il giorno è deciso: una riga
       in agenda senza quando non è una prenotazione. */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await expect(accettaRichiesta(venueId, id, {})).rejects.toThrow("senza_data");
    expect(await db.booking.count({ where: { venueId } })).toBe(0);
  });

  it("accettata due volte in fila: la seconda lo dice e non scrive niente", async () => {
    /* Questo lo prende il controllo in testa, che rilegge la riga. Non prova
       il lucchetto: per quello serve la corsa, nel test qui sotto. */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await accettaRichiesta(venueId, id, { quando: SABATO }, { actor: attore });
    await expect(accettaRichiesta(venueId, id, { quando: SABATO })).rejects.toThrow(
      "gia_accettata",
    );

    expect(await db.booking.count({ where: { venueId } })).toBe(1);
  });

  it("**il lucchetto lega una prenotazione sola**", async () => {
    /*
      Il pezzo che protegge dalla corsa, provato da solo — perche da dentro
      `accettaRichiesta` non si puo: due chiamate in parallelo nei test si
      mettono in fila, il controllo che rilegge la riga cattura il secondo
      tentativo, e il lucchetto non viene mai messo alla prova.

      Qui si chiama due volte con due prenotazioni diverse: la seconda deve
      rispondere `false`, e la riga deve restare legata alla prima. Senza la
      condizione `bookingId: null` dentro la scrittura, il sabato di dicembre
      finisce con due tavolate da quaranta persone.
    */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    const uno = await db.booking.create({
      data: { venueId, partySize: 40, startsAt: SABATO },
      select: { id: true },
    });
    const due = await db.booking.create({
      data: { venueId, partySize: 40, startsAt: SABATO },
      select: { id: true },
    });

    const dati = { persone: 40, quando: SABATO, guestId: null as unknown as string, decisoDa: null, preventivoCents: null };
    const ospite = await db.guest.create({ data: { venueId, firstName: "Chiara" } });

    expect(await legaLaPrenotazione(venueId, id, uno.id, { ...dati, guestId: ospite.id })).toBe(true);
    expect(await legaLaPrenotazione(venueId, id, due.id, { ...dati, guestId: ospite.id })).toBe(false);

    const riga = await db.eventRequest.findUniqueOrThrow({ where: { id } });
    expect(riga.bookingId).toBe(uno.id);
  });

  it("due persone che accettano insieme tengono un tavolo solo", async () => {
    /*
      Qui il controllo in testa non basta: due richieste in parallelo leggono
      entrambe `bookingId` nullo e passano entrambe. Quello che le ferma e la
      condizione **dentro** la scrittura — `bookingId: null` nel `where` — e chi
      perde la corsa cancella la prenotazione che aveva appena creato.

      Senza quella condizione, il sabato di dicembre finisce con due tavolate da
      quaranta persone per lo stesso evento.
    */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);

    const esiti = await Promise.allSettled([
      accettaRichiesta(venueId, id, { quando: SABATO }, { actor: attore }),
      accettaRichiesta(venueId, id, { quando: SABATO }, { actor: attore }),
    ]);

    expect(esiti.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    expect(await db.booking.count({ where: { venueId } })).toBe(1);
    expect(await db.eventRequest.count({ where: { venueId, stato: "ACCETTATA" } })).toBe(1);
  });

  it("non ci sono prenotazioni orfane se la corsa si perde", async () => {
    /* Se qualcuno ha accettato un istante prima, la prenotazione appena
       creata va annullata: meglio una riga in meno che due tavoli tenuti per
       lo stesso evento. */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await accettaRichiesta(venueId, id, { quando: SABATO });
    await accettaRichiesta(venueId, id, { quando: SABATO }).catch(() => undefined);

    expect(await db.booking.count({ where: { venueId } })).toBe(1);
  });
});

describe("perdere", () => {
  it("si scrive, col motivo", async () => {
    /* «Perse: dodici» non insegna niente. «Otto perse per il prezzo» cambia il
       listino degli eventi: è l'unico numero di questa pagina che può far
       guadagnare qualcosa. */
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await perdiRichiesta(venueId, id, "  hanno scelto un altro posto  ", { actor: attore });

    const riga = await db.eventRequest.findUniqueOrThrow({ where: { id } });
    expect(riga.stato).toBe("PERSA");
    expect(riga.motivo).toBe("hanno scelto un altro posto");
    expect(await contaRichiesteAperte(venueId)).toBe(0);
  });

  it("senza motivo non si perde", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await expect(perdiRichiesta(venueId, id, "   ")).rejects.toThrow("motivo_mancante");
    expect((await db.eventRequest.findUniqueOrThrow({ where: { id } })).stato).toBe("NUOVA");
  });

  it("una accettata non si può perdere", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await accettaRichiesta(venueId, id, { quando: SABATO });
    await expect(perdiRichiesta(venueId, id, "ripensamento")).rejects.toThrow("non_modificabile");
  });
});

describe("l'elenco", () => {
  it("le aperte per prime, e le più ferme in cima", async () => {
    /* Una richiesta di tre giorni fa senza risposta è il lavoro più urgente
       della pagina: metterla in fondo perché è vecchia è il modo di perderla. */
    const vecchia = await apriRichiestaEvento(venueId, { ...RICHIESTA, nome: "Vecchia" });
    await db.eventRequest.update({
      where: { id: vecchia.id },
      data: { createdAt: new Date(Date.now() - 3 * 86_400_000) },
    });
    await apriRichiestaEvento(venueId, { ...RICHIESTA, nome: "Nuova" });

    const aperte = await elencaRichieste(venueId);
    expect(aperte.map((r) => r.nome)).toEqual(["Vecchia", "Nuova"]);
    expect(aperte[0]!.giorniFerma).toBe(3);
  });

  it("le chiuse si vedono solo chiedendole", async () => {
    const { id } = await apriRichiestaEvento(venueId, RICHIESTA);
    await perdiRichiesta(venueId, id, "troppo caro");

    expect(await elencaRichieste(venueId)).toHaveLength(0);
    expect(await elencaRichieste(venueId, { stato: "tutte" })).toHaveLength(1);
  });
});

describe("la richiesta che arriva dal telefono", () => {
  /*
    E il pezzo che chiude il giro: il risponditore non prende una prenotazione
    da quaranta coperti — la sala si concorda — e fino a ieri diceva «la
    richiamano» e **non restava niente**. La telefonata che vale dieci coperti
    normali si perdeva nel modo piu stupido possibile.
  */
  it("nasce senza attore, e resta scritta", async () => {
    const { id } = await apriRichiestaEvento(
      venueId,
      {
        nome: "Chi ha chiamato",
        telefono: TELEFONO,
        persone: 40,
        quandoTesto: "un sabato di dicembre",
        callId: "call-telefono",
      },
      { da: "telefono" },
    );

    const riga = await db.eventRequest.findUniqueOrThrow({ where: { id } });
    expect(riga.callId).toBe("call-telefono");
    expect(riga.stato).toBe("NUOVA");
    /* Nessuna prenotazione: quaranta coperti non si mettono in agenda da una
       telefonata. */
    expect(await db.booking.count({ where: { venueId } })).toBe(0);
  });

  it("e la sala la vede nella campanella, col numero di persone", async () => {
    await apriRichiestaEvento(
      venueId,
      { nome: "Chi ha chiamato", persone: 40, callId: "call-2" },
      { da: "telefono" },
    );
    const avviso = await db.notification.findFirstOrThrow({
      where: { venueId, kind: "EVENT_REQUEST" },
    });
    expect(avviso.readAt).toBeNull();
    expect(avviso.title).toContain("40");
  });
});
