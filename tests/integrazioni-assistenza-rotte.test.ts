import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **Le rotte dell'assistenza controllano lato server, prima di tutto.**
 *
 * Un pulsante nascosto nell'interfaccia non protegge niente: qui si chiamano
 * le rotte direttamente, come farebbe chiunque con il loro indirizzo.
 */

const stato = vi.hoisted(() => ({ superAdmin: false, sessione: "unauthenticated" as "unauthenticated" | "ok", letture: 0 }));

vi.mock("@/lib/super-admin", () => ({
  superAdminCorrente: async () => (stato.superAdmin ? { ok: true, email: "admin@foodtech.test" } : { ok: false }),
}));
vi.mock("next/headers", () => ({
  headers: () => new Headers({ host: "app.foodtech.test", "x-forwarded-proto": "https" }),
  cookies: () => ({ get: () => undefined, set: () => undefined }),
}));
vi.mock("@/lib/tenant", () => ({
  resolveActiveVenue: async () => (stato.sessione === "ok" ? { state: "no_venue", userId: "u-x" } : { state: "unauthenticated" }),
  setActiveVenueCookie: () => undefined,
}));
vi.mock("@/server/integrations/vista-assistenza", () => ({
  schedaLocaleAdmin: async () => {
    stato.letture++;
    return { locale: {}, righe: [] };
  },
}));
vi.mock("@/server/integrations/azioni-admin", () => ({
  attoreAdmin: async () => {
    stato.letture++;
    throw new Error("non doveva arrivare qui");
  },
  eseguiAzioneAdmin: async () => {
    stato.letture++;
  },
}));
vi.mock("@/server/integrations/assistenza", () => ({
  apriConsegna: async () => {
    stato.letture++;
    return { ok: false, motivo: "sconosciuto" };
  },
  chiediAssistenza: async () => undefined,
  creaConsegna: async () => undefined,
  revocaConsegna: async () => undefined,
  chiudiAssistenza: async () => undefined,
}));

const { GET, POST } = await import("@/app/api/admin/integrazioni/locali/[venueId]/route");
const consegna = await import("@/app/api/integrations/consegna/[codice]/route");

beforeEach(() => {
  stato.superAdmin = false;
  stato.sessione = "unauthenticated";
  stato.letture = 0;
});

describe("rotte dell'assistenza", () => {
  it("chi non è Super Admin riceve 404, e il server non legge né esegue niente", async () => {
    const g = await GET(new Request("https://x/api"), { params: { venueId: "v1" } });
    expect(g.status).toBe(404);
    const p = await POST(
      new Request("https://x/api", { method: "POST", body: JSON.stringify({ azione: "prova", slug: "cassa-in-cloud" }) }),
      { params: { venueId: "v1" } },
    );
    expect(p.status).toBe(404);
    expect(stato.letture).toBe(0);
  });

  it("un'azione che non esiste è rifiutata anche a un Super Admin", async () => {
    stato.superAdmin = true;
    const p = await POST(
      new Request("https://x/api", { method: "POST", body: JSON.stringify({ azione: "disinstalla", slug: "cassa-in-cloud" }) }),
      { params: { venueId: "v1" } },
    );
    expect(p.status).toBeGreaterThanOrEqual(400);
    expect(p.status).toBeLessThan(500);
    expect(stato.letture).toBe(0);
  });

  it("il collegamento di consegna senza sessione porta all'accesso, senza guardare il codice", async () => {
    const r = await consegna.GET(new Request("https://x/api"), { params: { codice: "abc" } });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toMatch(/\/sign-in\?callbackUrl=/);
    expect(stato.letture).toBe(0);
  });
});
