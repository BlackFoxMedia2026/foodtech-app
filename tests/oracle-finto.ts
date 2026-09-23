import { createHash, randomBytes } from "node:crypto";
import { HOST_AUTH, HOST_STS, ORACLE } from "./fixture-oracle-simphony";

/**
 * **Un Oracle Simphony STS Gen2 finto, solo per le prove.**
 *
 * Riproduce ciò che la guida ufficiale descrive, e niente di più:
 * - l'accesso OIDC dell'API account: `authorize` con cookie, `signin` con
 *   utente/password/orgname, `token` con **verifica PKCE S256**, rinnovo con
 *   `refresh_token` (che ruota); bearer = `id_token`;
 * - le intestazioni `Simphony-OrgShortName/LocRef/RvcRef` obbligatorie sui check;
 * - `detect-duplicate-request`: stesso `idempotencyId` entro 300 secondi →
 *   stessa risposta con `isCachedResponse: true`;
 * - `status: closed` quando i tender coprono il dovuto; round rifiutati su un
 *   check chiuso;
 * - `connectionStatus` con `Simphony-POS-Connected`;
 * - registrazione e iscrizioni delle notifiche.
 *
 * Ciò che la guida non dice (per esempio il corpo esatto di un errore su un
 * check chiuso) è inventato qui in modo prudente e **non** è una verifica.
 */

type Guasto = null | "503" | "521" | "timeout" | "token_revocato" | "json_rotto";

type Check = {
  header: Record<string, unknown>;
  menuItems: Record<string, unknown>[];
  tenders: Record<string, unknown>[];
  extensions: unknown[];
  creatoIl: number;
  eliminato?: boolean;
};

