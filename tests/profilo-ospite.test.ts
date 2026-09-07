import { describe, expect, it } from "vitest";
import { TAG_RULES, computeGuestProfile } from "@/server/guest-intelligence";

/**
 * Il profilo dell'ospite, calcolato dalle prenotazioni.
 *
 * Perché questi test esistono: la scheda mostrava cinque numeri presi da
 * colonne che **nessuna parte del codice aggiornava** — valori del seed
 * presentati come fatti. Ora ogni valore viene dalle prenotazioni, e qui si
 * fissa cosa significa ciascuno: cos'è una «visita», da quando si è
 * «abituale», quando un'abitudine è un'abitudine e non un caso.
 *
 * Funzione pura, nessun database: le regole si possono discutere leggendo
 * questo file.
 */

const ORA = new Date("2026-09-07T12:00:00.000Z");

function giorniPrima(n: number, ore = 20): Date {
  const d = new Date(ORA);
  d.setDate(d.getDate() - n);
  d.setHours(ore, 0, 0, 0);
  return d;
}

const OSPITE = {
  id: "g1",
  birthday: null as Date | null,
  loyaltyTier: "NEW",
  allergies: null as string | null,
  preferences: null,
};

type Riga = Parameters<typeof computeGuestProfile>[1][number];

function pren(p: Partial<Riga> & { startsAt: Date }): Riga {
  return {
    startsAt: p.startsAt,
    createdAt: p.createdAt ?? new Date(p.startsAt.getTime() - 3 * 86_400_000),
    partySize: p.partySize ?? 2,
    status: p.status ?? "COMPLETED",
    occasion: p.occasion ?? null,
    tableId: p.tableId ?? null,
    table: p.table ?? null,
  };
}

const sala = (id: string, name: string) => ({ id, name });
const tavolo = (id: string, label: string, room: { id: string; name: string } | null = null) => ({
  id,
  label,
  roomId: room?.id ?? null,
  room,
});

describe("cos'è una visita", () => {
  it("completate e sedute contano, prenotate no", () => {
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(30), status: "COMPLETED" }),
        pren({ startsAt: giorniPrima(10), status: "SEATED" }),
        pren({ startsAt: giorniPrima(-5), status: "CONFIRMED" }),
      ],
      { now: ORA },
    );
    expect(p.visits).toBe(2);
    expect(p.totalBookings).toBe(3);
  });

  it("annullate e assenze non sono visite, ma restano nei conti", () => {
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(30), status: "COMPLETED" }),
        pren({ startsAt: giorniPrima(20), status: "CANCELLED" }),
        pren({ startsAt: giorniPrima(10), status: "NO_SHOW" }),
      ],
      { now: ORA },
    );
    expect(p.visits).toBe(1);
    expect(p.cancellations).toBe(1);
    expect(p.noShows).toBe(1);
    expect(Math.round(p.noShowRate * 100)).toBe(33);
  });

  it("senza prenotazioni non inventa niente", () => {
    const p = computeGuestProfile(OSPITE, [], { now: ORA });
    expect(p.visits).toBe(0);
    expect(p.firstVisitAt).toBeNull();
    expect(p.lastVisitAt).toBeNull();
    expect(p.daysSinceLastVisit).toBeNull();
    expect(p.avgDaysBetweenVisits).toBeNull();
    expect(p.avgPartySize).toBeNull();
    expect(p.estimatedValue).toBeNull();
  });
});

describe("relazione nel tempo", () => {
  it("prima e ultima visita, e i giorni di silenzio", () => {
    const p = computeGuestProfile(
      OSPITE,
      [pren({ startsAt: giorniPrima(90) }), pren({ startsAt: giorniPrima(12) })],
      { now: ORA },
    );
    expect(p.firstVisitAt).toBe(giorniPrima(90).toISOString());
    expect(p.lastVisitAt).toBe(giorniPrima(12).toISOString());
    // Giorni di calendario, come li conta una persona: una visita della sera
    // di dodici giorni fa, guardata a mezzogiorno, resta «dodici giorni fa» e
    // non «undici» come darebbe il conto delle ore.
    expect(p.daysSinceLastVisit).toBe(12);
  });

  it("la frequenza serve almeno due visite", () => {
    const una = computeGuestProfile(OSPITE, [pren({ startsAt: giorniPrima(10) })], { now: ORA });
    expect(una.avgDaysBetweenVisits).toBeNull();

    const tre = computeGuestProfile(
      OSPITE,
      [pren({ startsAt: giorniPrima(60) }), pren({ startsAt: giorniPrima(40) }), pren({ startsAt: giorniPrima(20) })],
      { now: ORA },
    );
    expect(tre.avgDaysBetweenVisits).toBe(20);
  });

  it("l'anticipo si misura su tutte le prenotazioni, anche le disdette", () => {
    // Anche una disdetta dice come si organizza una persona.
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(10), createdAt: giorniPrima(20) }),
        pren({ startsAt: giorniPrima(5), createdAt: giorniPrima(9), status: "CANCELLED" }),
      ],
      { now: ORA },
    );
    expect(p.avgLeadTimeDays).toBe(7);
  });
});

