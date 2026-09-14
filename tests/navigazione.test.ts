import { describe, expect, it } from "vitest";
import {
  ALL_NAV,
  MOBILE_NAV,
  PRIMARY_NAV,
  PROFILE_NAV,
  isNavActive,
  primarieFuoriDallaBarra,
  profiloPerGruppo,
  titoloPagina,
} from "@/components/shell/nav-items";

/**
 * La navigazione.
 *
 * Tre cose che devono reggere, e si rompono tutte in silenzio.
 *
 * **Una voce sola accesa per volta.** Quando due percorsi si contengono per
 * prefisso — `/service` e `/service/room` — senza la regola della
 * corrispondenza più lunga si accendono due voci insieme e la navigazione dice
 * due cose diverse nello stesso momento. Nessun errore, nessun test rosso:
 * solo un prodotto che sembra confuso.
 *
 * **La divisione fra i due menu.** In barra ciò che si tocca a locale aperto,
 * sotto l'avatar ciò che si apre a locale chiuso. È l'unica regola del
 * redesign, e una voce aggiunta al posto sbagliato la scioglie senza rompere
 * niente.
 *
 * **Le destinazioni sono quelle giuste.** «Sala» deve portare alla sala viva e
 * non all'editor della piantina. È stato il difetto più grave trovato
 * nell'audit del 9 settembre, ed è il genere di cosa che una riscrittura
 * distratta rimette com'era.
 */

describe("una voce sola accesa", () => {
  const percorsi = [
    "/overview",
    "/service",
    "/service/room",
    "/bookings",
    "/bookings/abc",
    "/bookings/new",
    "/waitlist",
    "/guests",
    "/guests/abc",
    "/guests/doppioni",
    "/floor",
    "/menu",
    "/marketing",
    "/marketing/coupons",
    "/campaigns",
    "/campaigns/abc",
    "/insights",
    "/settings",
    "/settings/brand",
    "/staff",
    "/experiences",
    "/payments",
  ];

  for (const percorso of percorsi) {
    it(`${percorso} accende esattamente una voce`, () => {
      const accese = ALL_NAV.filter((v) => isNavActive(percorso, v));
      expect(accese.map((v) => v.label)).toHaveLength(1);
    });
  }

  it("la sala viva sta dentro Servizio, e accende «Servizio»", () => {
    // `/service/room` è una vista del Servizio (la linguetta «Sala»), non una
    // destinazione della barra: la voce accesa è quella che la contiene.
    const accese = ALL_NAV.filter((v) => isNavActive("/service/room", v));
    expect(accese.map((v) => v.label)).toEqual(["Servizio"]);
  });

  it("il servizio accende «Servizio»", () => {
    const accesa = ALL_NAV.find((v) => isNavActive("/service", v));
    expect(accesa?.label).toBe("Servizio");
  });

  it("le campagne accendono «Marketing» — la voce si chiama diversamente dal percorso", () => {
    const accesa = ALL_NAV.find((v) => isNavActive("/campaigns/abc/edit", v));
    expect(accesa?.label).toBe("Marketing");
  });

  it("un percorso che non è di nessuno non accende niente", () => {
    expect(ALL_NAV.filter((v) => isNavActive("/onboarding", v))).toHaveLength(0);
  });
});