export function creaOracleFinto() {
  const stato = {
    account: new Map<string, { utente: string; password: string; org: string }>([
      ["client-A", { utente: "api-a", password: "segreta-A", org: "tfoinc" }],
      ["client-B", { utente: "api-b", password: "segreta-B", org: "tfoinc" }],
    ]),
    sessioni: new Map<string, { clientId: string; challenge: string }>(), // cookie → authorize
    codici: new Map<string, { clientId: string; challenge: string }>(),
    idToken: new Map<string, string>(), // id_token → clientId
    refresh: new Map<string, string>(), // refresh → clientId
    checks: new Map<string, Check>(),
    idempotenza: new Map<string, { risposta: unknown; il: number }>(),
    registrazioni: new Map<string, { keyId: string; hmacKey: string }>(), // clientId → chiave
    iscrizioni: [] as { subscriptionId: string; clientId: string; callbackUri: string; messageType: { id: string }; locRef?: string; rvcRef?: string }[],
    posCollegato: true as boolean | null,
    guasto: null as Guasto,
    guastoSoloCheck: false,
    ritardoCheckMs: 0,
    postCheck: 0,
    postRound: 0,
    chiamate: [] as { metodo: string; url: string; auth: string | null; intestazioni: Record<string, string>; corpo: string | null }[],
    adesso: () => Date.now(),
    contatore: 0,
  };

  const json = (status: number, corpo: unknown, intestazioni: Record<string, string> = {}) =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...intestazioni } });
  const problema = (code: string, message: string) => json(400, { title: "POS Error", status: 400, detail: message, instance: "error:pos-error", posDetails: [{ code, message }] });

  function totaliDi(k: Check) {
    const subtotal = k.menuItems.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const paymentTotal = k.tenders.reduce((s, t) => s + Number(t.total ?? 0), 0);
    return { subtotal, subtotalDiscountTotal: 0, autoServiceChargeTotal: 0, serviceChargeTotal: 0, taxTotal: 0, paymentTotal, totalDue: Math.max(0, Math.round((subtotal - paymentTotal) * 100) / 100) };
  }
  const prezzo = (id: number) =>
    Number((ORACLE.menu.menuItems.find((m) => m.menuItemId === id)?.definitions[0]?.prices[0] as { price?: number } | undefined)?.price ?? 0);
  const nome = (id: number) => {
    const n = ORACLE.menu.menuItems.find((m) => m.menuItemId === id)?.name as Record<string, string> | undefined;
    return n?.["it-IT"] ?? `Voce ${id}`;
  };
  const righe = (items: Record<string, unknown>[]) =>
    items.map((r) => ({ ...r, name: nome(Number(r.menuItemId)), total: prezzo(Number(r.menuItemId)) * Number(r.quantity ?? 1) }));
  const vista = (k: Check, extra: Record<string, unknown> = {}) => ({
    header: { ...k.header, ...extra },
    menuItems: k.menuItems,
    tenders: k.tenders,
    extensions: k.extensions,
    totals: totaliDi(k),
  });

  const fetchFinto = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const metodo = (init.method ?? "GET").toUpperCase();
    const h = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const corpoTesto = init.body ? String(init.body) : null;
    stato.chiamate.push({ metodo, url, auth: h.authorization ?? null, intestazioni: h, corpo: corpoTesto });

    if (init.redirect !== "error") return json(500, { errore: "la prova esige redirect: error su ogni chiamata" });

    /* ------------------------------ OIDC ------------------------------ */
    if (u.origin === HOST_AUTH) {
      const p = u.pathname;
      if (p === "/oidc-provider/v1/oauth2/authorize") {
        const q = u.searchParams;
        if (!stato.account.has(q.get("client_id") ?? "")) return json(400, { status: 400, message: "INVALID_CLIENT", code: "VALIDATION_ERRORS" });
        if (q.get("code_challenge_method") !== "S256" || q.get("redirect_uri") !== "apiaccount://callback" || q.get("scope") !== "openid") {
          return json(400, { status: 400, message: "INVALID_REQUEST", code: "VALIDATION_ERRORS" });
        }
        const cookie = randomBytes(8).toString("hex");
        stato.sessioni.set(cookie, { clientId: q.get("client_id")!, challenge: q.get("code_challenge")! });
        return json(200, {}, { "set-cookie": `oidc_session=${cookie}; Path=/; Secure; HttpOnly` });
      }
      const form = new URLSearchParams(corpoTesto ?? "");
      if (p === "/oidc-provider/v1/oauth2/signin") {
        const cookie = /oidc_session=([^;]+)/.exec(h.cookie ?? "")?.[1];
        const s = cookie ? stato.sessioni.get(cookie) : undefined;
        const a = s ? stato.account.get(s.clientId) : undefined;
        if (!s || !a || a.utente !== form.get("username") || a.password !== form.get("password") || a.org !== form.get("orgname")) {
          return json(401, { status: 401, message: "Invalid credentials.", code: "AUTHENTICATION_INVALID" });
        }
        const code = `code-${randomBytes(6).toString("hex")}=`;
        stato.codici.set(code, s);
        return json(200, { nextOp: "redirect", success: true, redirectUrl: `apiaccount://callback?code=${encodeURIComponent(code)}` });
      }
      if (p === "/oidc-provider/v1/oauth2/token") {
        let clientId: string | undefined;
        if (form.get("grant_type") === "authorization_code") {
          const c = stato.codici.get(form.get("code") ?? "");
          const verifier = form.get("code_verifier") ?? "";
          const atteso = c ? createHash("sha256").update(verifier).digest("base64url") : null;
          if (!c || atteso !== c.challenge || form.get("client_id") !== c.clientId) {
            return json(401, { status: 401, message: "AUTHENTICATION_CODE_NOT_FOUND", code: "RECORD_NOT_FOUND" });
          }
          stato.codici.delete(form.get("code")!);
          clientId = c.clientId;
        } else if (form.get("grant_type") === "refresh_token") {
          clientId = stato.refresh.get(form.get("refresh_token") ?? "");
          if (!clientId || clientId !== form.get("client_id")) return json(401, { status: 401, message: "AUTHENTICATION_CODE_NOT_FOUND", code: "RECORD_NOT_FOUND" });
          stato.refresh.delete(form.get("refresh_token")!);
        } else return json(400, { status: 400, message: "unsupported grant" });
        const n = ++stato.contatore;
        const t = { ...ORACLE.token(n), id_token: `id-${clientId}-${n}`, refresh_token: `rt-${clientId}-${n}` };
        stato.idToken.set(t.id_token, clientId);
        stato.refresh.set(t.refresh_token, clientId);
        return json(200, t);
      }
      return json(404, {});
    }

    /* ------------------------------ STS ------------------------------- */
    if (u.origin !== HOST_STS || !u.pathname.startsWith("/api/v1/")) return json(404, {});
    const p = decodeURIComponent(u.pathname.slice("/api/v1".length));
    const eCheck = p.startsWith("/checks");
    if (stato.guasto && (!stato.guastoSoloCheck || eCheck)) {
      if (stato.guasto === "503") return json(503, {});
      if (stato.guasto === "521") return json(521, {});
      if (stato.guasto === "timeout") throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      if (stato.guasto === "json_rotto") return new Response("{non json", { status: 200, headers: { "content-type": "application/json" } });
    }
    const bearer = (h.authorization ?? "").replace(/^Bearer /, "");
    const clientId = stato.idToken.get(bearer);
    if (!clientId || (stato.guasto === "token_revocato" && clientId === "client-A")) return json(401, {});
    const org = stato.account.get(clientId)!.org;
    const q = u.searchParams;
    const corpo = corpoTesto ? (JSON.parse(corpoTesto) as Record<string, unknown>) : {};

    if (eCheck || p.startsWith("/menus/tfoinc")) {
      if (!h["simphony-orgshortname"] || !h["simphony-locref"] || !h["simphony-rvcref"]) return json(400, { title: "Missing Simphony headers" });
      if (h["simphony-orgshortname"] !== org) return json(403, {});
    }
    if (stato.ritardoCheckMs && eCheck && metodo === "POST") await new Promise((r) => setTimeout(r, stato.ritardoCheckMs));

    // Organization API
    if (p === "/organizations") return json(200, ORACLE.organizations);
    let m = /^\/organizations\/([^/]+)\/locations$/.exec(p);
    if (m) return m[1] === org ? json(200, ORACLE.locations) : json(403, {});
    m = /^\/organizations\/([^/]+)\/locations\/([^/]+)\/revenueCenters$/.exec(p);
    if (m) return json(200, ORACLE.rvcs(m[2]!));
    m = /^\/organizations\/([^/]+)\/locations\/([^/]+)\/revenueCenters\/(\d+)$/.exec(p);
    if (m) {
      const r = ORACLE.rvcs(m[2]!).revenueCenter[0]!;
      return Number(m[3]) === r.rvcRef ? json(200, r) : json(404, {});
    }
    // Configuration API
    if (p === "/menus/summary") return json(200, ORACLE.menuSummary);
    if (p === "/menus/tfoinc:fdmnh144:42") return json(200, ORACLE.menu);
    if (p === "/menus/items/unavailable") return json(200, ORACLE.nonDisponibili);
    if (p === "/taxes") return json(200, ORACLE.taxes);
    if (p === "/tenders/collection") return json(200, ORACLE.tenders);
    if (p === "/discounts/collection") return json(200, ORACLE.discounts);
    if (p === "/serviceCharges/collection") return json(200, ORACLE.serviceCharges);
    if (p === "/employees") return q.get("EmployeeId") === "900" ? json(200, ORACLE.employee) : json(404, { title: "Not found" });

    // Notifications API
    if (p === "/notifications/registration") {
      if (metodo === "PUT") {
        stato.registrazioni.set(clientId, { keyId: String(corpo.keyId), hmacKey: String(corpo.hmacKey) });
        return json(204, undefined);
      }
      if (metodo === "DELETE") return stato.registrazioni.delete(clientId) ? json(204, undefined) : json(404, {});
    }
    if (p === "/notifications/subscriptions") {
      if (metodo === "GET") return json(200, stato.iscrizioni.filter((i) => i.clientId === clientId));
      if (metodo === "POST") {
        if (corpo.messageType && (corpo.messageType as { id: string }).id === "EmployeesNotification" && corpo.rvcRef) return json(400, {});
        const s = { ...(corpo as object), subscriptionId: randomBytes(8).toString("hex"), clientId } as (typeof stato.iscrizioni)[number];
        stato.iscrizioni.push(s);
        return json(200, s);
      }
    }
    m = /^\/notifications\/subscriptions\/([^/]+)$/.exec(p);
    if (m && metodo === "DELETE") {
      const prima = stato.iscrizioni.length;
      stato.iscrizioni = stato.iscrizioni.filter((i) => !(i.subscriptionId === m![1] && i.clientId === clientId));
      return prima === stato.iscrizioni.length ? json(404, {}) : json(204, undefined);
    }

    // Checks API
    if (p === "/checks/connectionStatus" && metodo === "HEAD") {
      return new Response(null, { status: 200, headers: stato.posCollegato === null ? {} : { "Simphony-POS-Connected": String(stato.posCollegato) } });
    }
    const dup = (id: unknown) => {
      if (!(h["simphony-features"] ?? "").split(",").map((x) => x.trim()).includes("detect-duplicate-request")) return null;
      const v = stato.idempotenza.get(String(id));
      return v && stato.adesso() - v.il < 300_000 ? v.risposta : null;
    };
    if (p === "/checks" && metodo === "POST") {
      stato.postCheck++;
      const header = (corpo.header ?? {}) as Record<string, unknown>;
      for (const campo of ["orgShortName", "locRef", "rvcRef", "idempotencyId", "checkEmployeeRef", "orderTypeRef"]) {
        if (header[campo] === undefined) return json(400, { title: `header.${campo} required` });
      }
      const doppio = dup(header.idempotencyId) as { header: Record<string, unknown> } | null;
      if (doppio) return json(200, { ...doppio, header: { ...doppio.header, isCachedResponse: true } });
      const checkRef = randomBytes(20).toString("hex");
      const k: Check = {
        header: { ...header, checkRef, checkNumber: stato.checks.size + 1, status: "open", preparationStatus: "Submitted" },
        menuItems: righe((corpo.menuItems as Record<string, unknown>[]) ?? []),
        tenders: [],
        extensions: (corpo.extensions as unknown[]) ?? [],
        creatoIl: stato.adesso(),
      };
      stato.checks.set(checkRef, k);
      const risposta = vista(k);
      stato.idempotenza.set(String(header.idempotencyId), { risposta, il: stato.adesso() });
      return json(200, risposta);
    }
    if (p === "/checks" && metodo === "GET") {
      const incluso = q.get("includeClosed") === "true";
      const tavolo = q.get("tableName");
      const da = q.get("sinceTime") ? Date.parse(q.get("sinceTime")!) : 0;
      return json(200, {
        items: [...stato.checks.values()]
          .filter((k) => !k.eliminato && (incluso || k.header.status === "open") && (!tavolo || k.header.tableName === tavolo) && k.creatoIl >= da)
          .map((k) => vista(k)),
      });
    }
    if (p === "/checks/calculator" && metodo === "POST") {
      const k: Check = { header: (corpo.header ?? {}) as Record<string, unknown>, menuItems: righe((corpo.menuItems as Record<string, unknown>[]) ?? []), tenders: [], extensions: [], creatoIl: 0 };
      return json(200, { ...vista(k), tenders: undefined });
    }
    m = /^\/checks\/([^/]+)(\/round|\/printed)?$/.exec(p);
    if (m) {
      const k = stato.checks.get(m[1]!);
      if (!k || k.eliminato) return json(404, { title: "Check is invalid." });
      if (!m[2] && metodo === "GET") return json(200, vista(k));
      if (!m[2] && metodo === "DELETE") {
        k.eliminato = true;
        return json(204, undefined);
      }
      if (m[2] === "/printed") return json(200, ORACLE.printed);
      if (m[2] === "/round" && metodo === "POST") {
        stato.postRound++;
        const header = (corpo.header ?? {}) as Record<string, unknown>;
        if (header.checkRef !== m[1]) return json(400, { title: "checkRef value mismatch" });
        const doppio = dup(header.idempotencyId) as { header: Record<string, unknown> } | null;
        if (doppio) return json(200, { ...doppio, header: { ...doppio.header, isCachedResponse: true } });
        if (k.header.status === "closed") return problema("general_pos_error", "Check is closed");
        k.menuItems.push(...righe((corpo.menuItems as Record<string, unknown>[]) ?? []));
        k.tenders.push(...(((corpo.tenders as Record<string, unknown>[]) ?? []).map((t) => ({ ...t, name: ORACLE.tenders.items.find((x) => x.tenderId === t.tenderId)?.name }))));
        if (totaliDi(k).totalDue <= 0 && k.tenders.length) k.header.status = "closed";
        const risposta = vista(k);
        stato.idempotenza.set(String(header.idempotencyId), { risposta, il: stato.adesso() });
        return json(200, risposta);
      }
    }
    return json(404, {});
  }) as unknown as typeof fetch;

  return { stato, fetchFinto };
}
