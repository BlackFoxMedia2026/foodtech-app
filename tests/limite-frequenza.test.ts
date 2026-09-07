import { describe, expect, it } from "vitest";
import { RATE_LIMITS, checkRateLimit, clientKey } from "@/lib/rate-limit";

/**
 * Prima non esisteva alcun limite: dal widget pubblico un bot poteva saturare
 * tutti i turni con indirizzi inventati, e provare password a raffica non
 * costava nulla.
 *
 * Le prove passano un `now` esplicito invece di aspettare davvero: un test che
 * dorme dieci minuti non lo esegue nessuno.
 */

/** Chiave diversa a ogni prova: il contenitore è unico per processo e senza
 * questo i test si conterebbero a vicenda. */
let contatore = 0;
const chiave = (nome: string) => `test:${nome}:${contatore++}`;

describe("limite di frequenza", () => {
  it("lascia passare fino al limite e poi blocca", () => {
    const k = chiave("base");
    const regola = { limit: 3, windowMs: 60_000 };

    expect(checkRateLimit(k, regola, 1000).ok).toBe(true);
    expect(checkRateLimit(k, regola, 1100).ok).toBe(true);
    expect(checkRateLimit(k, regola, 1200).ok).toBe(true);

    const bloccato = checkRateLimit(k, regola, 1300);
    expect(bloccato.ok).toBe(false);
    expect(bloccato.remaining).toBe(0);
    expect(bloccato.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("dice quante richieste restano", () => {
    const k = chiave("residue");
    const regola = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit(k, regola, 1000).remaining).toBe(2);
    expect(checkRateLimit(k, regola, 1000).remaining).toBe(1);
    expect(checkRateLimit(k, regola, 1000).remaining).toBe(0);
  });

  it("riapre quando la finestra è passata", () => {
    const k = chiave("finestra");
    const regola = { limit: 2, windowMs: 60_000 };

    checkRateLimit(k, regola, 0);
    checkRateLimit(k, regola, 0);
    expect(checkRateLimit(k, regola, 0).ok).toBe(false);

    // un istante prima della scadenza: ancora chiuso
    expect(checkRateLimit(k, regola, 59_999).ok).toBe(false);
    // finestra nuova
    expect(checkRateLimit(k, regola, 60_001).ok).toBe(true);
  });

  it("l'attesa suggerita non supera la finestra e non è mai zero quando blocca", () => {
    const k = chiave("attesa");
    const regola = { limit: 1, windowMs: 10_000 };
    checkRateLimit(k, regola, 0);
    const bloccato = checkRateLimit(k, regola, 9_999);
    expect(bloccato.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(bloccato.retryAfterSeconds).toBeLessThanOrEqual(10);
  });

  it("due chiamanti diversi non si rubano il limite a vicenda", () => {
    const regola = { limit: 1, windowMs: 60_000 };
    const a = chiave("primo");
    const b = chiave("secondo");
    expect(checkRateLimit(a, regola, 0).ok).toBe(true);
    expect(checkRateLimit(b, regola, 0).ok).toBe(true);
    expect(checkRateLimit(a, regola, 0).ok).toBe(false);
  });

  it("le regole in vigore sono quelle attese", () => {
    // Se qualcuno allarga il limite del widget pubblico, questo test lo
    // rende una scelta esplicita invece di una modifica silenziosa.
    expect(RATE_LIMITS.publicBooking).toEqual({ limit: 5, windowMs: 600_000 });
    expect(RATE_LIMITS.login.limit).toBeLessThanOrEqual(10);
  });
});

describe("riconoscere il chiamante", () => {
  it("dietro un proxy usa il primo indirizzo di x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientKey(h)).toBe("203.0.113.7");
  });

  it("ripiega su x-real-ip", () => {
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("senza indizi mette tutti nello stesso secchio invece di lasciar passare", () => {
    // Severo di proposito: preferire un falso positivo a nessun limite.
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
