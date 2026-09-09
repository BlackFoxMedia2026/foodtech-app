import { describe, expect, it } from "vitest";
import { ALL_NAV, MOBILE_NAV, PRIMARY_NAV, SECONDARY_NAV, isNavActive } from "@/components/shell/nav-items";

/**
 * La navigazione.
 *
 * Due cose che devono reggere, e la seconda si rompe in silenzio.
 *
 * **Una voce sola accesa per volta.** Da quando «Sala» punta a
 * `/service/room`, per prefisso quel percorso sta anche sotto `/service`:
 * senza la regola della corrispondenza più lunga si accendono due voci insieme
 * e la barra dice due cose diverse nello stesso momento. Nessun errore, nessun
 * test rosso: solo un prodotto che sembra confuso.
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
    "/waiters",
    "/experiences",
    "/payments",
  ];

  for (const percorso of percorsi) {
    it(`${percorso} accende esattamente una voce`, () => {
      const accese = ALL_NAV.filter((v) => isNavActive(percorso, v));
      expect(accese.map((v) => v.label)).toHaveLength(1);
    });
  }

  it("la sala viva accende «Sala», non «Servizio»", () => {
    const accesa = ALL_NAV.find((v) => isNavActive("/service/room", v));
    expect(accesa?.label).toBe("Sala");
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

describe("le destinazioni", () => {
  it("«Sala» porta alla sala viva, non alla piantina", () => {
    const sala = PRIMARY_NAV.find((v) => v.label === "Sala");
    expect(sala?.href).toBe("/service/room");
  });

  it("la piantina è raggiungibile, sotto «Il locale»", () => {
    const piantina = SECONDARY_NAV.find((v) => v.href === "/floor");
    expect(piantina).toBeDefined();
    expect(piantina?.gruppo).toBe("locale");
  });

  it("nessuna funzione è sparita: ogni voce di prima ha ancora una casa", () => {
    // L'elenco delle destinazioni che esistevano prima del redesign. Se una
    // sparisce, questo test lo dice: semplificare non vuol dire togliere.
    const prima = [
      "/overview", "/service", "/bookings", "/floor", "/waitlist", "/guests",
      "/waiters", "/menu", "/experiences", "/marketing", "/insights",
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

  it("porta la sala viva e non l'editor", () => {
    expect(MOBILE_NAV.map((v) => v.href)).toContain("/service/room");
    expect(MOBILE_NAV.map((v) => v.href)).not.toContain("/floor");
  });

  it("ogni voce della barra viene dalla navigazione principale", () => {
    // Se una voce fosse definita a parte, il nome potrebbe divergere fra
    // telefono e scrivania: è il difetto dei «due vocabolari» già corretto una
    // volta, quando la Panoramica si chiamava «Oggi» sul telefono.
    for (const voce of MOBILE_NAV) expect(PRIMARY_NAV).toContain(voce);
  });
});
