import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient, type StaffRole } from "@prisma/client";
import { toolRegistry } from "@/server/ai/tool-registry";
import { PermissionDeniedError, requireAbility } from "@/server/ai/permission-guard";
import { runAgentTurn } from "@/server/ai/agent-service";
import { MONTHLY_LLM_LIMIT, getUsage, tryConsumeLLMRequest } from "@/server/ai/usage-service";
import { getOrCreateConversation } from "@/server/ai/conversation";
import type { AgentContext } from "@/server/ai/types";
import type { Ability } from "@/lib/abilities";

/**
 * L'agente: chi può fargli fare cosa.
 *
 * Era la parte più scoperta del prodotto — servizio, guardia dei permessi,
 * consumo e **tutti e diciotto gli strumenti** senza un solo test — ed è
 * quella che scrive nei dati e legge la rubrica dei clienti. Un agente è una
 * porta in più sulle stesse funzioni: se la guardia non tiene, i permessi del
 * gestionale valgono solo per chi usa i pulsanti.
 *
 * Le prove sono in tre gruppi:
 *
 *  1. **il catalogo**: ogni strumento dichiara il permesso che chiede, e
 *     aggiungerne uno senza deciderlo fa diventare rosso questo file;
 *  2. **la guardia**: il permesso si controlla **prima** di eseguire;
 *  3. **il consumo**: il limite mensile non si supera, nemmeno in due.
 */

const db = new PrismaClient();
const PREFISSO = "test-agente-permessi-";

const url = process.env.DATABASE_URL ?? "";
if (!/dev|test/i.test(url)) {
  throw new Error("Questi test scrivono sul database: DATABASE_URL deve contenere 'dev' o 'test'.");
}

let venueId = "";
let orgId = "";
/* Un utente vero: `AgentConversation.userId` ha un vincolo verso `User`, e una
   stringa inventata fa fallire la creazione della conversazione — non il
   permesso. */
let userId = "";
const contesto = (role: StaffRole): AgentContext => ({
  venueId,
  venueName: "Prova",
  venueTimezone: "Europe/Rome",
  role,
  userId,
  orgId,
});

beforeAll(async () => {
  const unico = `${PREFISSO}${Date.now()}`;
  const org = await db.organization.create({ data: { name: unico, slug: unico } });
  orgId = org.id;
  const v = await db.venue.create({
    data: { orgId: org.id, name: unico, slug: unico, timezone: "Europe/Rome" },
  });
  venueId = v.id;
  userId = (
    await db.user.create({
      data: { email: `${unico}@test.local`, name: "Prova agente" },
    })
  ).id;
}, 60_000);

afterEach(async () => {
  await db.agentUsage.deleteMany({ where: { venueId } });
});

afterAll(async () => {
  await db.agentUsage.deleteMany({ where: { venueId } });
  await db.agentMessage.deleteMany({ where: { conversation: { venueId } } });
  await db.agentConversation.deleteMany({ where: { venueId } });
  await db.organization.deleteMany({ where: { slug: { startsWith: PREFISSO } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFISSO } } });
  await db.$disconnect();
}, 60_000);

/* -------------------------------------------------------------------------- */

describe("il catalogo dei permessi", () => {
  /**
   * Il permesso che ogni strumento chiede, scritto **qui**.
   *
   * È un elenco chiuso di proposito: uno strumento nuovo che non compare in
   * questa tabella fa diventare rosso il test, e chi lo aggiunge è costretto a
   * decidere se chiede un permesso invece di lasciare `null` per inerzia.
   * `null` va benissimo — significa «basta appartenere al locale» — ma deve
   * essere una scelta dichiarata due volte.
   */
  const ATTESI: Record<string, Ability | null> = {
    // Lettura di cose che stanno già sulla schermata di chi chiede.
    get_today_reservations: null,
    get_service_covers: null,
    get_occupancy: null,
    get_available_tables: null,
    get_unassigned_tables: null,
    get_waiter_assignments: null,
    navigate_to_section: null,
    chi_rischia_assenza: null,
    tavoli_lunghi: null,
    giorno_peggiore: null,
    // Assegnare un tavolo: lo fa chi gestisce le prenotazioni, e nell'interfaccia
    // non c'è un permesso in più — non se ne invta uno qui.
    assign_waiter: null,
    // Soldi.
    get_period_revenue: "view_revenue",
    piatti_che_rendono_meno: "view_revenue",
    // Dati del personale.
    get_expiring_contracts: "manage_contracts",
    // Rubrica e campagne.
    chi_non_torna: "edit_marketing",
    /* Il telefono: leggere le risposte scritte dal locale è una cosa che fa
       chi risponde al telefono, non chiunque appartenga al locale. */
    cosa_rispondo: "use_phone",
    // I tre che scrivono.
    prenota: "manage_bookings",
    metti_in_attesa: "manage_bookings",
    crea_richiamata: "use_phone",
  };

  it("ogni strumento del registro è in tabella, e nessuno in più", () => {
    expect(Object.keys(toolRegistry).sort()).toEqual(Object.keys(ATTESI).sort());
  });

  it("ogni strumento chiede il permesso che ha dichiarato", () => {
    for (const [nome, atteso] of Object.entries(ATTESI)) {
      expect(toolRegistry[nome]!.ability, `strumento ${nome}`).toBe(atteso);
    }
  });

  it("i tre strumenti che scrivono chiedono tutti un permesso", () => {
    /* Non è un doppione della prova sopra: quella controlla i valori, questa
       controlla la **regola** — scrivere non è mai gratis. Se un domani si
       aggiunge un quarto strumento che scrive con `ability: null`, la tabella
       lo accetterebbe e questa riga no. */
    for (const nome of ["prenota", "metti_in_attesa", "crea_richiamata"]) {
      expect(toolRegistry[nome]!.ability, `strumento ${nome}`).not.toBeNull();
    }
  });
});

