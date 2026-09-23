import { describe, expect, it } from "vitest";
import { prossimoStato, saluteDi, transizione, richiedeAttenzione } from "@/server/integrations/stati";
import {
  codiceDaHttp,
  erroreDaHttp,
  ErroreIntegrazione,
  messaggioPerIlRistoratore,
  normalizzaErrore,
} from "@/server/integrations/errori";
import { REDATTO, redigi, redigiTesto } from "@/server/integrations/redazione";
import { STATI_INSTALLAZIONE, type StatoInstallazione } from "@/server/integrations/tipi";
import { jsonConInteriSicuri, secondiDaRetryAfter, indirizzoDaRegistrare } from "@/server/integrations/adapters/http";
import { abbinamentiCerti, normalizzaEtichetta } from "@/server/integrations/mappature";

/**
 * Le regole pure della piattaforma: il ciclo di vita, la salute, la lingua
 * degli errori, la pulizia dei segreti, l'abbinamento automatico. Nessun
 * database: sono le decisioni, e si provano da sole.
 */

describe("ciclo di vita di un'installazione", () => {
  it("il percorso normale: installa → autenticato → configurato → prova → attiva", () => {
    let s: StatoInstallazione = "NOT_INSTALLED";
    s = transizione(s, { tipo: "installa" });
    expect(s).toBe("INSTALLING");
    s = transizione(s, { tipo: "autenticato" });
    expect(s).toBe("NEEDS_CONFIGURATION");
    s = transizione(s, { tipo: "configurato" });
    expect(s).toBe("NEEDS_CONFIGURATION");
    s = transizione(s, { tipo: "prova_riuscita" });
    expect(s).toBe("CONNECTED");
    s = transizione(s, { tipo: "attiva" });
    expect(s).toBe("ACTIVE");
  });

  it("non si attiva senza una prova riuscita", () => {
    for (const da of ["INSTALLING", "NEEDS_CONFIGURATION", "ERROR", "REAUTH_REQUIRED", "DISABLED"] as const) {
      expect(prossimoStato(da, { tipo: "attiva" }), da).toBeNull();
    }
    expect(() => transizione("NEEDS_CONFIGURATION", { tipo: "attiva" })).toThrow(/non si può/);
  });

  it("un errore di accesso porta sempre a «ricollega»", () => {
    for (const da of ["ACTIVE", "ERROR", "CONNECTED", "NEEDS_CONFIGURATION"] as const) {
      expect(prossimoStato(da, { tipo: "errore", codice: "AUTH_EXPIRED" }), da).toBe("REAUTH_REQUIRED");
    }
    expect(prossimoStato("SYNCING", { tipo: "sync_fallita", codice: "AUTH_INVALID" })).toBe("REAUTH_REQUIRED");
  });

  it("un fornitore lento non rompe un'integrazione attiva", () => {
    for (const codice of ["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "TIMEOUT", "NETWORK"] as const) {
      expect(prossimoStato("SYNCING", { tipo: "sync_fallita", codice }), codice).toBe("ACTIVE");
    }
    // Un errore vero sì.
    expect(prossimoStato("SYNCING", { tipo: "sync_fallita", codice: "VALIDATION" })).toBe("ERROR");
  });

  it("una prova fallita mentre si configura non è un guasto", () => {
    expect(prossimoStato("NEEDS_CONFIGURATION", { tipo: "prova_fallita", codice: "INVALID_CONFIGURATION" })).toBe(
      "NEEDS_CONFIGURATION",
    );
  });

  it("provare non spegne e non accende niente", () => {
    expect(prossimoStato("ACTIVE", { tipo: "prova_riuscita" })).toBe("ACTIVE");
    expect(prossimoStato("DISABLED", { tipo: "prova_riuscita" })).toBe("DISABLED");
    expect(prossimoStato("ERROR", { tipo: "prova_riuscita" })).toBe("ACTIVE");
  });

  it("si disinstalla da qualunque stato installato, e da NOT_INSTALLED no", () => {
    for (const s of STATI_INSTALLAZIONE.filter((x) => x !== "NOT_INSTALLED")) {
      expect(prossimoStato(s, { tipo: "disinstalla" }), s).toBe("NOT_INSTALLED");
    }
    expect(prossimoStato("NOT_INSTALLED", { tipo: "disinstalla" })).toBeNull();
  });

  it("si reinstalla solo da NOT_INSTALLED", () => {
    for (const s of STATI_INSTALLAZIONE.filter((x) => x !== "NOT_INSTALLED")) {
      expect(prossimoStato(s, { tipo: "installa" }), s).toBeNull();
    }
  });

  it("una sincronizzazione alla volta: da SYNCING non se ne apre un'altra", () => {
    expect(prossimoStato("SYNCING", { tipo: "sync_inizio" })).toBeNull();
    expect(prossimoStato("DISABLED", { tipo: "sync_inizio" })).toBeNull();
  });

  it("riaccendere è solo da spenta", () => {
    expect(prossimoStato("DISABLED", { tipo: "riattiva" })).toBe("ACTIVE");
    expect(prossimoStato("ACTIVE", { tipo: "riattiva" })).toBeNull();
  });
});

describe("salute", () => {
  const adesso = new Date("2026-09-23T12:00:00Z");
  const ore = (n: number) => new Date(adesso.getTime() - n * 3_600_000);

  it("attiva e sincronizzata di recente: sana", () => {
    expect(saluteDi({ status: "ACTIVE", lastSuccessfulSyncAt: ore(1) }, adesso)).toBe("HEALTHY");
  });
  it("attiva ma ferma da più di un giorno: degradata", () => {
    expect(saluteDi({ status: "ACTIVE", lastSuccessfulSyncAt: ore(30) }, adesso)).toBe("DEGRADED");
  });
  it("attiva con un errore dopo l'ultima riuscita: degradata", () => {
    expect(
      saluteDi({ status: "ACTIVE", lastSuccessfulSyncAt: ore(3), lastErrorAt: ore(1), lastErrorCode: "RATE_LIMITED" }, adesso),
    ).toBe("DEGRADED");
  });
  it("accesso scaduto: AUTH_REQUIRED, e richiede attenzione", () => {
    expect(saluteDi({ status: "REAUTH_REQUIRED" }, adesso)).toBe("AUTH_REQUIRED");
    expect(richiedeAttenzione("REAUTH_REQUIRED", "AUTH_REQUIRED")).toBe(true);
    expect(richiedeAttenzione("ACTIVE", "HEALTHY")).toBe(false);
  });
});

describe("errori: una lingua per noi, una per il ristoratore", () => {
  it("dallo stato HTTP al codice", () => {
    expect(codiceDaHttp(401)).toBe("AUTH_EXPIRED");
    expect(codiceDaHttp(400, { error: "invalid_grant" })).toBe("AUTH_EXPIRED");
    expect(codiceDaHttp(401, { error: "invalid_client" })).toBe("AUTH_INVALID");
    expect(codiceDaHttp(403)).toBe("PERMISSION_DENIED");
    expect(codiceDaHttp(429)).toBe("RATE_LIMITED");
    expect(codiceDaHttp(503)).toBe("PROVIDER_UNAVAILABLE");
    expect(codiceDaHttp(422)).toBe("VALIDATION");
  });

  it("«401 invalid_grant oauth2 token expired» diventa «Connessione scaduta»", () => {
    const e = erroreDaHttp(401, { error: "invalid_grant", error_description: "token expired" }, {
      metodo: "POST",
      endpoint: "https://auth.example/token",
    });
    const m = messaggioPerIlRistoratore(e.codice, "Lightspeed Restaurant");
    expect(m.titolo).toBe("Connessione scaduta");
    expect(m.azione).toBe("ricollega");
    const testo = `${m.titolo} ${m.spiegazione}`;
    for (const tecnico of ["401", "invalid_grant", "oauth", "token", "HTTP"]) {
      expect(testo.toLowerCase(), tecnico).not.toContain(tecnico.toLowerCase());
    }
    // Il dettaglio tecnico però resta, per noi.
    expect(e.riassunto()).toContain("HTTP 401");
    expect(e.riassunto()).toContain("invalid_grant");
    expect(e.riassunto()).toContain(e.correlationId);
  });

  it("nessun messaggio per il ristoratore contiene un codice tecnico", () => {
    const codici = [
      "AUTH_EXPIRED", "AUTH_INVALID", "PERMISSION_DENIED", "NOT_FOUND", "RATE_LIMITED", "PROVIDER_UNAVAILABLE",
      "TIMEOUT", "NETWORK", "INVALID_CONFIGURATION", "VALIDATION", "CONFLICT", "NOT_SUPPORTED",
      "PLATFORM_NOT_CONFIGURED", "ENCRYPTION_UNAVAILABLE", "UNKNOWN",
    ];
    for (const c of codici) {
      const m = messaggioPerIlRistoratore(c, "Cassa");
      expect(`${m.titolo} ${m.spiegazione}`, c).not.toMatch(/[A-Z]{2,}_[A-Z]+|\b\d{3}\b|stack|undefined/);
    }
  });

  it("gli errori di rete e di tempo si riconoscono, e si riprovano", () => {
    const t = normalizzaErrore(Object.assign(new Error("x"), { name: "TimeoutError" }));
    expect(t.codice).toBe("TIMEOUT");
    expect(t.riprovabile).toBe(true);
    expect(normalizzaErrore(new TypeError("fetch failed")).codice).toBe("NETWORK");
    expect(new ErroreIntegrazione("AUTH_EXPIRED", "x").riprovabile).toBe(false);
  });

  it("Retry-After in secondi o come data", () => {
    expect(secondiDaRetryAfter("30")).toBe(30);
    expect(secondiDaRetryAfter(new Date(Date.now() + 120_000).toUTCString())).toBeGreaterThan(100);
    expect(secondiDaRetryAfter(null)).toBeUndefined();
    expect(secondiDaRetryAfter("99999")).toBe(3600);
  });
});

describe("nessun segreto nei log", () => {
  it("per nome di campo, a qualunque profondità", () => {
    const pulito = redigi({
      access_token: "abc",
      refresh_token: "def",
      nested: { client_secret: "s", apiKey: "k", password: "p", ok: "visibile" },
      lista: [{ Authorization: "Bearer xyz" }],
    });
    expect(JSON.stringify(pulito)).not.toMatch(/abc|def|"s"|"k"|"p"|xyz/);
    expect(pulito.nested.ok).toBe("visibile");
    expect(pulito.access_token).toBe(REDATTO);
  });

  it("per forma del valore: Bearer, Basic e JWT dentro un testo", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmn";
    const t = redigiTesto(`Authorization: Bearer abcdefghijklmnop e anche Basic dXNlcjpwYXNzd29yZA== e ${jwt}`);
    expect(t).not.toContain("abcdefghijklmnop");
    expect(t).not.toContain("dXNlcjpwYXNzd29yZA==");
    expect(t).not.toContain(jwt);
  });

  it("il messaggio di un errore non porta segreti", () => {
    const e = new ErroreIntegrazione("UNKNOWN", "fallito con Bearer abcdefghijklmnopqrstu");
    expect(e.message).not.toContain("abcdefghijklmnopqrstu");
    expect(e.riassunto()).not.toContain("abcdefghijklmnopqrstu");
  });

  it("l'indirizzo registrato perde la query, dove a volte viaggiano chiavi", () => {
    expect(indirizzoDaRegistrare("https://api.x.it/v1/a?api_key=SEGRETO")).toBe("https://api.x.it/v1/a");
  });
});

