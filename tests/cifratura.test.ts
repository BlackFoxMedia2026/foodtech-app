import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErroreDiCifratura, cifra, cifraturaAttiva, decifra, eCifrato } from "@/lib/cifratura";

/**
 * Cifrare a riposo i segreti che devono restare leggibili.
 *
 * La password del Wi-Fi non può diventare un'impronta: va **riletta e
 * mostrata**, perché è quello che il portale consegna a chi lascia un
 * contatto. Quindi si può solo mettere sotto chiave — e questi test fissano
 * cosa succede in ognuno dei tre stati in cui una riga può trovarsi: sotto
 * chiave, in chiaro dichiarato, e scritta prima che la cifratura esistesse.
 */

const CHIAVE_ORIGINALE = process.env.CHIAVE_CIFRATURA;

// 32 byte in base64, come li genera `openssl rand -base64 32`.
const CHIAVE = Buffer.alloc(32, 7).toString("base64");
const ALTRA_CHIAVE = Buffer.alloc(32, 9).toString("base64");

beforeEach(() => {
  process.env.CHIAVE_CIFRATURA = CHIAVE;
});

afterEach(() => {
  if (CHIAVE_ORIGINALE === undefined) delete process.env.CHIAVE_CIFRATURA;
  else process.env.CHIAVE_CIFRATURA = CHIAVE_ORIGINALE;
});

describe("con la chiave configurata", () => {
  it("un giro completo restituisce esattamente quello che era", () => {
    const password = "Aurora-2026!ospiti";
    const cifrata = cifra(password)!;
    expect(cifrata).not.toContain(password);
    expect(eCifrato(cifrata)).toBe(true);
    expect(decifra(cifrata)).toBe(password);
  });

  it("due scritture dello stesso testo danno due valori diversi", () => {
    // Vettore d'inizializzazione nuovo a ogni scrittura: due locali con la
    // stessa password non devono avere la stessa riga nel database.
    const a = cifra("stessa-password")!;
    const b = cifra("stessa-password")!;
    expect(a).not.toBe(b);
    expect(decifra(a)).toBe(decifra(b));
  });

  it("gli accenti e i caratteri speciali tornano intatti", () => {
    const password = "città-perché_2026#€";
    expect(decifra(cifra(password)!)).toBe(password);
  });

  it("una passphrase lunga sta nello spazio della colonna", () => {
    // La colonna è VarChar(512) proprio per questo: 128 caratteri cifrati,
    // col vettore e il sigillo, non stanno in 128.
    const lunga = "x".repeat(128);
    const cifrata = cifra(lunga)!;
    expect(cifrata.length).toBeLessThanOrEqual(512);
    expect(decifra(cifrata)).toBe(lunga);
  });

  it("un byte cambiato fa fallire la lettura, non restituire spazzatura", () => {
    /**
     * È il motivo per cui si usa GCM e non CBC: una password sbagliata
     * mostrata a un cliente è peggio di un errore, perché il cliente prova,
     * non si collega, e dà la colpa al ristorante.
     */
    const cifrata = cifra("Aurora-2026")!;
    const pezzi = cifrata.split(":");
    const guasto = Buffer.from(pezzi[3], "base64");
    guasto[0] ^= 0xff;
    pezzi[3] = guasto.toString("base64");

    expect(() => decifra(pezzi.join(":"))).toThrow(ErroreDiCifratura);
  });

  it("con un'altra chiave non si legge: non si finge di aver letto", () => {
    const cifrata = cifra("Aurora-2026")!;
    process.env.CHIAVE_CIFRATURA = ALTRA_CHIAVE;
    expect(() => decifra(cifrata)).toThrow(/sigillo_non_valido/);
  });

  it("una chiave in esadecimale va bene come una in base64", () => {
    process.env.CHIAVE_CIFRATURA = Buffer.alloc(32, 3).toString("hex");
    expect(cifraturaAttiva()).toBe(true);
    expect(decifra(cifra("prova")!)).toBe("prova");
  });

  it("una passphrase qualsiasi diventa una chiave invece di far esplodere il deploy", () => {
    // È una chiave debole, e nel modulo c'è scritto. Ma un errore al deploy
    // spegnerebbe il portale Wi-Fi di tutti i locali.
    process.env.CHIAVE_CIFRATURA = "la mia chiave scritta a mano";
    expect(cifraturaAttiva()).toBe(true);
    expect(decifra(cifra("prova")!)).toBe("prova");
  });
});

describe("senza chiave configurata", () => {
  beforeEach(() => {
    delete process.env.CHIAVE_CIFRATURA;
  });

  it("il valore si salva in chiaro, ma con l'etichetta", () => {
    // Dichiarato, non nascosto: e l'interfaccia lo dice a chi gestisce il
    // locale.
    expect(cifraturaAttiva()).toBe(false);
    const salvato = cifra("Aurora-2026")!;
    expect(salvato).toBe("chiaro:Aurora-2026");
    expect(eCifrato(salvato)).toBe(false);
    expect(decifra(salvato)).toBe("Aurora-2026");
  });

  it("un valore cifrato non si legge, e non si finge il contrario", () => {
    process.env.CHIAVE_CIFRATURA = CHIAVE;
    const cifrata = cifra("Aurora-2026")!;
    delete process.env.CHIAVE_CIFRATURA;
    expect(() => decifra(cifrata)).toThrow(/chiave_mancante/);
  });
});

describe("le righe scritte prima che la cifratura esistesse", () => {
  it("si leggono come sono, senza nessuna migrazione di dati", () => {
    expect(decifra("Aurora-2026")).toBe("Aurora-2026");
    expect(eCifrato("Aurora-2026")).toBe(false);
  });

  it("una password che contiene i due punti non viene confusa con un formato", () => {
    // «chiaro:» e «v1:» sono prefissi: una password come «rete:2026» non
    // comincia con nessuno dei due e resta quello che è.
    expect(decifra("rete:2026")).toBe("rete:2026");
  });

  it("il vuoto e il nullo restano quello che sono", () => {
    expect(cifra(null)).toBeNull();
    expect(cifra("")).toBe("");
    expect(decifra(null)).toBeNull();
    expect(decifra("")).toBe("");
  });
});