describe("la barra centrale", () => {
  it("porta le sette voci di servizio più Marketing, in quest'ordine", () => {
    // L'ordine è il giro di una serata: la giornata, il servizio, il telefono,
    // la sala, il cliente, chi è in turno, il piatto — con Marketing spostata
    // qui dal menu del profilo, prima di Menu.
    expect(PRIMARY_NAV.map((v) => v.label)).toEqual([
      "Panoramica",
      "Servizio",
      "Prenotazioni",
      "Sala",
      "Ospiti",
      "Staff",
      "Marketing",
      "Menu",
    ]);
  });

  it("non porta niente di amministrativo: quello sta sotto l'avatar", () => {
    // Se una di queste tornasse in barra, il criterio («lo apro mentre il
    // locale lavora?») smetterebbe di spiegare la divisione. Marketing è
    // l'eccezione voluta e non fa parte di questo controllo.
    const inBarra = new Set(PRIMARY_NAV.map((v) => v.href));
    for (const href of ["/experiences", "/insights", "/payments", "/settings"]) {
      expect(inBarra.has(href)).toBe(false);
    }
  });

  it("nessuna voce compare due volte, in nessuno dei due menu", () => {
    const href = ALL_NAV.map((v) => v.href);
    expect(new Set(href).size).toBe(href.length);
    const etichette = ALL_NAV.map((v) => v.label);
    expect(new Set(etichette).size).toBe(etichette.length);
  });

  it("«Camerieri» non esiste più: la sezione si chiama Staff", () => {
    // Il nome vecchio descriveva metà della pagina — lì dentro ci sono anche
    // i ruoli di cucina, i reparti e i contratti.
    expect(ALL_NAV.map((v) => v.label)).not.toContain("Camerieri");
    const staff = PRIMARY_NAV.find((v) => v.label === "Staff");
    expect(staff?.href).toBe("/staff");
  });
});

describe("il menu del profilo", () => {
  it("porta le sezioni amministrative, raggruppate", () => {
    const gruppi = profiloPerGruppo();
    expect(gruppi.map((g) => g.label)).toEqual(["Gestione", "Account"]);
    const gestione = gruppi[0].voci.map((v) => v.href);
    for (const href of ["/experiences", "/insights", "/payments"]) {
      expect(gestione).toContain(href);
    }
    expect(gruppi[1].voci.map((v) => v.href)).toEqual(["/settings"]);
  });

  it("ogni voce sta in un gruppo: nessuna finisce fuori dall'elenco a schermo", () => {
    // `profiloPerGruppo()` filtra per gruppo: una voce senza gruppo esiste
    // nella configurazione e non compare da nessuna parte.
    const inGruppi = profiloPerGruppo().flatMap((g) => g.voci);
    expect(inGruppi).toHaveLength(PROFILE_NAV.length);
  });
});

describe("le destinazioni", () => {
  it("«Sala» porta alla sala del locale", () => {
    /*
      `/floor` è la sala vera: i tavoli in pianta, i posti, chi copre quale
      tavolo, il turno e la data. Per un giorno questa voce ha puntato su
      `/service/room` con l'idea che `/floor` fosse «l'editor delle
      piantine» — non lo è, l'editor si apre da lì — e il risultato era che
      «Sala» mostrava una vista a riquadri che assomiglia poco al locale
      mentre la sala vera finiva sotto «Altro».
    */
    const sala = PRIMARY_NAV.find((v) => v.label === "Sala");
    expect(sala?.href).toBe("/floor");
  });

  it("la sala non compare due volte nella navigazione", () => {
    // Era anche sotto «Altro» col nome «Piantina»: due voci per la stessa
    // schermata sono due nomi per la stessa cosa.
    expect(ALL_NAV.filter((v) => v.href === "/floor")).toHaveLength(1);
  });

  it("nessuna funzione è sparita: ogni voce di prima ha ancora una casa", () => {
    // L'elenco delle destinazioni che esistevano prima del redesign, con
    // `/waiters` diventato `/staff` (il vecchio percorso reindirizza). Se una
    // sparisce, questo test lo dice: semplificare non vuol dire togliere.
    const prima = [
      "/overview", "/service", "/bookings", "/floor", "/waitlist", "/guests",
      "/staff", "/menu", "/experiences", "/marketing", "/insights",
      "/payments", "/settings",
    ];
    const adesso = new Set(ALL_NAV.map((v) => v.href));
    for (const href of prima) expect(adesso.has(href)).toBe(true);
  });
});