describe("identificativi a 64 bit", () => {
  it("un intero oltre 2^53 resta esatto, come stringa", () => {
    const d = jsonConInteriSicuri('{"id": 247158188015618123, "n": [9007199254740993, 12], "p": 12.5}') as {
      id: string;
      n: (string | number)[];
      p: number;
    };
    expect(d.id).toBe("247158188015618123");
    expect(d.n[0]).toBe("9007199254740993");
    expect(d.n[1]).toBe(12);
    expect(d.p).toBe(12.5);
  });
});

describe("abbinamento automatico: solo quando è certo", () => {
  it("normalizza il prefisso, non il numero", () => {
    expect(normalizzaEtichetta("Tavolo 12")).toBe("12");
    expect(normalizzaEtichetta(" TAV. 12 ")).toBe("12");
    expect(normalizzaEtichetta("12A")).toBe("12a");
  });

  it("abbina 12 con «Tavolo 12», non 12 con 12A, e niente se ci sono doppioni", () => {
    const m = abbinamentiCerti(
      [
        { externalId: "e1", etichetta: "12" },
        { externalId: "e2", etichetta: "12A" },
        { externalId: "e3", etichetta: "7" },
        { externalId: "e4", etichetta: "7" },
        { externalId: "e5", etichetta: "Terrazza" },
      ],
      [
        { id: "i1", etichetta: "Tavolo 12" },
        { id: "i2", etichetta: "7" },
        { id: "i3", etichetta: "Terrazza" },
        { id: "i4", etichetta: "terrazza" },
      ],
    );
    expect(m.get("e1")).toBe("i1");
    expect(m.has("e2")).toBe(false); // 12A non c'è da noi
    expect(m.has("e3")).toBe(false); // due «7» presso il fornitore: non si sceglie
    expect(m.has("e4")).toBe(false);
    expect(m.has("e5")).toBe(false); // due «Terrazza» da noi: non si sceglie
  });
});
