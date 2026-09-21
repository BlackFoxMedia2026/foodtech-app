import { describe, expect, it } from "vitest";
import {
  NESSUNA_COMANDA,
  TONO_STATO,
  riassumiComande,
  richiamoTavolo,
  statoTavoloStaff,
  type ComandeDelTavolo,
} from "@/lib/stato-tavolo-staff";

/**
 * Lo stato del tavolo come lo legge chi lo serve.
 *
 * La cosa che queste prove tengono ferma è che **niente di nuovo è stato
 * inventato**: i tre stati in più — ordinazione, comanda inviata, in servizio
 * — sono raffinamenti di `OCCUPATO`, e tutto il resto passa inalterato dalla
 * derivazione della sala. Se un giorno un tavolo libero cominciasse a
 * comparire «in servizio» perché qualcuno ha una bozza aperta, la sala e la
 * Staff App direbbero due cose diverse dello stesso tavolo.
 */

const con = (p: Partial<ComandeDelTavolo>): ComandeDelTavolo => ({ ...NESSUNA_COMANDA, ...p });
const senzaConto = { contoRichiesto: false, pagamentoInCorso: false };

describe("fuori dalla seduta non si raffina niente", () => {
  it("libero, prenotato, in arrivo e bloccato passano inalterati", () => {
    expect(statoTavoloStaff("LIBERO")).toBe("LIBERO");
    expect(statoTavoloStaff("PRENOTATO")).toBe("PRENOTATO");
    expect(statoTavoloStaff("IN_ARRIVO")).toBe("IN_ARRIVO");
    expect(statoTavoloStaff("BLOCCATO")).toBe("BLOCCATO");
  });

  it("«da riassettare» è il nome di PULIZIA in sala", () => {
    expect(statoTavoloStaff("PULIZIA")).toBe("DA_LIBERARE");
  });

  it("un tavolo libero resta libero anche con una bozza appesa", () => {
    // Una bozza dimenticata da un servizio precedente non deve far sembrare
    // occupato un tavolo su cui non c'è nessuno.
    expect(statoTavoloStaff("LIBERO", con({ bozzeConRighe: 2 }))).toBe("LIBERO");
  });
});

describe("dentro la seduta, il raffinamento", () => {
  it("seduti e nessuna comanda: qualcuno deve andare a prendere l'ordine", () => {
    expect(statoTavoloStaff("OCCUPATO", NESSUNA_COMANDA, senzaConto)).toBe("ACCOMODATI");
  });

  it("una bozza **con righe** significa ordinazione in corso", () => {
    expect(statoTavoloStaff("OCCUPATO", con({ bozzeConRighe: 1 }), senzaConto)).toBe("ORDINAZIONE");
  });

  it("una bozza vuota non conta: aprirla non è ordinare", () => {
    expect(statoTavoloStaff("OCCUPATO", riassumiComande([{ status: "BOZZA", righe: 0 }]), senzaConto)).toBe(
      "ACCOMODATI",
    );
  });

  it("partita e non ancora presa in mano: comanda inviata", () => {
    expect(statoTavoloStaff("OCCUPATO", con({ inviate: 1 }), senzaConto)).toBe("COMANDA_INVIATA");
  });

  it("in preparazione o pronta: in servizio", () => {
    expect(statoTavoloStaff("OCCUPATO", con({ inPreparazione: 1 }), senzaConto)).toBe("IN_SERVIZIO");
    expect(statoTavoloStaff("OCCUPATO", con({ pronte: 1 }), senzaConto)).toBe("IN_SERVIZIO");
  });
});

describe("l'ordine di urgenza", () => {
  it("il pagamento in corso vince su tutto: il dolce lo porta la cucina, i soldi li perde il locale", () => {
    expect(
      statoTavoloStaff("OCCUPATO", con({ inPreparazione: 1 }), {
        contoRichiesto: true,
        pagamentoInCorso: true,
      }),
    ).toBe("PAGAMENTO");
  });

  it("il conto chiesto vince sui piatti in preparazione", () => {
    expect(
      statoTavoloStaff("OCCUPATO", con({ pronte: 2 }), { contoRichiesto: true, pagamentoInCorso: false }),
    ).toBe("CONTO");
  });

  it("senza comande la stima della sala si dichiara come stima, non come fatto", () => {
    // `CONTO` della sala nasce dalla durata superata: è un'ipotesi. Dirla
    // «conto richiesto» manderebbe un cameriere al tavolo a dire «me l'hai
    // chiesto tu» a qualcuno che non ha chiesto niente.
    expect(statoTavoloStaff("CONTO", NESSUNA_COMANDA, senzaConto)).toBe("VERSO_IL_CONTO");
  });

  it("chi l'ha chiesto davvero ha uno stato suo, e più urgente", () => {
    expect(
      statoTavoloStaff("OCCUPATO", NESSUNA_COMANDA, { contoRichiesto: true, pagamentoInCorso: false }),
    ).toBe("CONTO");
    expect(TONO_STATO.CONTO).toBe("urgente");
    expect(TONO_STATO.VERSO_IL_CONTO).toBe("attesa");
  });

  it("ma con dei secondi in preparazione la stima cede al fatto", () => {
    // Un tavolo seduto da due ore con i secondi in cucina non è «al conto».
    expect(statoTavoloStaff("CONTO", con({ inPreparazione: 1 }), senzaConto)).toBe("IN_SERVIZIO");
  });
});

describe("il richiamo: se bisogna alzarsi", () => {
  const base = { comande: NESSUNA_COMANDA, piattiPronti: 0, contoRichiesto: false, allergie: 0, notaImportante: null };

  it("un tavolo tranquillo non richiama niente", () => {
    expect(richiamoTavolo(base)).toBeNull();
  });

  it("i piatti pronti vengono prima del conto", () => {
    const r = richiamoTavolo({ ...base, piattiPronti: 2, contoRichiesto: true });
    expect(r).toEqual({ tipo: "PIATTI_PRONTI", testo: "2 piatti pronti" });
  });

  it("il singolare si scrive al singolare", () => {
    expect(richiamoTavolo({ ...base, piattiPronti: 1 })?.testo).toBe("1 piatto pronto");
    expect(richiamoTavolo({ ...base, allergie: 1 })?.testo).toBe("1 allergia al tavolo");
  });

  it("quando si sa quale allergia, si scrive quale", () => {
    const r = richiamoTavolo({ ...base, allergie: 1, dettaglioAllergia: "Glutine" });
    expect(r).toEqual({ tipo: "ALLERGIA", testo: "Allergie: Glutine" });
  });

  it("il conto viene prima di un'allergia già registrata", () => {
    // L'allergia è già scritta sulla comanda e la cucina l'ha vista: il
    // richiamo serve a chi deve **muoversi adesso**.
    expect(richiamoTavolo({ ...base, contoRichiesto: true, allergie: 3 })?.tipo).toBe("CONTO");
  });
});

describe("il riassunto delle comande", () => {
  it("conta per stato, e le bozze solo se hanno righe", () => {
    const r = riassumiComande([
      { status: "BOZZA", righe: 0 },
      { status: "BOZZA", righe: 3 },
      { status: "INVIATA", righe: 2 },
      { status: "RICEVUTA", righe: 1 },
      { status: "IN_PREPARAZIONE", righe: 4 },
      { status: "PRONTA", righe: 2 },
      { status: "SERVITA", righe: 2 },
      { status: "ANNULLATA", righe: 1 },
    ]);
    expect(r).toEqual({ bozzeConRighe: 1, inviate: 2, inPreparazione: 1, pronte: 1 });
  });
});