describe("la barra in basso del telefono", () => {
  it("ha quattro voci, e la quinta è «Altro»", () => {
    expect(MOBILE_NAV).toHaveLength(4);
  });

  it("porta le prenotazioni, che sono l'unica cosa che tutti i ruoli operativi possono fare", () => {
    expect(MOBILE_NAV.map((v) => v.href)).toContain("/bookings");
  });

  it("porta la sala", () => {
    expect(MOBILE_NAV.map((v) => v.href)).toContain("/floor");
  });

  it("ogni voce della barra viene dalla navigazione principale", () => {
    // Se una voce fosse definita a parte, il nome potrebbe divergere fra
    // telefono e scrivania: è il difetto dei «due vocabolari» già corretto una
    // volta, quando la Panoramica si chiamava «Oggi» sul telefono.
    for (const voce of MOBILE_NAV) expect(PRIMARY_NAV).toContain(voce);
  });

  it("«Altro» raccoglie le voci principali che non entrano nella barra, e nient'altro", () => {
    // Le sezioni amministrative stanno sotto l'avatar, che su telefono c'è
    // come su scrivania: elencarle anche qui sarebbe la stessa pagina
    // raggiungibile da due strade sullo stesso schermo.
    expect(primarieFuoriDallaBarra().map((v) => v.label)).toEqual(["Ospiti", "Staff", "Marketing", "Menu"]);
    expect(primarieFuoriDallaBarra().every((v) => PRIMARY_NAV.includes(v))).toBe(true);
  });
});

/**
 * Il titolo della pagina, che adesso vive **nella testata**.
 *
 * Le pagine non lo scrivono più: lo scrive la barra in alto, accanto al
 * marchio del locale. Il che vuol dire che se questa funzione dice `null` su
 * un percorso vero, quella schermata resta **senza nome** — nessun errore,
 * nessun test rosso, solo una pagina che non dice cos'è.
 */
describe("il titolo della pagina", () => {
  it("prende il nome dalla voce di navigazione", () => {
    expect(titoloPagina("/service")?.lungo).toBe("Servizio");
    expect(titoloPagina("/bookings")?.lungo).toBe("Prenotazioni");
    expect(titoloPagina("/staff")?.lungo).toBe("Staff");
    expect(titoloPagina("/floor")?.lungo).toBe("Sala");
  });

  it("sul telefono usa l'abbreviazione della barra, non un altro nome", () => {
    // «Prenotazioni» non entra fra il marchio e le icone di destra. La forma
    // corta deve essere quella che si legge già nella barra in basso:
    // due parole diverse per la stessa pagina sono due vocabolari.
    expect(titoloPagina("/bookings")?.breve).toBe("Prenot.");
    expect(titoloPagina("/service")?.breve).toBe("Servizio");
  });

  it("sulle pagine di dettaglio resta il nome della sezione", () => {
    // Lì il titolo è il nome di chi si sta guardando, e lo scrive la pagina:
    // la testata dice da dove si viene.
    expect(titoloPagina("/guests/abc")?.lungo).toBe("Ospiti");
    expect(titoloPagina("/bookings/abc")?.lungo).toBe("Prenotazioni");
  });

  it("le sottopagine con un nome loro battono la sezione che le contiene", () => {
    expect(titoloPagina("/bookings/new")?.lungo).toBe("Nuova prenotazione");
    expect(titoloPagina("/guests/doppioni")?.lungo).toBe("Possibili doppioni");
    expect(titoloPagina("/staff/turni")?.lungo).toBe("Turni");
    expect(titoloPagina("/marketing/coupons")?.lungo).toBe("Coupon");
    expect(titoloPagina("/campaigns")?.lungo).toBe("Campagne");
    expect(titoloPagina("/campaigns/new")?.lungo).toBe("Nuova campagna");
  });

  it("le due viste del servizio hanno lo stesso titolo", () => {
    // Elenco e Sala sono due modi di guardare la stessa serata, e
    // l'interruttore dice già quale dei due: un titolo che cambia farebbe
    // credere di aver cambiato pagina.
    expect(titoloPagina("/service/room")).toEqual(titoloPagina("/service"));
  });

  it("ogni voce di navigazione ha un titolo", () => {
    for (const voce of ALL_NAV) expect(titoloPagina(voce.href)?.lungo).toBeTruthy();
  });
});
