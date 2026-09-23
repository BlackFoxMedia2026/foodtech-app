import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cifraLegato, decifraLegato } from "@/lib/cifratura";
import { contestoDiCifratura } from "@/server/integrations/credenziali";
import { creaState, verificaState, DURATA_STATE_MS } from "@/server/integrations/oauth-state";

/**
 * Due garanzie su cui poggia l'isolamento delle integrazioni, provate senza
 * database: il segreto cifrato è **legato** a chi lo possiede, e il ritorno
 * OAuth non si può dirottare.
 */

const CHIAVE = Buffer.alloc(32, 7).toString("base64");
let prima: { chiave?: string; segreto?: string };

beforeEach(() => {
  prima = { chiave: process.env.CHIAVE_CIFRATURA, segreto: process.env.NEXTAUTH_SECRET };
  process.env.CHIAVE_CIFRATURA = CHIAVE;
  process.env.NEXTAUTH_SECRET = "segreto-di-prova-per-lo-state";
});
afterEach(() => {
  process.env.CHIAVE_CIFRATURA = prima.chiave;
  process.env.NEXTAUTH_SECRET = prima.segreto;
});

describe("credenziali cifrate e legate all'installazione", () => {
  it("si rileggono con lo stesso contesto", () => {
    const ctx = contestoDiCifratura("venue_A", "inst_1");
    const c = cifraLegato(JSON.stringify({ accessToken: "tok-A" }), ctx);
    expect(c).not.toContain("tok-A");
    expect(JSON.parse(decifraLegato(c, ctx))).toEqual({ accessToken: "tok-A" });
  });

  it("copiate sotto un altro locale o un'altra installazione non si decifrano", () => {
    const c = cifraLegato("tok-A", contestoDiCifratura("venue_A", "inst_1"));
    expect(() => decifraLegato(c, contestoDiCifratura("venue_B", "inst_1"))).toThrow("sigillo_non_valido");
    expect(() => decifraLegato(c, contestoDiCifratura("venue_A", "inst_2"))).toThrow("sigillo_non_valido");
  });

  it("un byte cambiato fa fallire la lettura invece di restituire spazzatura", () => {
    const ctx = contestoDiCifratura("v", "i");
    const c = cifraLegato("tok", ctx);
    const parti = c.split(":");
    const b = Buffer.from(parti[3]!, "base64");
    b[0] = b[0]! ^ 1;
    parti[3] = b.toString("base64");
    expect(() => decifraLegato(parti.join(":"), ctx)).toThrow("sigillo_non_valido");
  });

  it("senza chiave non si salva niente, nemmeno «in chiaro con l'etichetta»", () => {
    process.env.CHIAVE_CIFRATURA = "";
    expect(() => cifraLegato("tok", "x")).toThrow("chiave_mancante");
  });

  it("due cifrature dello stesso valore sono diverse (vettore nuovo ogni volta)", () => {
    const ctx = contestoDiCifratura("v", "i");
    expect(cifraLegato("tok", ctx)).not.toBe(cifraLegato("tok", ctx));
  });
});

describe("lo state del ritorno OAuth", () => {
  const base = { installationId: "inst_1", venueId: "venue_A", userId: "user_1", slug: "lightspeed-k" };

  it("valido, dallo stesso browser, entro dieci minuti", () => {
    const { state, nonce } = creaState(base);
    const v = verificaState(state, nonce);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.contenuto).toMatchObject(base);
  });

  it("da un altro browser (nonce diverso o assente) no", () => {
    const { state } = creaState(base);
    expect(verificaState(state, "altro")).toEqual({ ok: false, motivo: "browser" });
    expect(verificaState(state, undefined)).toEqual({ ok: false, motivo: "browser" });
  });

  it("scaduto no", () => {
    const t0 = Date.now();
    const { state, nonce } = creaState(base, t0);
    expect(verificaState(state, nonce, t0 + DURATA_STATE_MS + 1)).toEqual({ ok: false, motivo: "scaduto" });
  });

  it("con il locale cambiato dentro lo state no: la firma non torna", () => {
    const { state, nonce } = creaState(base);
    const [dati] = state.split(".");
    const contenuto = JSON.parse(Buffer.from(dati!, "base64url").toString("utf8"));
    contenuto.venueId = "venue_B";
    const falso = `${Buffer.from(JSON.stringify(contenuto)).toString("base64url")}.${state.split(".")[1]}`;
    expect(verificaState(falso, nonce)).toEqual({ ok: false, motivo: "firma" });
  });

  it("senza NEXTAUTH_SECRET non si firma", () => {
    process.env.NEXTAUTH_SECRET = "";
    expect(() => creaState(base)).toThrow(/NEXTAUTH_SECRET/);
  });
});
