import { afterEach, describe, expect, it } from "vitest";
import { eSuperAdmin } from "@/lib/super-admin";

/**
 * Chi entra nel pannello di piattaforma.
 *
 * È il controllo che separa «gestisco il mio ristorante» da «vedo e cambio i
 * dati di tutti i ristoranti». Sbagliarlo in senso permissivo non produce un
 * errore visibile: produce un cliente che può leggere i dati degli altri.
 */

const originale = process.env.SUPER_ADMIN_EMAILS;

afterEach(() => {
  process.env.SUPER_ADMIN_EMAILS = originale;
});

describe("eSuperAdmin", () => {
  it("riconosce chi è nell'elenco", () => {
    process.env.SUPER_ADMIN_EMAILS = "capo@blackfox.it";
    expect(eSuperAdmin("capo@blackfox.it")).toBe(true);
  });

  it("non guarda maiuscole né spazi: un'email è la stessa email", () => {
    process.env.SUPER_ADMIN_EMAILS = " Capo@BlackFox.it , altro@blackfox.it ";
    expect(eSuperAdmin("capo@blackfox.it")).toBe(true);
    expect(eSuperAdmin("ALTRO@blackfox.it")).toBe(true);
  });

  it("dice di no a chi non c'è", () => {
    process.env.SUPER_ADMIN_EMAILS = "capo@blackfox.it";
    expect(eSuperAdmin("ristoratore@nomad.it")).toBe(false);
  });

  it("con l'elenco vuoto non entra nessuno", () => {
    // Una variabile dimenticata deve lasciare la porta chiusa. Se qui
    // tornasse `true`, un deploy senza configurazione aprirebbe i dati di
    // tutti i clienti a chiunque abbia un account.
    process.env.SUPER_ADMIN_EMAILS = "";
    expect(eSuperAdmin("capo@blackfox.it")).toBe(false);
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(eSuperAdmin("capo@blackfox.it")).toBe(false);
  });

  it("senza email non entra", () => {
    process.env.SUPER_ADMIN_EMAILS = "capo@blackfox.it";
    expect(eSuperAdmin(null)).toBe(false);
    expect(eSuperAdmin(undefined)).toBe(false);
    expect(eSuperAdmin("")).toBe(false);
  });

  it("non basta il pezzo iniziale dell'indirizzo", () => {
    process.env.SUPER_ADMIN_EMAILS = "capo@blackfox.it";
    expect(eSuperAdmin("capo@blackfox.it.attaccante.com")).toBe(false);
    expect(eSuperAdmin("capo@blackfox")).toBe(false);
  });
});