describe("abitudini", () => {
  it("servono almeno tre visite perché un'abitudine sia un'abitudine", () => {
    const due = computeGuestProfile(
      OSPITE,
      [pren({ startsAt: giorniPrima(14) }), pren({ startsAt: giorniPrima(7) })],
      { now: ORA },
    );
    expect(due.preferredWeekday).toBeNull();
    expect(TAG_RULES.habitMinVisits).toBe(3);
  });

  it("il tavolo preferito si raggruppa per identificativo, non per riferimento", () => {
    // Con il confronto fra oggetti ogni prenotazione contava come un tavolo
    // diverso, e il «tavolo preferito» risultava sempre frequentato una volta.
    const t = () => tavolo("t7", "T7", sala("r1", "Sala principale"));
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(30), table: t() }),
        pren({ startsAt: giorniPrima(20), table: t() }),
        pren({ startsAt: giorniPrima(10), table: t() }),
      ],
      { now: ORA },
    );
    expect(p.preferredTable?.label).toBe("T7");
    expect(p.preferredTable?.share).toBe(1);
    expect(p.preferredRoom?.name).toBe("Sala principale");
  });

  it("distingue pranzo e cena", () => {
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(21, 13) }),
        pren({ startsAt: giorniPrima(14, 13) }),
        pren({ startsAt: giorniPrima(7, 21) }),
      ],
      { now: ORA },
    );
    expect(p.preferredTimeBand?.band).toBe("pranzo");
    expect(Math.round((p.preferredTimeBand?.share ?? 0) * 100)).toBe(67);
  });

  it("conta le occasioni", () => {
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(30), occasion: "BIRTHDAY" }),
        pren({ startsAt: giorniPrima(20), occasion: "BIRTHDAY" }),
        pren({ startsAt: giorniPrima(10), occasion: "BUSINESS" }),
      ],
      { now: ORA },
    );
    expect(p.occasions[0]).toEqual({ occasion: "BIRTHDAY", count: 2 });
  });
});

describe("il valore non si inventa", () => {
  it("senza spesa media dichiarata non c'è nessuna stima", () => {
    const p = computeGuestProfile(OSPITE, [pren({ startsAt: giorniPrima(10), partySize: 4 })], {
      now: ORA,
    });
    expect(p.estimatedValue).toBeNull();
  });

  it("con la spesa media dichiarata la stima è sui coperti, e dice su cosa si basa", () => {
    const p = computeGuestProfile(
      OSPITE,
      [pren({ startsAt: giorniPrima(20), partySize: 4 }), pren({ startsAt: giorniPrima(10), partySize: 2 })],
      { now: ORA, avgSpendCents: 4500 },
    );
    // 6 coperti totali × 45 €
    expect(p.estimatedValue?.totalCents).toBe(27_000);
    expect(p.estimatedValue?.basedOnAvgSpendCents).toBe(4500);
  });
});

