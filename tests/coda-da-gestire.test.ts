import { describe, expect, it } from "vitest";
import {
  chiedeUnGesto,
  MINUTI_PRIMA_DELLA_COMANDA,
  MINUTI_PRIMA_DEL_CONTROLLO,
  RANGO_RICHIAMO,
  richiamoTavolo,
  type SegnaliRichiamo,
} from "@/lib/stato-tavolo-staff";
import { confrontaPerUrgenza, type TavoloStaff } from "@/server/staff-app/sala";

/**
 * **La coda «Da gestire ora».**
 *
 * Il difetto da cui è partita questa sezione, e la cosa che queste prove
 * tengono ferma: una famiglia appena accomodata — nessuna allergia, nessuna
 * nota, nessun piatto pronto — **deve comparire**. Prima non compariva da
 * nessuna parte: non era un tavolo assegnato, non era libero, e non aveva un
 * richiamo. Il cameriere doveva ricordarsela.
 */

const base: SegnaliRichiamo = {
  stato: "IN_SERVIZIO",
  piattiPronti: 0,
  contoRichiesto: false,
  allergie: 0,
  notaImportante: null,
};

describe("il richiamo: se bisogna alzarsi", () => {
  it("un tavolo con la cucina al lavoro non chiede niente", () => {
    // È il caso normale di metà sala: la cucina ci sta lavorando e chi serve
    // non deve fare nulla. Una coda che lo elencasse sarebbe un elenco.
    expect(richiamoTavolo(base)).toBeNull();
  });

  it("**seduti e senza comanda**: è il tavolo che prima spariva", () => {
    const r = richiamoTavolo({ ...base, stato: "ACCOMODATI", daMinuti: 3 });
    expect(r?.tipo).toBe("SENZA_COMANDA");
    expect(r?.etichetta).toBe("Appena seduti");
    expect(r?.testo).toBe("Nessuna comanda ancora");
    expect(r?.daMinuti).toBe(3);
  });

  it("dopo l'attesa di cortesia l'etichetta cambia, il rango no", () => {
    const appena = richiamoTavolo({ ...base, stato: "ACCOMODATI", daMinuti: 2 });
    const atteso = richiamoTavolo({
      ...base,
      stato: "ACCOMODATI",
      daMinuti: MINUTI_PRIMA_DELLA_COMANDA,
    });
    expect(appena?.etichetta).toBe("Appena seduti");
    expect(atteso?.etichetta).toBe("Comanda da prendere");
    // Stesso rango: fra due tavoli senza comanda decide chi aspetta da più
    // tempo, non un salto di priorità che scavalcherebbe un conto chiesto.
    expect(atteso?.rango).toBe(appena?.rango);
  });

  it("i piatti pronti vengono prima del conto, e il conto prima del resto", () => {
    const piatti = richiamoTavolo({ ...base, piattiPronti: 2, contoRichiesto: true });
    expect(piatti?.tipo).toBe("PIATTI_PRONTI");
    expect(piatti?.testo).toBe("2 piatti pronti al passe");

    const conto = richiamoTavolo({ ...base, stato: "CONTO", contoRichiesto: true, allergie: 3 });
    expect(conto?.tipo).toBe("CONTO");
  });

  it("il singolare si scrive al singolare", () => {
    expect(richiamoTavolo({ ...base, piattiPronti: 1 })?.testo).toBe("1 piatto pronto al passe");
    expect(richiamoTavolo({ ...base, allergie: 1 })?.testo).toBe("1 allergia al tavolo");
  });

  it("quando si sa quale allergia, si scrive quale", () => {
    const r = richiamoTavolo({ ...base, allergie: 1, dettaglioAllergia: "Glutine" });
    expect(r?.tipo).toBe("ALLERGIA");
    expect(r?.testo).toBe("Allergie: Glutine");
  });

  it("«da controllare» vuole che abbiano finito, e che sia passato un po'", () => {
    const appenaServito = richiamoTavolo({ ...base, stato: "SERVITO", daMinuti: 2 });
    expect(appenaServito).toBeNull();

    const finito = richiamoTavolo({
      ...base,
      stato: "SERVITO",
      daMinuti: MINUTI_PRIMA_DEL_CONTROLLO,
    });
    expect(finito?.tipo).toBe("DA_CONTROLLARE");
  });

  it("chi sta pagando non si va a controllare", () => {
    // Chiedere «tutto bene?» a chi ha la carta in mano è il modo di sembrare
    // di avere fretta. `PAGAMENTO` vince su `SERVITO` già in
    // `statoTavoloStaff`, quindi qui non c'è nessun controllo da fare.
    expect(richiamoTavolo({ ...base, stato: "PAGAMENTO", daMinuti: 40 })).toBeNull();
  });

  it("una nota non è una cosa da fare, e non entra in coda", () => {
    // «Prima volta qui» sulla card di un tavolo che va servito per tutt'altro
    // motivo era il difetto da cui è partita questa riscrittura.
    const r = richiamoTavolo({ ...base, notaImportante: "Prima volta qui" });
    expect(r?.tipo).toBe("NOTA");
    expect(chiedeUnGesto(r)).toBe(false);
    expect(chiedeUnGesto(richiamoTavolo({ ...base, stato: "ACCOMODATI", daMinuti: 1 }))).toBe(true);
  });

  it("un tavolo da riassettare è lavoro vero, ma ultimo", () => {
    const r = richiamoTavolo({ ...base, stato: "DA_LIBERARE", daMinuti: 5 });
    expect(r?.tipo).toBe("DA_LIBERARE");
    expect(RANGO_RICHIAMO.DA_LIBERARE).toBeGreaterThan(RANGO_RICHIAMO.SENZA_COMANDA);
  });
});

