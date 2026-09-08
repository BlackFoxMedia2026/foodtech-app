import { afterEach, describe, expect, it, vi } from "vitest";
import { conMisura, logErrore, logEvento, mascheraEmail } from "@/lib/observability";

/**
 * I log strutturati.
 *
 * La cosa da difendere qui non è il formato: è che **un dato personale non
 * finisca in un log**. Un log è il posto meno protetto in cui un indirizzo
 * può finire, e ci resta per mesi.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function cattura(livello: "log" | "warn" | "error") {
  return vi.spyOn(console, livello).mockImplementation(() => {});
}

describe("mascherare un indirizzo", () => {
  it("lascia riconoscere la persona a chi ha il database, e nient'altro", () => {
    expect(mascheraEmail("maria.rossi@ristorante.it")).toBe("m***i@ristorante.it");
  });

  it("regge un indirizzo di una lettera sola", () => {
    expect(mascheraEmail("a@b.it")).toBe("a***@b.it");
  });

  it("non inventa niente su una stringa che non è un indirizzo", () => {
    expect(mascheraEmail("non-un-indirizzo")).toBe("***");
    expect(mascheraEmail(null)).toBeNull();
    expect(mascheraEmail(undefined)).toBeNull();
  });
});

describe("la riga di log", () => {
  it("è JSON su una riga, con evento e ora", () => {
    const spia = cattura("log");
    logEvento("prova.fatta", { quanti: 3 });

    expect(spia).toHaveBeenCalledOnce();
    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.evento).toBe("prova.fatta");
    expect(riga.quanti).toBe(3);
    expect(riga.livello).toBe("info");
    expect(new Date(riga.ts).getTime()).toBeGreaterThan(0);
  });

  it("un errore porta messaggio, tipo e una traccia corta", () => {
    const spia = cattura("error");
    logErrore("prova.fallita", new Error("qualcosa è andato storto"), { dove: "test" });

    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.livello).toBe("errore");
    expect(riga.messaggio).toBe("qualcosa è andato storto");
    expect(riga.tipo).toBe("Error");
    expect(riga.dove).toBe("test");
    // Sei righe di traccia bastano a capire da dove viene: tutto lo stack
    // riempirebbe i log e non aggiungerebbe niente.
    expect(riga.traccia.split(" | ").length).toBeLessThanOrEqual(6);
  });

  it("regge anche quello che viene sollevato e non è un errore", () => {
    const spia = cattura("error");
    logErrore("prova.strana", "una stringa");
    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.tipo).toBe("sconosciuto");
    expect(riga.messaggio).toBe("una stringa");
  });
});

describe("misurare un lavoro", () => {
  it("scrive la durata e l'esito quando va bene", async () => {
    const spia = cattura("log");
    const esito = await conMisura("cron.prova", { nome: "prova" }, async () => 42);

    expect(esito).toBe(42);
    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.esito).toBe("ok");
    expect(riga.nome).toBe("prova");
    expect(riga.durataMs).toBeGreaterThanOrEqual(0);
  });

  it("quando fallisce lo scrive e **rilancia**: un log non è una scusa per andare avanti", async () => {
    const spia = cattura("error");
    await expect(
      conMisura("cron.prova", { nome: "prova" }, async () => {
        throw new Error("rotto");
      }),
    ).rejects.toThrow("rotto");

    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.evento).toBe("cron.prova.fallito");
    expect(riga.messaggio).toBe("rotto");
    expect(riga.durataMs).toBeGreaterThanOrEqual(0);
  });
});

describe("un lavoro pianificato che fallisce", () => {
  const SEGRETO = "segreto-di-prova";

  function richiesta(auth?: string) {
    return new Request("http://localhost/api/cron/prova", {
      headers: auth ? { authorization: auth } : {},
    });
  }

  it("senza CRON_SECRET non parte, e lo dice come configurazione mancante", async () => {
    const spia = cattura("warn");
    delete process.env.CRON_SECRET;
    const { eseguiCron } = await import("@/lib/cron");

    const res = await eseguiCron("prova", richiesta(`Bearer ${SEGRETO}`), async () => ({ ok: true }));

    expect(res.status).toBe(500);
    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.evento).toBe("cron.non_configurato");
  });

  it("con il segreto sbagliato risponde 401, e la cosa si vede nei log", async () => {
    const spia = cattura("warn");
    process.env.CRON_SECRET = SEGRETO;
    const { eseguiCron } = await import("@/lib/cron");

    const res = await eseguiCron("prova", richiesta("Bearer sbagliato"), async () => ({ ok: true }));

    expect(res.status).toBe(401);
    const riga = JSON.parse(spia.mock.calls[0][0] as string);
    expect(riga.evento).toBe("cron.non_autorizzato");
  });

  it("quando il lavoro esplode: 500 generico a chi chiama, dettaglio nei log", async () => {
    const spia = cattura("error");
    process.env.CRON_SECRET = SEGRETO;
    const { eseguiCron } = await import("@/lib/cron");

    const res = await eseguiCron("prova", richiesta(`Bearer ${SEGRETO}`), async () => {
      throw new Error("il database non risponde");
    });

    expect(res.status).toBe(500);
    const corpo = await res.json();
    // Chi chiama non deve leggere com'è fatto il guasto.
    expect(JSON.stringify(corpo)).not.toContain("database");
    expect(corpo.error).toBe("cron_failed");

    // Chi cerca nei log invece deve trovarlo, con un nome cercabile.
    const righe = spia.mock.calls.map((c) => JSON.parse(c[0] as string));
    const guasto = righe.find((r) => r.evento === "cron.prova.non_riuscito");
    expect(guasto).toBeDefined();
    expect(guasto.messaggio).toBe("il database non risponde");
    expect(guasto.cron).toBe("prova");
  });

  it("quando va bene restituisce il conto del lavoro fatto", async () => {
    cattura("log");
    process.env.CRON_SECRET = SEGRETO;
    const { eseguiCron } = await import("@/lib/cron");

    const res = await eseguiCron("prova", richiesta(`Bearer ${SEGRETO}`), async () => ({ accodate: 3 }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accodate: 3 });
  });
});
