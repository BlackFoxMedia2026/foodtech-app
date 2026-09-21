import { describe, expect, it } from "vitest";
import {
  accountMascherato,
  complessivo,
  eventiMancanti,
  valutaSalute,
  type LettureAws,
  type LettureNostre,
} from "@/lib/salute-ses";

/**
 * La diagnostica della catena di invio.
 *
 * Il rischio che questi test difendono non è un calcolo sbagliato: è un
 * pannello che grida al guasto quando manca solo un passo di configurazione, o
 * che dice «tutto a posto» quando gli eventi non arrivano da tre giorni. Il
 * primo si smette di guardare, il secondo non lo si guarda mai.
 */

const EVENTI = ["SEND", "DELIVERY", "OPEN", "CLICK", "BOUNCE", "COMPLAINT", "DELIVERY_DELAY"] as const;

const AWS_SANO: LettureAws = {
  account: { sandbox: false, invioAbilitato: true, quota24h: 50_000 },
  tenant: ["foodtech-v1"],
  configurationSet: ["foodtech-v1"],
  destinazioni: { "foodtech-v1": { presente: true, abilitata: true, eventi: [...EVENTI] } },
  costExplorer: "CONNESSO",
};

const NOSTRE_SANE: LettureNostre = {
  localiAttesi: [{ venueId: "v1", nome: "Aurora", tenant: "foodtech-v1", configurationSet: "foodtech-v1" }],
  inviiSes: 100_000,
  conMessageId: 100_000,
  eventiSend: 99_990,
  inviiRecenti: 0,
  ultimoEvento: new Date(Date.now() - 3_600_000),
  ultimaRiconciliazione: new Date(),
};

const aws = (p: Partial<LettureAws>): LettureAws => ({ ...AWS_SANO, ...p });
const nostre = (p: Partial<LettureNostre>): LettureNostre => ({ ...NOSTRE_SANE, ...p });
const voce = (s: ReturnType<typeof valutaSalute>, chiave: string) =>
  s.verifiche.find((v) => v.chiave === chiave)!;

describe("la catena completa", () => {
  it("con tutto a posto lo stato complessivo è operativo", () => {
    const s = valutaSalute(AWS_SANO, NOSTRE_SANE, EVENTI);
    expect(s.complessivo).toBe("OPERATIVO");
  });
});

