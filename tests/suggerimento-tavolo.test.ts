import { describe, expect, it } from "vitest";
import { proponiTavoli, type TavoloCandidato } from "@/lib/suggerimento-tavolo";

/**
 * Il suggerimento del tavolo.
 *
 * Quello che queste prove tengono fermo è la **gerarchia delle ragioni**: un
 * tavolo su cui la seduta non ci sta non si offre mai prima di uno su cui ci
 * sta, e a parità di misura vince quello che non ha un nome vicino. Sono le
 * due decisioni che in sala si sbagliano davvero — dare il sei posti a due
 * persone alle otto, e dare alle nove un tavolo prenotato alle nove e un
 * quarto.
 *
 * Il punteggio non è provato e non deve esserlo: è un dettaglio di
 * implementazione che non esce da `lib/suggerimento-tavolo.ts`. Si prova
 * l'ordine, che è quello che un cameriere vede.
 */

const tavolo = (p: Partial<TavoloCandidato> & { label: string; posti: number }): TavoloCandidato => ({
  tableId: `id-${p.label}`,
  roomId: "sala-1",
  roomName: "Sala principale",
  libero: true,
  unibile: true,
  mio: false,
  atteso: false,
  minutiAllaProssima: null,
  oraProssima: null,
  ...p,
});

const per = (coperti: number, durataMin = 105) => ({ coperti, durataMin });

describe("la misura del tavolo", () => {
  it("fra due liberi sceglie quello che spreca meno posti", () => {
    const p = proponiTavoli(
      [tavolo({ label: "B3", posti: 6 }), tavolo({ label: "T8", posti: 4 })],
      per(4),
    );
    expect(p.migliore?.label).toBe("T8");
    expect(p.migliore?.idoneita).toBe("CONSIGLIATO");
  });

  it("un tavolo troppo piccolo resta visibile, ma non si offre", () => {
    const p = proponiTavoli(
      [tavolo({ label: "T2", posti: 2 }), tavolo({ label: "T8", posti: 4 })],
      per(4),
    );
    const t2 = p.tutti.find((t) => t.label === "T2")!;
    expect(t2.idoneita).toBe("NON_COMPATIBILE");
    expect(t2.offribile).toBe(false);
    expect(p.alternative.map((t) => t.label)).not.toContain("T2");
  });

  it("senza nessun tavolo abbastanza grande non si consiglia niente", () => {
    const p = proponiTavoli([tavolo({ label: "T2", posti: 2 })], per(6));
    expect(p.migliore).toBeNull();
    expect(p.motivo).toBeNull();
  });
});

describe("la prenotazione successiva", () => {
  it("un tavolo su cui la seduta non ci sta è «stretto» e va dietro", () => {
    const p = proponiTavoli(
      [
        tavolo({ label: "T5", posti: 4, minutiAllaProssima: 90, oraProssima: "21:15" }),
        tavolo({ label: "T8", posti: 4 }),
      ],
      per(4, 105),
    );
    expect(p.migliore?.label).toBe("T8");
    const t5 = p.tutti.find((t) => t.label === "T5")!;
    expect(t5.idoneita).toBe("STRETTO");
    /* Stretto **si può comunque usare**: lo decide chi è in sala, non noi.
       Toglierlo dall'elenco vorrebbe dire nascondere l'unico tavolo libero a
       chi ha accettato di far alzare il tavolo alle nove e un quarto. */
    expect(t5.offribile).toBe(true);
    expect(t5.dettaglio).toContain("prenotato tra");
  });

  it("a parità di posti preferisce il tavolo senza nomi vicini", () => {
    const p = proponiTavoli(
      [
        tavolo({ label: "T7", posti: 4, minutiAllaProssima: 130, oraProssima: "21:15" }),
        tavolo({ label: "T4", posti: 4 }),
      ],
      per(4, 105),
    );
    expect(p.migliore?.label).toBe("T4");
  });

  it("una prenotazione lontana non pesa: il tavolo si legge come libero", () => {
    const p = proponiTavoli(
      [
        tavolo({ label: "T4", posti: 4, minutiAllaProssima: 300, oraProssima: "23:30" }),
        tavolo({ label: "B3", posti: 6 }),
      ],
      per(4, 105),
    );
    expect(p.migliore?.label).toBe("T4");
    expect(p.migliore?.dettaglio).toContain("libero fino alle 23:30");
  });
});

