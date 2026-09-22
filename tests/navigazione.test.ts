import { describe, expect, it } from "vitest";
import {
  ALL_NAV,
  vociPrincipali,
  MARKETING_NAV,
  MOBILE_NAV,
  PRIMARY_NAV,
  PROFILE_NAV,
  isNavActive,
  primarieFuoriDallaBarra,
  profiloPerGruppo,
  sottovoceAttiva,
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

  it("le pagine senza sezione non accendono niente, e va bene così", () => {
    /*
      `/waitlist` e `/experiences` esistono e si aprono, ma non sono più voci:
      l'attesa è già dentro Servizio e le esperienze sono sospese. Una pagina
      raggiungibile che non accende niente non è un difetto — il difetto
      sarebbe accendere la voce sbagliata perché «qualcosa deve pur
      illuminarsi».
    */
    for (const percorso of ["/waitlist", "/experiences"]) {
      expect(ALL_NAV.filter((v) => isNavActive(percorso, v))).toHaveLength(0);
    }
  });
});

describe("la barra centrale", () => {
  it("porta le sette voci di servizio più Marketing, in quest'ordine", () => {
    // L'ordine è il giro di una serata: la giornata, il servizio, le
    // prenotazioni, la sala, il cliente, chi è in turno, il piatto — con
    // Marketing spostata qui dal menu del profilo, prima di Menu.
    //
    // Su un locale **senza** il telefono, che è il caso di tutti finché non lo
    // comprano.
    expect(vociPrincipali(false).map((v) => v.label)).toEqual([
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

  it("con il telefono collegato compare «Telefono», fra Ospiti e Staff", () => {
    /* Sta dentro le voci che si aprono **durante** il servizio, non fra le
       impostazioni: chi risponde al telefono ci torna venti volte in una sera
       per vedere chi ha chiamato e non ha trovato nessuno. */
    expect(vociPrincipali(true).map((v) => v.label)).toEqual([
      "Panoramica",
      "Servizio",
      "Prenotazioni",
      "Sala",
      "Ospiti",
      "Telefono",
      "Staff",
      "Marketing",
      "Menu",
    ]);
  });

  it("una funzione che si compra non compare a chi non l'ha comprata", () => {
    /* Non è pudore: una voce che apre una pagina vuota, o un cartello
       pubblicitario, è peggio di una voce che non c'è. Cosa c'è da avere sta
       scritto in Impostazioni → Telefono, che è il posto dove si va a
       guardare. */
    const conditionate = PRIMARY_NAV.filter((v) => v.soloConTelefono);
    expect(conditionate.length).toBeGreaterThan(0);
    for (const v of conditionate) {
      expect(vociPrincipali(false)).not.toContain(v);
      expect(vociPrincipali(true)).toContain(v);
    }
  });

  it("non porta niente di amministrativo: quello sta sotto l'avatar", () => {
    // Se una di queste tornasse in barra, il criterio («lo apro mentre il
    // locale lavora?») smetterebbe di spiegare la divisione. Marketing è
    // l'eccezione voluta e non fa parte di questo controllo.
    const inBarra = new Set(PRIMARY_NAV.map((v) => v.href));
    for (const href of ["/payments", "/settings"]) {
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
    /* «Eventi e gruppi» e in Gestione e non in barra: un preventivo per
       quaranta persone si scrive la mattina dopo, non alle nove di sabato. Ma
       **scade**, e per questo la richiesta suona nella campanella — che e il
       posto che si guarda durante il servizio. */
    expect(gruppi[0].voci.map((v) => v.href)).toEqual(["/eventi", "/payments"]);
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

  it("nessuna funzione è sparita per sbaglio: ogni voce di prima ha ancora una casa", () => {
    /*
      L'elenco delle destinazioni che esistevano prima del redesign, con
      `/waiters` diventato `/staff` (il vecchio percorso reindirizza). Se una
      sparisce, questo test lo dice: semplificare non vuol dire togliere.

      Le due che mancano sono uscite **di proposito** il 15 settembre, e
      stanno qui sotto scritte per nome — così toglierne una terza resta una
      decisione da prendere, non una riga che si cancella in silenzio:

      - `/waitlist`: la coda è già la terza zona di Servizio, e la pagina resta
        raggiungibile dai gesti che aggiungono qualcuno in attesa;
      - `/experiences`: sezione sospesa finché non si decide se tenerla.
    */
    const prima = [
      "/overview", "/service", "/bookings", "/floor", "/guests",
      "/staff", "/menu", "/marketing", "/insights", "/payments", "/settings",
    ];
    const adesso = new Set([
      ...ALL_NAV.map((v) => v.href),
      ...ALL_NAV.flatMap((v) => v.sottovoci?.map((s) => s.href) ?? []),
    ]);
    for (const href of prima) expect(adesso.has(href)).toBe(true);
  });

  it("l'attesa e le esperienze non sono in nessuno dei due menu", () => {
    const tutte = [
      ...ALL_NAV.map((v) => v.href),
      ...ALL_NAV.flatMap((v) => v.sottovoci?.map((s) => s.href) ?? []),
    ];
    expect(tutte).not.toContain("/waitlist");
    expect(tutte).not.toContain("/experiences");
  });
});

/**
 * Il menu Marketing.
 *
 * Marketing è l'unica voce della barra che **non porta a una pagina**: apre un
 * elenco. È anche l'unica che ha dentro percorsi fuori dal proprio prefisso —
 * `/campaigns` e `/insights`, rimasti dov'erano per non rompere link già
 * mandati — e sono esattamente quelli su cui la voce accesa si rompe in
 * silenzio: nessun errore, solo una barra che smette di dire dove si è.
 *
 * Le tre cose che devono reggere, e che nessun'altra parte del codice
 * controlla:
 *
 * 1. **la voce resta accesa dentro ogni strumento**, compresi i due che
 *    stanno fuori da `/marketing`;
 * 2. **si sa quale strumento è aperto**, altrimenti si apre il pannello e i
 *    sette nomi si somigliano tutti;
 * 3. **ogni strumento ha un titolo suo** nella testata: senza, sette schermate
 *    diverse si chiamano tutte «Marketing».
 */
describe("il menu Marketing", () => {
  it("porta gli strumenti del marketing, in quest'ordine", () => {
    // L'ordine non è alfabetico: ciò che si manda, ciò che si dà, ciò che si
    // raccoglie o si stampa, e in fondo com'è andata.
    expect(MARKETING_NAV.map((v) => v.label)).toEqual([
      "Campagne email",
      "Automazioni",
      "Coupon",
      "Gift card",
      "Wi-Fi",
      "QR Code",
      "Analytics",
    ]);
  });

  it("è l'unica voce che si apre invece di portare da qualche parte", () => {
    // Un secondo menu dentro la barra sarebbe di nuovo il dropdown «Altro»:
    // un posto in più dove guardare, con dentro cose senza un criterio.
    const conSottovoci = ALL_NAV.filter((v) => v.sottovoci);
    expect(conSottovoci.map((v) => v.label)).toEqual(["Marketing"]);
  });

  it("ogni strumento ha il nome e una riga che dice cosa ci si fa", () => {
    // Nel pannello il nome da solo non basta: «Wi-Fi» accanto a «QR Code» non
    // dice a cosa servono. La riga è la stessa su scrivania e su telefono.
    for (const voce of MARKETING_NAV) {
      expect(voce.label.length).toBeGreaterThan(0);
      expect(voce.descrizione?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("nessuno strumento porta all'indice che non c'è più", () => {
    // `/marketing` adesso reindirizza: una voce di menu che ci punta sarebbe
    // il passaggio in più rimesso dentro il menu che serviva a toglierlo.
    expect(MARKETING_NAV.map((v) => v.href)).not.toContain("/marketing");
  });

  it("dentro uno strumento resta accesa Marketing, e solo lei", () => {
    /*
      Compresi i due percorsi che non cominciano per `/marketing`: le campagne
      sono su `/campaigns` per non rompere il wizard, Analytics su `/insights`
      perché è arrivata qui dal menu del profilo senza cambiare indirizzo.
      Tutti e due passano da `matchPrefixes`, ed è la cosa che si dimentica
      quando si aggiunge il settimo strumento.
    */
    for (const voce of MARKETING_NAV) {
      const accese = ALL_NAV.filter((v) => isNavActive(voce.href, v));
      expect(accese.map((v) => v.label)).toEqual(["Marketing"]);
    }
  });

  it("resta accesa anche nelle pagine di dettaglio di uno strumento", () => {
    for (const percorso of ["/campaigns/abc/edit", "/campaigns/new", "/insights/ospiti"]) {
      const accese = ALL_NAV.filter((v) => isNavActive(percorso, v));
      expect(accese.map((v) => v.label)).toEqual(["Marketing"]);
    }
  });

  it("dice quale strumento è aperto, anche da una sua sottopagina", () => {
    const marketing = PRIMARY_NAV.find((v) => v.label === "Marketing")!;
    expect(sottovoceAttiva("/marketing/coupons", marketing)?.label).toBe("Coupon");
    expect(sottovoceAttiva("/campaigns", marketing)?.label).toBe("Campagne email");
    expect(sottovoceAttiva("/campaigns/abc/edit", marketing)?.label).toBe("Campagne email");
    expect(sottovoceAttiva("/insights", marketing)?.label).toBe("Analytics");
  });

  it("fuori dal marketing non c'è nessuno strumento aperto", () => {
    const marketing = PRIMARY_NAV.find((v) => v.label === "Marketing")!;
    expect(sottovoceAttiva("/bookings", marketing)).toBeUndefined();
  });

  it("ogni strumento ha un titolo suo nella testata", () => {
    // Senza, sette schermate diverse si chiamerebbero tutte «Marketing»: il
    // titolo lo scrive la testata, non più il contenuto della pagina.
    for (const voce of MARKETING_NAV) {
      expect(titoloPagina(voce.href)?.lungo).toBeTruthy();
      expect(titoloPagina(voce.href)?.lungo).not.toBe("Marketing");
    }
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
    expect(primarieFuoriDallaBarra(false).map((v) => v.label)).toEqual(["Ospiti", "Staff", "Marketing", "Menu"]);
    expect(primarieFuoriDallaBarra(false).every((v) => PRIMARY_NAV.includes(v))).toBe(true);
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

describe("una funzione che si compra, sul telefono", () => {
  it("non compare nemmeno in «Altro» a chi non l'ha", () => {
    /* La prima versione filtrava solo la barra della scrivania e lasciava la
       voce nel menu del telefono: nascosta per metà, che è peggio di non
       averla nascosta. */
    const altro = primarieFuoriDallaBarra(false).map((v) => v.label);
    expect(altro).not.toContain("Telefono");
    expect(primarieFuoriDallaBarra(true).map((v) => v.label)).toContain("Telefono");
  });
});
