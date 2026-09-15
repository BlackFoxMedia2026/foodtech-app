import { describe, expect, it } from "vitest";
import {
  condizioniDi,
  corrisponde,
  giorniA,
  gruppoDi,
  statoDi,
} from "@/lib/coupon-vista";
import type { CouponView } from "@/server/coupons";

/**
 * Come si legge un coupon.
 *
 * Non c'è database qui dentro: sono le tre decisioni che la pagina prende su
 * una riga già letta — in che linguetta sta, che pillola porta, a quali
 * condizioni vale. Vale la pena averle sotto prova perché sono esattamente il
 * punto in cui l'interfaccia può contraddire il server: una linguetta che
 * conta 8 «attivi» sopra un elenco in cui due dicono «Scaduto» è peggio di
 * una pagina senza linguette.
 */

const coupon = (extra: Partial<CouponView> = {}): CouponView => ({
  id: "c1",
  code: "MARTEDI-GSOY",
  name: "Martedì da noi",
  description: null,
  kind: "PERCENT",
  value: 15,
  freeItem: null,
  category: "GENERIC",
  status: "ACTIVE",
  validFrom: null,
  validUntil: null,
  maxRedemptions: null,
  maxPerGuest: 1,
  minSpendCents: null,
  validWeekdays: [],
  guestName: null,
  usi: 0,
  usiMese: 0,
  ultimoUso: null,
  restanti: null,
  descrizione: "15% di sconto",
  stato: "usabile",
  ...extra,
});

describe("in quale linguetta sta", () => {
  it("un coupon valido sta fra gli attivi", () => {
    expect(gruppoDi(coupon())).toBe("attivi");
  });

  it("scaduto ed esaurito sono «terminati», anche se nel database sono ACTIVE", () => {
    // È il punto: «terminato» non è uno stato salvato, è il verdetto
    // dell'orologio. Un coupon scaduto ha `status: ACTIVE` e non varrà mai più.
    expect(gruppoDi(coupon({ stato: "expired" }))).toBe("terminati");
    expect(gruppoDi(coupon({ stato: "exhausted" }))).toBe("terminati");
  });

  it("un coupon del martedì, letto di lunedì, resta fra gli attivi", () => {
    // Non è finito: vale domani. Toglierlo dalla vista principale sarebbe un
    // difetto, non un filtro.
    expect(gruppoDi(coupon({ stato: "wrong_day" }))).toBe("attivi");
    expect(gruppoDi(coupon({ stato: "not_yet_valid" }))).toBe("attivi");
  });

  it("la pausa e l'archivio vincono su tutto il resto", () => {
    expect(gruppoDi(coupon({ status: "PAUSED", stato: "paused" }))).toBe("pausa");
    expect(gruppoDi(coupon({ status: "ARCHIVED", stato: "archived" }))).toBe("archiviati");
  });
});

describe("la pillola dello stato", () => {
  it("valido: pallino pieno, e la scheda resta accesa", () => {
    const s = statoDi(coupon());
    expect(s.testo).toBe("Valido");
    expect(s.concluso).toBe(false);
    expect(s.spento).toBe(false);
  });

  it("in pausa avvisa, perché è qualcosa che qualcuno ha spento e può riaccendere", () => {
    expect(statoDi(coupon({ status: "PAUSED", stato: "paused" }))).toMatchObject({
      testo: "In pausa",
      tono: "warning",
      spento: true,
    });
  });

  it("«non oggi» non spegne la scheda", () => {
    expect(statoDi(coupon({ stato: "wrong_day" })).spento).toBe(false);
  });

  it("scaduto ed esaurito restano neutri: non c'è niente da fare", () => {
    expect(statoDi(coupon({ stato: "expired" })).tono).toBe("neutral");
    expect(statoDi(coupon({ stato: "exhausted" })).tono).toBe("neutral");
  });
});

describe("le condizioni scritte sulla scheda", () => {
  const adesso = new Date(2026, 8, 15, 12, 0); // 15 settembre 2026

  it("il destinatario viene per primo: sui coupon del Wi-Fi è l'unica cosa che li distingue", () => {
    const righe = condizioniDi(coupon({ guestName: "Ilaria Bosisio", category: "WIFI" }), adesso);
    expect(righe[0].testo).toBe("Ilaria Bosisio");
  });

  it("una scadenza vicina è l'unica condizione che si accende", () => {
    const righe = condizioniDi(coupon({ validUntil: new Date(2026, 8, 18) }), adesso);
    const scadenza = righe.find((r) => r.testo.startsWith("scade"));
    expect(scadenza).toEqual({ testo: "scade fra 3 giorni", avviso: true });
  });

  it("una scadenza lontana resta grigia", () => {
    const righe = condizioniDi(coupon({ validUntil: new Date(2026, 10, 30) }), adesso);
    expect(righe.some((r) => r.avviso)).toBe(false);
    expect(righe.some((r) => r.testo === "fino al 30 novembre")).toBe(true);
  });

  it("la descrizione libera non finisce sulla scheda", () => {
    // Ripetuta identica su venti coupon del Wi-Fi allargava la riga di mezzo
    // schermo per dire quello che il nome già diceva: sta nel pannello.
    const righe = condizioniDi(
      coupon({ description: "Sconto per chi si è collegato alla rete del locale." }),
      adesso,
    );
    expect(righe.some((r) => r.testo.includes("collegato"))).toBe(false);
  });

  it("i giorni si scrivono in ordine, non in quello in cui sono stati scelti", () => {
    const righe = condizioniDi(coupon({ validWeekdays: [4, 2] }), adesso);
    expect(righe.some((r) => r.testo === "solo mar, gio")).toBe(true);
  });
});

describe("la ricerca", () => {
  it("trova il codice anche scritto senza trattino", () => {
    // Chi lo detta al telefono o lo copia da un messaggio scrive «martedigsoy»,
    // e una ricerca che non lo trova sembra rotta.
    expect(corrisponde(coupon(), "martedigsoy")).toBe(true);
    expect(corrisponde(coupon(), "MARTEDI-GSOY")).toBe(true);
  });

  it("cerca anche nel nome, nella tipologia e nel destinatario", () => {
    expect(corrisponde(coupon(), "martedì da")).toBe(true);
    expect(corrisponde(coupon({ category: "WIFI" }), "wi-fi")).toBe(true);
    expect(corrisponde(coupon({ guestName: "Ilaria Bosisio" }), "bosisio")).toBe(true);
  });

  it("una ricerca vuota non filtra niente", () => {
    expect(corrisponde(coupon(), "   ")).toBe(true);
  });

  it("quello che non c'è non si trova", () => {
    expect(corrisponde(coupon(), "compleanno")).toBe(false);
  });
});

describe("i giorni che mancano", () => {
  it("si contano per giorni di calendario, non per ore", () => {
    // Alle 23:00 di oggi, «domani alle 8» manca un giorno, non zero.
    const stasera = new Date(2026, 8, 15, 23, 0);
    expect(giorniA(new Date(2026, 8, 16, 8, 0), stasera)).toBe(1);
    expect(giorniA(new Date(2026, 8, 15, 0, 30), stasera)).toBe(0);
  });
});
