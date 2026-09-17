import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { riconosciChiamante } from "@/server/telefonia";
import {
  emettiApiToken,
  elencaApiToken,
  revocaApiToken,
  verificaApiToken,
} from "@/server/api-token";
import { componiToken } from "@/lib/api-token-forma";

/**
 * Il riconoscimento del chiamante, provato sul database.
 *
 * Questi non sono test di unità e non potevano esserlo: la parte che può
 * sbagliare è **l'SQL grezzo** che confronta le ultime nove cifre dentro
 * Postgres, e una funzione finta al posto del database proverebbe soltanto che
 * la funzione finta funziona. Se l'espressione qui e quella dell'indice
 * `Guest_venueId_codaTelefono_idx` divergono, l'indice resta e nessuno lo usa:
 * una scansione di tutti gli ospiti del locale a ogni squillo. Solo il
 * database vero lo dice.
 *
 * Stessa ragione per i token: l'impronta, il confronto a tempo costante e la
 * revoca girano contro una riga vera.
 */

const db = new PrismaClient();
const PREFISSO = "test-tel-";

// Questi test scrivono e cancellano: non devono poter girare su un database vero.
const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error(
    "I test di telefonia scrivono sul database. DATABASE_URL deve contenere 'dev' o 'test'. " +
      "Valore attuale non riconosciuto come ambiente di prova.",
  );
}

/*
  I numeri qui sono inventati e devono restarlo: nessun numero vero — né del
  locale, né di una persona — entra nel codice. La forma con cui sono salvati è
  volutamente **diversa** da quella con cui vengono cercati, perché è così che
  succede: l'operatore scrive come gli viene, il centralino manda l'E.164.
*/
const NUMERO_ABITUALE = "333 1234567"; // salvato così
const CHIAMA_ABITUALE = "+393331234567"; // arriva così
const NUMERO_FAMIGLIA = "+39 011 5550123"; // due schede su questo
const NUMERO_BLOCCATO = "3387654321";
const NUMERO_IMPORTATO = "3399998888";
const NUMERO_CANCELLATO = "3355554444";
const NUMERO_SCONOSCIUTO = "3200000001";
const NUMERO_CORTO = "412"; // un interno: non identifica nessuno

const DOMANI = new Date(Date.now() + 24 * 60 * 60 * 1000);
const FRA_UNA_SETTIMANA = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const UN_MESE_FA = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const DUE_MESI_FA = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

type Scenario = {
  venueA: string;
  venueB: string;
  abituale: string;
  mogliePiuRecente: string;
  maritoMenoRecente: string;
  bloccato: string;
  importato: string;
  cancellato: string;
  /** L'abituale con lo stesso numero, ma nel locale B. */
  abitualeAltroLocale: string;
  /** Un locale con una rubrica vera, solo per la prova sull'indice. */
  venueIndice: string;
};

let S: Scenario;