describe("l'account", () => {
  it("in sandbox è configurazione incompleta, non errore", () => {
    // È un passo che manca, non un guasto: il gestionale funziona lo stesso.
    const s = valutaSalute(aws({ account: { sandbox: true, invioAbilitato: true, quota24h: 200 } }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "account").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
    expect(voce(s, "account").nota).toContain("sandbox");
  });

  it("in produzione con invio sospeso da AWS è un errore vero", () => {
    const s = valutaSalute(aws({ account: { sandbox: false, invioAbilitato: false, quota24h: 50_000 } }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "account").livello).toBe("ERRORE");
    expect(s.complessivo).toBe("ERRORE");
  });

  it("se non riusciamo a leggerlo lo diciamo, invece di inventare", () => {
    const s = valutaSalute(aws({ account: null }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "account").livello).toBe("SCONOSCIUTO");
  });
});

describe("tenant e insiemi di configurazione", () => {
  it("un tenant mancante si vede, con il nome del locale", () => {
    const s = valutaSalute(
      aws({ tenant: [] }),
      nostre({ localiAttesi: [{ venueId: "v1", nome: "Aurora Bistrot", tenant: "foodtech-v1", configurationSet: "foodtech-v1" }] }),
      EVENTI,
    );
    expect(voce(s, "tenant").livello).toBe("ATTENZIONE");
    expect(voce(s, "tenant").elenco).toEqual(["Aurora Bistrot"]);
  });

  it("senza permesso di lettura è «non verificabile», e dice quale permesso serve", () => {
    const s = valutaSalute(aws({ tenant: null }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "tenant").livello).toBe("SCONOSCIUTO");
    expect(voce(s, "tenant").nota).toContain("ses:ListTenants");
  });

  it("un insieme di configurazione mancante non si confonde con un tenant mancante", () => {
    const s = valutaSalute(aws({ configurationSet: [] }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "configurationSet").livello).toBe("ATTENZIONE");
    expect(voce(s, "tenant").livello).toBe("OPERATIVO");
  });
});

describe("le destinazioni eventi: tre fatti, tre righe", () => {
  it("destinazione assente", () => {
    const s = valutaSalute(
      aws({ destinazioni: { "foodtech-v1": { presente: false, abilitata: false, eventi: [] } } }),
      NOSTRE_SANE,
      EVENTI,
    );
    expect(voce(s, "destinazione-presente").livello).toBe("ATTENZIONE");
  });

  it("destinazione presente ma disattivata: accetta la configurazione e non consegna niente", () => {
    const s = valutaSalute(
      aws({ destinazioni: { "foodtech-v1": { presente: true, abilitata: false, eventi: [...EVENTI] } } }),
      NOSTRE_SANE,
      EVENTI,
    );
    expect(voce(s, "destinazione-presente").livello).toBe("OPERATIVO");
    expect(voce(s, "destinazione-abilitata").livello).toBe("ATTENZIONE");
  });

  it("un evento previsto dal codice e non configurato si vede per nome", () => {
    const parziali = EVENTI.filter((e) => e !== "DELIVERY_DELAY");
    const s = valutaSalute(
      aws({ destinazioni: { "foodtech-v1": { presente: true, abilitata: true, eventi: [...parziali] } } }),
      NOSTRE_SANE,
      EVENTI,
    );
    expect(voce(s, "eventi-attesi").livello).toBe("ATTENZIONE");
    expect(voce(s, "eventi-attesi").elenco).toEqual(["DELIVERY_DELAY"]);
  });

  it("gli eventi mancanti si calcolano sull'unione delle destinazioni", () => {
    expect(eventiMancanti({ a: { presente: true, abilitata: true, eventi: ["SEND"] } }, ["SEND", "OPEN"])).toEqual(["OPEN"]);
  });
});

describe("il collegamento fra invii ed eventi", () => {
  it("senza invii non è un errore: non c'è niente da verificare", () => {
    const s = valutaSalute(AWS_SANO, nostre({ inviiSes: 0, inviiRecenti: 0, conMessageId: 0, eventiSend: 0 }), EVENTI);
    expect(voce(s, "message-id").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
    expect(voce(s, "message-id").nota).toContain("Nessun invio SES disponibile");
  });

  it("invii senza identificativo sono un allarme critico", () => {
    // Le email partono e gli eventi non si possono attribuire a nessuno.
    const s = valutaSalute(AWS_SANO, nostre({ conMessageId: 0 }), EVENTI);
    expect(voce(s, "message-id").livello).toBe("ERRORE");
    expect(voce(s, "message-id").nota).toContain("non è possibile collegare");
  });

  it("con gli identificativi al loro posto la copertura è piena", () => {
    const s = valutaSalute(AWS_SANO, NOSTRE_SANE, EVENTI);
    expect(voce(s, "message-id").livello).toBe("OPERATIVO");
    expect(voce(s, "message-id").valore).toContain("100%");
  });
});

describe("gli eventi SEND che tornano indietro", () => {
  it("qualche evento in ritardo rientra nella tolleranza", () => {
    const s = valutaSalute(AWS_SANO, nostre({ eventiSend: 99_000 }), EVENTI);
    expect(voce(s, "pipeline").livello).toBe("OPERATIVO");
  });

  it("metà eventi mancanti no", () => {
    const s = valutaSalute(AWS_SANO, nostre({ eventiSend: 50_000 }), EVENTI);
    expect(voce(s, "pipeline").livello).toBe("ATTENZIONE");
    expect(voce(s, "pipeline").valore).toContain("50000 mancanti");
  });

  it("gli invii appena partiti non contano come eventi persi", () => {
    // I loro eventi sono ancora in volo: contarli farebbe lampeggiare il
    // pannello ogni volta che parte una campagna, cioè quando lo si guarda.
    const s = valutaSalute(AWS_SANO, nostre({ inviiSes: 0, inviiRecenti: 5_000, eventiSend: 0, conMessageId: 5_000 }), EVENTI);
    expect(voce(s, "pipeline").valore).toContain("troppo recenti");
    expect(voce(s, "pipeline").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
  });

  it("nessun evento mai arrivato indica la sottoscrizione mancante", () => {
    const s = valutaSalute(AWS_SANO, nostre({ eventiSend: 0, ultimoEvento: null }), EVENTI);
    expect(voce(s, "pipeline").nota).toContain("sottoscrizione SNS");
    expect(voce(s, "webhook").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
    expect(voce(s, "webhook").valore).toBe("nessun evento ricevuto");
  });

  it("un webhook muto da giorni è un'attenzione, non un guasto dichiarato", () => {
    const s = valutaSalute(AWS_SANO, nostre({ ultimoEvento: new Date(Date.now() - 5 * 86_400_000) }), EVENTI);
    expect(voce(s, "webhook").livello).toBe("ATTENZIONE");
  });
});

describe("Cost Explorer", () => {
  it("connesso", () => {
    expect(voce(valutaSalute(AWS_SANO, NOSTRE_SANE, EVENTI), "costExplorer").livello).toBe("OPERATIVO");
  });

  it("disabilitato da noi non è un problema, e dice come si accende", () => {
    const s = valutaSalute(aws({ costExplorer: "DISABILITATO" }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "costExplorer").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
    expect(voce(s, "costExplorer").nota).toContain("AWS_COST_EXPLORER_ENABLED");
  });

  it("permesso negato dice quale permesso serve", () => {
    const s = valutaSalute(aws({ costExplorer: "PERMESSO_MANCANTE" }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "costExplorer").nota).toContain("ce:GetCostAndUsage");
  });

  it("«non attivato» non è un problema di permessi, e lo dice", () => {
    /* Caso vero, 18 settembre: la policy era giusta e Amazon rispondeva
       comunque AccessDenied, perché Cost Explorer non era mai stato acceso
       sull'account. Confonderli manda a rileggere un JSON che andava bene. */
    const s = valutaSalute(aws({ costExplorer: "NON_ATTIVO" }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "costExplorer").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
    expect(voce(s, "costExplorer").valore).toContain("non attivato");
    expect(voce(s, "costExplorer").nota).toContain("console di fatturazione");
    expect(voce(s, "costExplorer").nota).not.toContain("ce:GetCostAndUsage");
  });

  it("«dati in preparazione» non manda a cercare un guasto", () => {
    /* Caso vero, 18 settembre: attivato Cost Explorer, il permesso passa e
       Amazon risponde DataUnavailable. È un'attesa, non un errore. */
    const s = valutaSalute(aws({ costExplorer: "IN_PREPARAZIONE" }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "costExplorer").livello).toBe("CONFIGURAZIONE_INCOMPLETA");
    expect(voce(s, "costExplorer").nota).toContain("Non c'è niente da fare");
  });

  it("AWS che non risponde è attenzione", () => {
    const s = valutaSalute(aws({ costExplorer: "ERRORE" }), NOSTRE_SANE, EVENTI);
    expect(voce(s, "costExplorer").livello).toBe("ATTENZIONE");
  });
});

describe("lo stato complessivo", () => {
  it("un errore batte tutto", () => {
    expect(complessivo([
      { chiave: "a", titolo: "", livello: "OPERATIVO", valore: "" },
      { chiave: "b", titolo: "", livello: "ERRORE", valore: "" },
      { chiave: "c", titolo: "", livello: "ATTENZIONE", valore: "" },
    ])).toBe("ERRORE");
  });

  it("«manca un passo» non diventa «attenzione»", () => {
    expect(complessivo([
      { chiave: "a", titolo: "", livello: "OPERATIVO", valore: "" },
      { chiave: "b", titolo: "", livello: "CONFIGURAZIONE_INCOMPLETA", valore: "" },
    ])).toBe("CONFIGURAZIONE_INCOMPLETA");
  });

  it("non verificabile è l'ultimo: riguarda noi, non il servizio", () => {
    expect(complessivo([
      { chiave: "a", titolo: "", livello: "OPERATIVO", valore: "" },
      { chiave: "b", titolo: "", livello: "SCONOSCIUTO", valore: "" },
    ])).toBe("SCONOSCIUTO");
  });
});

describe("l'identificativo dell'account non si mostra per intero", () => {
  it("resta riconoscibile ma non copiabile", () => {
    expect(accountMascherato("480174684409")).toBe("4801******09");
  });

  it("senza account non si inventa niente", () => {
    expect(accountMascherato(undefined)).toBe("non impostato");
  });
});