/* -------------------------------------------------------------------------- */
/*  L'ordine della coda                                                       */
/* -------------------------------------------------------------------------- */

function tavolo(label: string, segnali: Partial<SegnaliRichiamo> & { mio?: boolean }): TavoloStaff {
  const { mio = false, ...resto } = segnali;
  return {
    tableId: label,
    label,
    roomId: null,
    roomName: null,
    posti: 4,
    shape: "RECT",
    larghezza: null,
    altezza: null,
    mio,
    coperto: [],
    scoperto: !mio,
    stato: resto.stato ?? "ACCOMODATI",
    tono: "attivo",
    ospiti: 4,
    ospite: "Ospite",
    bookingId: "b",
    daMinuti: null,
    daMinutiStato: resto.daMinuti ?? null,
    dalle: null,
    orderId: null,
    totaleCents: null,
    residuoCents: null,
    richiamo: richiamoTavolo({ ...base, ...resto }),
    badge: {
      bozza: false,
      inviate: 0,
      inPreparazione: 0,
      piattiPronti: resto.piattiPronti ?? 0,
      contoRichiesto: resto.contoRichiesto ?? false,
      allergie: resto.allergie ?? 0,
    },
    notaOspite: null,
  } satisfies TavoloStaff;
}

describe("l'ordine della coda", () => {
  it("segue la scala del brief: piatti, conto, tavolo senza comanda", () => {
    const coda = [
      tavolo("T3", { stato: "ACCOMODATI", daMinuti: 4 }),
      tavolo("T1", { stato: "CONTO", contoRichiesto: true, daMinuti: 1 }),
      tavolo("T2", { piattiPronti: 1, daMinuti: 1 }),
    ].sort(confrontaPerUrgenza);

    expect(coda.map((t) => t.label)).toEqual(["T2", "T1", "T3"]);
  });

  it("a parità di motivo passa avanti chi aspetta da più tempo", () => {
    const coda = [
      tavolo("T5", { stato: "ACCOMODATI", daMinuti: 2 }),
      tavolo("T9", { stato: "ACCOMODATI", daMinuti: 14 }),
      tavolo("T7", { stato: "ACCOMODATI", daMinuti: 8 }),
    ].sort(confrontaPerUrgenza);

    expect(coda.map((t) => t.label)).toEqual(["T9", "T7", "T5"]);
  });

  it("il tavolo di un collega che chiede qualcosa batte il mio che tace", () => {
    // In sala si serve il locale, non il proprio rango.
    const coda = [
      tavolo("T4", { mio: true, stato: "IN_SERVIZIO" }),
      tavolo("T8", { mio: false, piattiPronti: 2, daMinuti: 3 }),
    ].sort(confrontaPerUrgenza);

    expect(coda[0].label).toBe("T8");
  });

  it("chi non chiede niente resta in fondo, in ordine di etichetta", () => {
    const coda = [
      tavolo("T10", { stato: "IN_SERVIZIO" }),
      tavolo("T2", { stato: "IN_SERVIZIO" }),
      tavolo("T1", { stato: "ACCOMODATI", daMinuti: 1 }),
    ].sort(confrontaPerUrgenza);

    expect(coda.map((t) => t.label)).toEqual(["T1", "T2", "T10"]);
  });
});