describe("etichette automatiche", () => {
  const conVisite = (n: number, giorniDaUltima = 5) =>
    Array.from({ length: n }, (_, i) => pren({ startsAt: giorniPrima(giorniDaUltima + (n - 1 - i) * 15) }));

  it("nuovo, prima visita, abituale", () => {
    const chiavi = (n: number) =>
      computeGuestProfile(OSPITE, conVisite(n), { now: ORA }).tags.map((t) => t.key);

    expect(chiavi(0)).toContain("nuovo");
    expect(chiavi(1)).toContain("prima_volta");
    expect(chiavi(TAG_RULES.regularVisits)).toContain("abituale");
  });

  it("a rischio: era abituale e ha smesso", () => {
    const p = computeGuestProfile(OSPITE, conVisite(5, TAG_RULES.atRiskDays + 5), { now: ORA });
    const chiavi = p.tags.map((t) => t.key);
    expect(chiavi).toContain("a_rischio");
    expect(chiavi).not.toContain("inattivo");
  });

  it("inattivo batte a rischio quando il silenzio è lungo", () => {
    const p = computeGuestProfile(OSPITE, conVisite(5, TAG_RULES.inactiveDays + 10), { now: ORA });
    const chiavi = p.tags.map((t) => t.key);
    expect(chiavi).toContain("inattivo");
    expect(chiavi).not.toContain("a_rischio");
  });

  it("chi viene poco e non torna non è «a rischio»: non era abituale", () => {
    const p = computeGuestProfile(OSPITE, conVisite(1, TAG_RULES.atRiskDays + 5), { now: ORA });
    expect(p.tags.map((t) => t.key)).not.toContain("a_rischio");
  });

  it("assenze ripetute: serve sia il numero sia la quota", () => {
    // Due assenze su venti prenotazioni non sono un problema di affidabilità.
    const molte = computeGuestProfile(
      OSPITE,
      [
        ...Array.from({ length: 18 }, (_, i) => pren({ startsAt: giorniPrima(200 - i * 10) })),
        pren({ startsAt: giorniPrima(20), status: "NO_SHOW" }),
        pren({ startsAt: giorniPrima(10), status: "NO_SHOW" }),
      ],
      { now: ORA },
    );
    expect(molte.tags.map((t) => t.key)).not.toContain("assenze");

    const poche = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(30) }),
        pren({ startsAt: giorniPrima(20), status: "NO_SHOW" }),
        pren({ startsAt: giorniPrima(10), status: "NO_SHOW" }),
      ],
      { now: ORA },
    );
    expect(poche.tags.map((t) => t.key)).toContain("assenze");
  });

  it("compleanno vicino, e non quello lontano", () => {
    const fraCinque = new Date(ORA);
    fraCinque.setDate(fraCinque.getDate() + 5);
    const vicino = computeGuestProfile(
      { ...OSPITE, birthday: new Date(1985, fraCinque.getMonth(), fraCinque.getDate()) },
      [],
      { now: ORA },
    );
    expect(vicino.tags.some((t) => t.key === "compleanno")).toBe(true);

    const fraTreMesi = new Date(ORA);
    fraTreMesi.setMonth(fraTreMesi.getMonth() + 3);
    const lontano = computeGuestProfile(
      { ...OSPITE, birthday: new Date(1985, fraTreMesi.getMonth(), fraTreMesi.getDate()) },
      [],
      { now: ORA },
    );
    expect(lontano.tags.some((t) => t.key === "compleanno")).toBe(false);
  });

  it("VIP viene dal riconoscimento del locale, non dai conti", () => {
    const p = computeGuestProfile({ ...OSPITE, loyaltyTier: "VIP" }, [], { now: ORA });
    const vip = p.tags.find((t) => t.key === "vip");
    expect(vip).toBeDefined();
    expect(vip!.why).toContain("assegnato dal locale");
  });

  it("le allergie sono un'etichetta operativa, col contenuto dentro", () => {
    const p = computeGuestProfile({ ...OSPITE, allergies: "Crostacei" }, [], { now: ORA });
    expect(p.tags.find((t) => t.key === "allergie")?.why).toBe("Crostacei");
  });

  it("ogni etichetta dice perché", () => {
    const p = computeGuestProfile(
      { ...OSPITE, loyaltyTier: "VIP", allergies: "Glutine" },
      conVisite(6),
      { now: ORA },
    );
    expect(p.tags.length).toBeGreaterThan(1);
    for (const t of p.tags) {
      // Un'etichetta senza motivo è un'opinione del software.
      expect(t.why.length).toBeGreaterThan(3);
      expect(t.label.length).toBeGreaterThan(1);
    }
  });

  it("chi viene in gruppo si riconosce dai coperti medi", () => {
    const p = computeGuestProfile(
      OSPITE,
      [
        pren({ startsAt: giorniPrima(30), partySize: 8 }),
        pren({ startsAt: giorniPrima(20), partySize: 6 }),
        pren({ startsAt: giorniPrima(10), partySize: 7 }),
      ],
      { now: ORA },
    );
    expect(p.tags.map((t) => t.key)).toContain("gruppi");
    expect(p.avgPartySize).toBe(7);
  });
});
