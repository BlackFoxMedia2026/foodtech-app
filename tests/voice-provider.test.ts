import { describe, expect, it } from "vitest";
import {
  CapacitaMancanteError,
  fornitoreBlackFox,
  fornitoreFinto,
  richiediCapacita,
} from "@/server/voice/provider";
import {
  NESSUNA_CAPACITA,
  NOME_CAPACITA,
  ORDINE_CAPACITA,
  utilizzabile,
  type CapacitaVoice,
} from "@/lib/voice-capacita";

/**
 * L'astrazione del fornitore.
 *
 * Quello che conta qui non è che l'interfaccia compili: è che **il valore di
 * partenza sia «no»**. Un fornitore nuovo che eredita un elenco di sì produce
 * pulsanti che non funzionano, e il difetto si scopre con una persona in linea.
 */

describe("il valore di partenza è no", () => {
  it("nessuna capacità è vera, in `NESSUNA_CAPACITA`", () => {
    for (const [nome, valore] of Object.entries(NESSUNA_CAPACITA)) {
      expect(valore, `${nome} dovrebbe partire da falso`).toBe(false);
    }
  });

  it("un fornitore che non dichiara niente non sa fare niente", () => {
    /* `fornitoreFinto()` senza argomenti dichiara solo «riceve chiamate»,
       perché senza quella non servirebbe a nulla. Tutto il resto è no. */
    const f = fornitoreFinto();
    expect(f.capacita.entranti).toBe(true);
    expect(f.capacita.trasferimento).toBe(false);
    expect(f.capacita.registrazione).toBe(false);
    expect(f.capacita.ai).toBe(false);
  });

  it("ogni capacità ha un nome leggibile e un posto nell'ordine", () => {
    /* Se si aggiunge una capacità e si dimentica il nome, la schermata dello
       stato mostra una chiave del codice a un ristoratore. */
    const chiavi = Object.keys(NESSUNA_CAPACITA) as (keyof CapacitaVoice)[];
    for (const k of chiavi) {
      expect(NOME_CAPACITA[k], `manca il nome di ${k}`).toBeTruthy();
      expect(ORDINE_CAPACITA, `manca ${k} nell'ordine`).toContain(k);
    }
    expect(ORDINE_CAPACITA).toHaveLength(chiavi.length);
  });
});

describe("Black Fox Voice, com'è il 18 settembre 2026", () => {
  it("riceve le chiamate e si risponde dal browser", () => {
    expect(fornitoreBlackFox.capacita.entranti).toBe(true);
    expect(fornitoreBlackFox.capacita.browser).toBe(true);
    expect(utilizzabile(fornitoreBlackFox.capacita)).toBe(true);
  });

  it("NON trasferisce, non mette in attesa, non registra, non ha una voce", () => {
    /* Il centralino saprebbe farlo — è Asterisk — ma non espone niente a
       Tavolo per farlo. Dichiararlo vero farebbe comparire quattro pulsanti
       che non funzionano, e questo test è quello che lo impedisce. */
    expect(fornitoreBlackFox.capacita.trasferimento).toBe(false);
    expect(fornitoreBlackFox.capacita.attesa).toBe(false);
    expect(fornitoreBlackFox.capacita.uscenti).toBe(false);
    expect(fornitoreBlackFox.capacita.registrazione).toBe(false);
    expect(fornitoreBlackFox.capacita.trascrizione).toBe(false);
    expect(fornitoreBlackFox.capacita.ai).toBe(false);
  });

  it("non espone i metodi che non sa eseguire", () => {
    /* Non c'è un `trasferisci` che solleva «non supportato»: non c'è. Un
       metodo presente invita a chiamarlo. */
    expect(fornitoreBlackFox.trasferisci).toBeUndefined();
    expect(fornitoreBlackFox.chiama).toBeUndefined();
    expect(fornitoreBlackFox.registrazione).toBeUndefined();
  });
});

describe("il guardiano delle capacità", () => {
  it("ferma un'operazione che il fornitore non sa fare", () => {
    /* Sul server, non nell'interfaccia: nascondere un pulsante non impedisce a
       nessuno di chiamare l'indirizzo. */
    expect(() => richiediCapacita(fornitoreBlackFox, "trasferimento")).toThrow(
      CapacitaMancanteError,
    );
    expect(() => richiediCapacita(fornitoreBlackFox, "entranti")).not.toThrow();
  });

  it("dice quale capacità manca, non «non supportato»", () => {
    try {
      richiediCapacita(fornitoreBlackFox, "registrazione");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CapacitaMancanteError);
      expect((err as CapacitaMancanteError).capacita).toBe("registrazione");
    }
  });
});

describe("leggere un evento del fornitore", () => {
  it("accetta quello che il nostro centralino manda", () => {
    const e = fornitoreBlackFox.leggiEvento({
      id: "c-1",
      phone: "+393331234567",
      stato: "RINGING",
    });
    expect(e).toEqual({
      idEsterno: "c-1",
      numero: "+393331234567",
      numeroChiamato: null,
      stato: "RINGING",
    });
  });

  it("rifiuta quello che non è un evento, invece di inventare un valore", () => {
    for (const no of [
      null,
      undefined,
      "stringa",
      {},
      { id: "" },
      { id: "c", stato: "PRENOTATO" },
      { stato: "RINGING" },
    ]) {
      expect(fornitoreBlackFox.leggiEvento(no)).toBeNull();
    }
  });

  it("l'ora arriva solo se c'è, e non come `undefined` esplicito", () => {
    const senza = fornitoreBlackFox.leggiEvento({ id: "c", stato: "MISSED" });
    expect(senza && "quando" in senza).toBe(false);
    const con = fornitoreBlackFox.leggiEvento({
      id: "c",
      stato: "MISSED",
      quando: "2026-09-18T10:00:00.000Z",
    });
    expect(con?.quando?.toISOString()).toBe("2026-09-18T10:00:00.000Z");
  });
});

describe("il fornitore di prova", () => {
  it("si possono accendere le capacità, e serve", () => {
    /* Senza poterle cambiare, la regola «quello che non si sa fare non
       compare» non si potrebbe provare: si potrebbe verificare solo il ramo
       «non compare». */
    const con = fornitoreFinto({ trasferimento: true, attesa: true });
    expect(con.capacita.trasferimento).toBe(true);
    expect(con.capacita.attesa).toBe(true);
    // e quelle non nominate restano no
    expect(con.capacita.registrazione).toBe(false);
  });

  it("si chiama «mock», così in un registro si riconosce", () => {
    expect(fornitoreFinto().nome).toBe("mock");
  });
});