describe("le altre preferenze", () => {
  it("il tavolo scritto sulla prenotazione vince sul tavolo più stretto", () => {
    const p = proponiTavoli(
      [tavolo({ label: "T8", posti: 4 }), tavolo({ label: "B3", posti: 6, atteso: true })],
      per(4),
    );
    expect(p.migliore?.label).toBe("B3");
    expect(p.motivo).toContain("scritto sulla prenotazione");
  });

  it("fra due tavoli uguali vince quello di chi sta accomodando", () => {
    const p = proponiTavoli(
      [tavolo({ label: "T9", posti: 4 }), tavolo({ label: "T8", posti: 4, mio: true })],
      per(4),
    );
    expect(p.migliore?.label).toBe("T8");
  });

  it("un tavolo occupato non si offre mai", () => {
    const p = proponiTavoli(
      [tavolo({ label: "T1", posti: 4, libero: false }), tavolo({ label: "T8", posti: 4 })],
      per(4),
    );
    expect(p.tutti.find((t) => t.label === "T1")!.idoneita).toBe("OCCUPATO");
    expect(p.migliore?.label).toBe("T8");
  });
});

describe("la frase che spiega la scelta", () => {
  it("dice quale tavolo grande si sta lasciando libero", () => {
    const p = proponiTavoli(
      [tavolo({ label: "T4", posti: 4 }), tavolo({ label: "B3", posti: 6 })],
      per(4),
    );
    expect(p.migliore?.label).toBe("T4");
    expect(p.motivo).toContain("B3");
    expect(p.motivo).toContain("gruppo più numeroso");
  });

  it("non inventa una ragione quando non ce n'è nessuna", () => {
    const p = proponiTavoli([tavolo({ label: "T8", posti: 6 })], per(4));
    expect(p.migliore?.label).toBe("T8");
    expect(p.motivo).toBeNull();
  });

  it("non è una percentuale", () => {
    const p = proponiTavoli(
      [tavolo({ label: "T4", posti: 4 }), tavolo({ label: "B3", posti: 6 })],
      per(4),
    );
    expect(p.motivo).not.toMatch(/\d\s*%/);
  });
});

describe("le unioni", () => {
  it("propone due tavoli piccoli quando da soli non bastano", () => {
    const p = proponiTavoli(
      [
        tavolo({ label: "T11", posti: 2 }),
        tavolo({ label: "T12", posti: 2 }),
        tavolo({ label: "T2", posti: 2 }),
      ],
      per(4),
    );
    expect(p.migliore).toBeNull();
    expect(p.unioni.length).toBeGreaterThan(0);
    expect(p.unioni[0].posti).toBe(4);
    expect(p.unioni[0].tableIds).toHaveLength(2);
  });

  it("non accosta tavoli di sale diverse", () => {
    const p = proponiTavoli(
      [
        tavolo({ label: "T11", posti: 2, roomId: "sala-1" }),
        tavolo({ label: "D1", posti: 2, roomId: "dehors", roomName: "Dehors" }),
      ],
      per(4),
    );
    expect(p.unioni).toHaveLength(0);
  });

  it("non accosta un tavolo che il locale ha dichiarato non unibile", () => {
    const p = proponiTavoli(
      [
        tavolo({ label: "T11", posti: 2 }),
        tavolo({ label: "S1", posti: 2, unibile: false }),
      ],
      per(4),
    );
    expect(p.unioni).toHaveLength(0);
  });

  it("resta un'altra opzione anche quando un tavolo singolo basta", () => {
    /* Il tavolo singolo vince — è il consigliato — ma l'accostamento non
       sparisce: è la strada che un cameriere prende quando il gruppo chiede di
       stare vicino a qualcuno, o quando il consigliato non gli piace. */
    const p = proponiTavoli(
      [
        tavolo({ label: "T8", posti: 4 }),
        tavolo({ label: "T11", posti: 2 }),
        tavolo({ label: "T12", posti: 2 }),
      ],
      per(4),
    );
    expect(p.migliore?.label).toBe("T8");
    expect(p.unioni.map((u) => u.label)).toEqual(["T11 + T12"]);
  });

  it("non accosta un tavolo che da solo già bastava", () => {
    /* «B3 + T11» per quattro persone è un accostamento senza motivo: B3 ha
       già sei posti, e proporlo significa spostare due tavoli per niente. */
    const p = proponiTavoli(
      [tavolo({ label: "B3", posti: 6 }), tavolo({ label: "T11", posti: 2 })],
      per(4),
    );
    expect(p.unioni).toHaveLength(0);
  });
});