async function creaLocale(nome: string): Promise<string> {
  const unico = `${PREFISSO}${nome}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  const venue = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  return venue.id;
}

beforeAll(async () => {
  const venueA = await creaLocale("alfa");
  const venueB = await creaLocale("beta");

  const room = await db.room.create({ data: { venueId: venueA, name: "Sala" } });
  const tavolo = await db.table.create({
    data: { venueId: venueA, roomId: room.id, label: "T12", seats: 4 },
  });

  const abituale = await db.guest.create({
    data: {
      venueId: venueA,
      firstName: "Marco",
      lastName: "Abituale",
      phone: NUMERO_ABITUALE,
      loyaltyTier: "VIP",
      totalVisits: 14,
      noShowCount: 2,
      allergies: "Crostacei",
      tags: ["tavolo vicino alla finestra"],
      lastVisitAt: UN_MESE_FA,
    },
  });

  /* Due schede sullo stesso numero: la famiglia col fisso. La più recente è
     la moglie, e il marito è bloccato — il caso che rende necessario dire che
     ci sono altre schede invece di scegliere in silenzio. */
  const mogliePiuRecente = await db.guest.create({
    data: {
      venueId: venueA,
      firstName: "Anna",
      lastName: "Famiglia",
      phone: NUMERO_FAMIGLIA,
      lastVisitAt: UN_MESE_FA,
    },
  });
  const maritoMenoRecente = await db.guest.create({
    data: {
      venueId: venueA,
      firstName: "Luigi",
      lastName: "Famiglia",
      phone: NUMERO_FAMIGLIA,
      lastVisitAt: DUE_MESI_FA,
      blocked: true,
      blockedAt: DUE_MESI_FA,
      blockedReason: "Tre mancate presentazioni di fila",
    },
  });

  const bloccato = await db.guest.create({
    data: {
      venueId: venueA,
      firstName: "Sergio",
      lastName: "Bloccato",
      phone: NUMERO_BLOCCATO,
      blocked: true,
      blockedAt: UN_MESE_FA,
      blockedReason: "Comportamento in sala",
      noShowCount: 4,
    },
  });

  // Importato da un altro gestionale: ha la data dell'ultima visita e nessuna
  // prenotazione dietro.
  const importato = await db.guest.create({
    data: {
      venueId: venueA,
      firstName: "Chiara",
      lastName: "Importata",
      phone: NUMERO_IMPORTATO,
      lastVisitAt: DUE_MESI_FA,
      totalVisits: 3,
    },
  });

  // Ha chiesto la cancellazione dei dati: non si riconosce più.
  const cancellato = await db.guest.create({
    data: {
      venueId: venueA,
      firstName: "Anonimo",
      phone: NUMERO_CANCELLATO,
      anonymizedAt: UN_MESE_FA,
      anonymizedBy: "test",
    },
  });

  // Lo stesso numero dell'abituale, ma in un altro ristorante.
  const abitualeAltroLocale = await db.guest.create({
    data: {
      venueId: venueB,
      firstName: "OmonimoAltrove",
      phone: NUMERO_ABITUALE,
      lastVisitAt: UN_MESE_FA,
    },
  });

  await db.booking.createMany({
    data: [
      // La prossima: quella che chi risponde deve vedere.
      {
        venueId: venueA,
        guestId: abituale.id,
        tableId: tavolo.id,
        partySize: 2,
        startsAt: DOMANI,
        status: "CONFIRMED",
        source: "PHONE",
        notes: "Anniversario",
      },
      // Più in là: non è «la prossima».
      {
        venueId: venueA,
        guestId: abituale.id,
        partySize: 6,
        startsAt: FRA_UNA_SETTIMANA,
        status: "CONFIRMED",
        source: "PHONE",
      },
      // Cancellata, anche se prima di tutte: non deve comparire.
      {
        venueId: venueA,
        guestId: abituale.id,
        partySize: 3,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        status: "CANCELLED",
        source: "PHONE",
      },
      // La visita di un mese fa: è quella che porta i coperti.
      {
        venueId: venueA,
        guestId: abituale.id,
        partySize: 4,
        startsAt: UN_MESE_FA,
        status: "COMPLETED",
        source: "PHONE",
        seatedAt: UN_MESE_FA,
      },
      // Una più vecchia: non deve vincere sulla più recente.
      {
        venueId: venueA,
        guestId: abituale.id,
        partySize: 8,
        startsAt: DUE_MESI_FA,
        status: "COMPLETED",
        source: "PHONE",
        seatedAt: DUE_MESI_FA,
      },
    ],
  });

  /*
    Un locale con una rubrica di dimensioni realistiche, solo per la prova
    sull'indice.

    Serve perché su una tabella quasi vuota il pianificatore trovava due
    indici di **pari costo** — il nostro e `Guest_venueId_lastName_idx`, che
    comincia anch'esso per `venueId` — e ne prendeva uno a caso: il test
    passava da solo e falliva dentro la suite, cioè era intermittente. Con
    cinquecento schede su un locale solo la differenza non è più un
    pareggio: con l'indice giusto si legge una riga, con l'altro cinquecento.
  */
  const venueIndice = await creaLocale("indice");
  await db.guest.createMany({
    data: Array.from({ length: 500 }, (_, i) => ({
      venueId: venueIndice,
      firstName: `Rubrica${i}`,
      lastName: `Cognome${i}`,
      // numeri finti e tutti diversi, così la coda è selettiva come nel vero
      phone: `+3933${String(10_000_000 + i).padStart(8, "0")}`,
    })),
  });
  // Senza statistiche fresche il pianificatore ragiona su una tabella vuota.
  await db.$executeRawUnsafe('ANALYZE "Guest"');

  S = {
    venueA,
    venueB,
    abituale: abituale.id,
    mogliePiuRecente: mogliePiuRecente.id,
    maritoMenoRecente: maritoMenoRecente.id,
    bloccato: bloccato.id,
    importato: importato.id,
    cancellato: cancellato.id,
    abitualeAltroLocale: abitualeAltroLocale.id,
    venueIndice,
  };
}, 60_000);

afterAll(async () => {
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

describe("riconosce il numero che chiama", () => {
  it("trova l'ospite anche se il numero è scritto in un'altra forma", async () => {
    const esito = await riconosciChiamante(S.venueA, CHIAMA_ABITUALE);
    expect(esito.guest?.id).toBe(S.abituale);
    expect(esito.guest?.firstName).toBe("Marco");
  });

  it("dà i tre campi per cui questa chiamata esiste", async () => {
    // blocked, noShowCount e allergie: il resto è cortesia
    const esito = await riconosciChiamante(S.venueA, NUMERO_BLOCCATO);
    expect(esito.guest?.blocked).toBe(true);
    expect(esito.guest?.blockedReason).toBe("Comportamento in sala");
    expect(esito.guest?.noShowCount).toBe(4);

    const vip = await riconosciChiamante(S.venueA, CHIAMA_ABITUALE);
    expect(vip.guest?.allergies).toBe("Crostacei");
    expect(vip.guest?.noShowCount).toBe(2);
    expect(vip.guest?.loyaltyTier).toBe("VIP");
    expect(vip.guest?.tags).toContain("tavolo vicino alla finestra");
  });

  it("un numero che non è di nessuno è una risposta, non un errore", async () => {
    const esito = await riconosciChiamante(S.venueA, NUMERO_SCONOSCIUTO);
    expect(esito.guest).toBeNull();
    expect(esito.schedeTotali).toBe(0);
    expect(esito.prossimaPrenotazione).toBeNull();
    // il numero si restituisce comunque: serve a chi risponde
    expect(esito.telefono).toBe("+39 320 0000001");
  });

  it("un numero troppo corto non identifica nessuno e non solleva", async () => {
    const esito = await riconosciChiamante(S.venueA, NUMERO_CORTO);
    expect(esito.guest).toBeNull();
    expect(esito.schedeTotali).toBe(0);
  });

  it("su niente non solleva", async () => {
    for (const niente of [null, undefined, "", "   "]) {
      const esito = await riconosciChiamante(S.venueA, niente);
      expect(esito.guest).toBeNull();
    }
  });

  it("non riconosce chi ha chiesto la cancellazione dei dati", async () => {
    const esito = await riconosciChiamante(S.venueA, NUMERO_CANCELLATO);
    expect(esito.guest).toBeNull();
    expect(esito.schedeTotali).toBe(0);
  });

  it("non vede l'ospite di un altro ristorante con lo stesso numero", async () => {
    const a = await riconosciChiamante(S.venueA, CHIAMA_ABITUALE);
    expect(a.guest?.id).toBe(S.abituale);
    expect(a.schedeTotali).toBe(1);

    const b = await riconosciChiamante(S.venueB, CHIAMA_ABITUALE);
    expect(b.guest?.id).toBe(S.abitualeAltroLocale);
    expect(b.schedeTotali).toBe(1);
  });
});

describe("un numero che è di più persone", () => {
  it("risponde con la più recente e dice che ce ne sono altre", async () => {
    const esito = await riconosciChiamante(S.venueA, NUMERO_FAMIGLIA);
    expect(esito.guest?.id).toBe(S.mogliePiuRecente);
    expect(esito.schedeTotali).toBe(2);
    expect(esito.altreSchede).toHaveLength(1);
    expect(esito.altreSchede[0]?.id).toBe(S.maritoMenoRecente);
  });

  it("segnala la scheda bloccata anche quando non è quella scelta", async () => {
    /* È il motivo per cui le altre schede si dicono: la scheda scelta non è
       bloccata, ma su quel numero c'è un blocco, e chi risponde deve vederlo
       prima di confermare. */
    const esito = await riconosciChiamante(S.venueA, NUMERO_FAMIGLIA);
    expect(esito.guest?.blocked).toBe(false);
    expect(esito.altreSchede.some((s) => s.blocked)).toBe(true);
  });
});

describe("cosa sta per succedere e cosa è già successo", () => {
  it("la prossima prenotazione è la prima futura, col tavolo e la nota", async () => {
    const esito = await riconosciChiamante(S.venueA, CHIAMA_ABITUALE);
    expect(esito.prossimaPrenotazione?.partySize).toBe(2);
    expect(esito.prossimaPrenotazione?.tavolo).toBe("T12");
    expect(esito.prossimaPrenotazione?.notes).toBe("Anniversario");
  });

  it("una prenotazione annullata non è «la prossima», anche se è la più vicina", async () => {
    const esito = await riconosciChiamante(S.venueA, CHIAMA_ABITUALE);
    expect(esito.prossimaPrenotazione?.status).not.toBe("CANCELLED");
    expect(esito.prossimaPrenotazione?.partySize).toBe(2);
  });

  it("l'ultima visita è la più recente servita, coi coperti veri", async () => {
    const esito = await riconosciChiamante(S.venueA, CHIAMA_ABITUALE);
    expect(esito.ultimaVisita?.partySize).toBe(4); // non 8, che è quella di due mesi fa
  });

  it("un ospite importato ha la data della visita e non i coperti, invece di un numero inventato", async () => {
    const esito = await riconosciChiamante(S.venueA, NUMERO_IMPORTATO);
    expect(esito.ultimaVisita).not.toBeNull();
    expect(esito.ultimaVisita?.partySize).toBeNull();
    expect(esito.prossimaPrenotazione).toBeNull();
  });

  it("chi non è mai venuto non ha un'ultima visita", async () => {
    const esito = await riconosciChiamante(S.venueA, NUMERO_BLOCCATO);
    expect(esito.ultimaVisita).toBeNull();
  });
});

describe("il token con cui il centralino si presenta", () => {
  it("un token appena emesso apre l'ambito per cui è stato fatto", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Centralino (prova)",
      ambiti: ["telefonia:read"],
    });
    const esito = await verificaApiToken(emesso.token, "telefonia:read");
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.venueId).toBe(S.venueA);
  });

  it("il token vale per un locale solo", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Solo alfa",
      ambiti: ["telefonia:read"],
    });
    const esito = await verificaApiToken(emesso.token, "telefonia:read");
    expect(esito.ok).toBe(true);
    // il venueId arriva dal token: non c'è modo di chiederne un altro
    if (esito.ok) expect(esito.venueId).not.toBe(S.venueB);
  });

  it("chi può scrivere non può per questo leggere", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Solo scrittura",
      ambiti: ["telefonia:write"],
    });
    const esito = await verificaApiToken(emesso.token, "telefonia:read");
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("ambito");
  });

  it("il segreto sbagliato sullo stesso prefisso non passa", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Segreto storto",
      ambiti: ["telefonia:read"],
    });
    const falso = componiToken(emesso.prefisso, "a".repeat(43));
    const esito = await verificaApiToken(falso, "telefonia:read");
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("sconosciuto");
  });

  it("un token revocato non apre più niente", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Da revocare",
      ambiti: ["telefonia:read"],
    });
    expect((await verificaApiToken(emesso.token, "telefonia:read")).ok).toBe(true);

    await revocaApiToken(S.venueA, emesso.id);
    const dopo = await verificaApiToken(emesso.token, "telefonia:read");
    expect(dopo.ok).toBe(false);
    if (!dopo.ok) expect(dopo.motivo).toBe("revocato");
  });

  it("un token scaduto non apre più niente", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Scaduto",
      ambiti: ["telefonia:read"],
      scadeIl: UN_MESE_FA,
    });
    const esito = await verificaApiToken(emesso.token, "telefonia:read");
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.motivo).toBe("scaduto");
  });

  it("un locale non revoca il token di un altro", async () => {
    const emesso = await emettiApiToken(S.venueA, {
      nome: "Di alfa",
      ambiti: ["telefonia:read"],
    });
    await expect(revocaApiToken(S.venueB, emesso.id)).rejects.toThrow("not_found");
    expect((await verificaApiToken(emesso.token, "telefonia:read")).ok).toBe(true);
  });

  it("l'elenco non contiene niente con cui ricostruire un token", async () => {
    await emettiApiToken(S.venueA, { nome: "In elenco", ambiti: ["telefonia:read"] });
    const elenco = await elencaApiToken(S.venueA);
    expect(elenco.length).toBeGreaterThan(0);
    const serializzato = JSON.stringify(elenco);
    expect(serializzato).not.toContain("hashedSecret");
    for (const riga of elenco) {
      expect(Object.keys(riga)).not.toContain("hashedSecret");
      expect(riga.prefisso).toMatch(/^tvl_[0-9a-f]{12}$/);
    }
  });

  it("l'elenco di un locale non contiene i token di un altro", async () => {
    await emettiApiToken(S.venueB, { nome: "Di beta", ambiti: ["telefonia:read"] });
    const diAlfa = await elencaApiToken(S.venueA);
    expect(diAlfa.some((t) => t.nome === "Di beta")).toBe(false);
  });
});

describe("l'indice sulle ultime nove cifre viene usato", () => {
  /*
    Questo test è stato riscritto perché il primo passava a vuoto.

    Cercava il **nome** dell'indice nel piano, e il nome compare comunque: la
    prima colonna dell'indice è `venueId`, quindi Postgres lo usa per quella e
    valuta il telefono dopo. Provato con nove cifre e con otto, il piano
    nominava l'indice in entrambi i casi — un verde che non poteva diventare
    rosso non è una prova.

    Quello che distingue i due casi è **dove finisce la condizione sul
    telefono**: in `Index Cond` la cerca l'indice, in `Filter` la calcola su
    ogni riga già letta. È quella riga che va guardata.
  */
  async function pianoPer(cifre: number, coda: string): Promise<string[]> {
    return db.$transaction(async (tx) => {
      // LOCAL: vale per questa transazione e non resta appiccicato al pool.
      await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
      const righe = await tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
        `EXPLAIN SELECT "id" FROM "Guest"
         WHERE "venueId" = $1
           AND "phone" IS NOT NULL
           AND "anonymizedAt" IS NULL
           AND right(regexp_replace("phone", '[^0-9]', '', 'g'), ${cifre}) = $2`,
        S.venueIndice,
        coda,
      );
      return righe.map((r) => r["QUERY PLAN"]);
    });
  }

  const cercaTelefono = (righe: string[], etichetta: string) =>
    righe.filter((r) => r.trim().startsWith(etichetta)).join("\n").includes("regexp_replace");

  it("il telefono lo cerca l'indice, non un filtro riga per riga", async () => {
    /* Se questo test diventa rosso, il riconoscimento funziona ancora ma legge
       tutta la rubrica del locale a ogni squillo: su ventimila schede sono gli
       800 ms del centralino. La causa più probabile è che l'espressione in
       `telefonia.ts` e quella dell'indice non coincidono più. */
    const righe = await pianoPer(9, "331234567");
    expect(righe.join("\n")).toContain("Guest_venueId_codaTelefono_idx");
    expect(cercaTelefono(righe, "Index Cond")).toBe(true);
    expect(cercaTelefono(righe, "Filter")).toBe(false);
  });

  it("con un'espressione diversa il telefono scivola nel filtro: la prova può fallire", async () => {
    // La controprova che mancava al primo test.
    const righe = await pianoPer(8, "31234567");
    expect(cercaTelefono(righe, "Index Cond")).toBe(false);
    expect(cercaTelefono(righe, "Filter")).toBe(true);
  });
});