describe("la guardia dei permessi", () => {
  it("lascia passare chi ha il permesso e ferma chi non l'ha", () => {
    expect(() => requireAbility("MANAGER", "view_revenue")).not.toThrow();
    expect(() => requireAbility("WAITER", "view_revenue")).toThrow(PermissionDeniedError);
    expect(() => requireAbility("READ_ONLY", "manage_bookings")).toThrow(PermissionDeniedError);
  });

  it("senza permesso dichiarato passa chiunque appartenga al locale", () => {
    for (const ruolo of ["MANAGER", "RECEPTION", "WAITER", "MARKETING", "READ_ONLY"] as StaffRole[]) {
      expect(() => requireAbility(ruolo, null)).not.toThrow();
    }
  });

  it("l'errore dice **quale** permesso mancava", () => {
    /* Serve a chi legge i registri: «permesso negato» senza il nome non dice
       se manca un ruolo o se lo strumento chiede la cosa sbagliata. */
    try {
      requireAbility("WAITER", "manage_contracts");
      throw new Error("doveva sollevare");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      expect((err as PermissionDeniedError).ability).toBe("manage_contracts");
    }
  });
});

describe("il turno dell'agente", () => {
  async function chiedi(role: StaffRole, testo: string) {
    const conv = await getOrCreateConversation(venueId, userId);
    const eventi = [];
    for await (const e of runAgentTurn(contesto(role), conv.id, testo)) eventi.push(e);
    const ultimo = eventi[eventi.length - 1];
    return ultimo as { type: "done"; message: { content: string }; usage: unknown };
  }

  it("a chi non ha il permesso risponde che non l'ha, e **non esegue** lo strumento", async () => {
    /**
     * La prova che conta: il controllo sta **prima** dell'esecuzione. Se
     * stesse dopo, un cameriere che chiede il fatturato riceverebbe «non hai i
     * permessi» dopo che il fatturato è stato calcolato — e basterebbe un
     * errore nel messaggio per farglielo vedere.
     */
    const vero = toolRegistry.get_period_revenue!;
    const spia = vi.fn(vero.run);
    toolRegistry.get_period_revenue = { ability: vero.ability, run: spia };
    try {
      const esito = await chiedi("WAITER", "quanto abbiamo incassato questo mese?");
      expect(esito.message.content).toMatch(/permessi/i);
      expect(spia).not.toHaveBeenCalled();
    } finally {
      toolRegistry.get_period_revenue = vero;
    }
  });

  it("a chi ce l'ha, lo strumento gira", async () => {
    const vero = toolRegistry.get_period_revenue!;
    const spia = vi.fn(vero.run);
    toolRegistry.get_period_revenue = { ability: vero.ability, run: spia };
    try {
      await chiedi("MANAGER", "quanto abbiamo incassato questo mese?");
      expect(spia).toHaveBeenCalledTimes(1);
    } finally {
      toolRegistry.get_period_revenue = vero;
    }
  });

  it("senza fornitore esterno non consuma niente della quota", async () => {
    /**
     * È scritto nel commento del servizio e non era provato: la disponibilità
     * si controlla **prima** di toccare il contatore, perché se nessuna
     * richiesta parte non deve contare. Altrimenti un'installazione senza
     * chiave brucerebbe duecento richieste al mese senza fare niente.
     */
    const prima = await getUsage(venueId);
    const esito = await chiedi("MANAGER", "raccontami una barzelletta sul risotto");
    expect(esito.message.content).toMatch(/non .* disponibile/i);
    const dopo = await getUsage(venueId);
    expect(dopo.used).toBe(prima.used);
  });

  it("la domanda interna non tocca la quota", async () => {
    await chiedi("MANAGER", "quali tavoli sono liberi?");
    expect((await getUsage(venueId)).used).toBe(0);
  });
});

describe("il limite mensile delle richieste esterne", () => {
  it("conta, e all'ultima dice basta", async () => {
    /* Si parte da un passo prima del limite invece di consumarne duecento: il
       comportamento da provare è il confine, non la salita. */
    await db.agentUsage.create({
      data: { venueId, yearMonth: mesiCorrente(), llmRequestCount: MONTHLY_LLM_LIMIT - 1 },
    });

    const ultima = await tryConsumeLLMRequest(venueId);
    expect(ultima).toMatchObject({ allowed: true, used: MONTHLY_LLM_LIMIT });

    const oltre = await tryConsumeLLMRequest(venueId);
    expect(oltre).toMatchObject({ allowed: false, used: MONTHLY_LLM_LIMIT });
  });

  it("due richieste insieme sull'ultima non passano entrambe", async () => {
    /**
     * Il commento del servizio lo dichiara — «la decisione la prende il
     * database, con un solo UPDATE condizionato» — e questa è la prova. Con
     * un «leggi, confronta, scrivi» in JavaScript passerebbero tutte e due, e
     * il limite sarebbe un suggerimento.
     */
    await db.agentUsage.create({
      data: { venueId, yearMonth: mesiCorrente(), llmRequestCount: MONTHLY_LLM_LIMIT - 1 },
    });

    const esiti = await Promise.all([
      tryConsumeLLMRequest(venueId),
      tryConsumeLLMRequest(venueId),
    ]);
    expect(esiti.filter((e) => e.allowed)).toHaveLength(1);
    expect((await getUsage(venueId)).used).toBe(MONTHLY_LLM_LIMIT);
  });
});

function mesiCorrente() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
