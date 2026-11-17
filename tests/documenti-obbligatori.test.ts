import { describe, expect, it } from "vitest";
import { documentiRichiesti, richiedePermesso, verificaDocumenti } from "@/lib/documenti-obbligatori";

describe("permesso di soggiorno", () => {
  it("non serve a italiani ed europei, comunque scritti", () => {
    for (const n of ["Italiana", "italiano", "ITALIA", "IT", "Rumena", "romena", "Francese", "Tedesca", "Spagnola", "Polacca", "Ceca", "Svizzera", "Sammarinese", "Italiana e marocchina", "Albanese, italiana"]) {
      expect(richiedePermesso(n), n).toBe(false);
    }
  });

  it("serve a chi non è europeo", () => {
    for (const n of ["Marocchina", "Albanese", "Senegalese", "Cinese", "Bengalese", "Ucraina", "Peruviana", "Extracomunitaria", "Apolide"]) {
      expect(richiedePermesso(n), n).toBe(true);
    }
  });

  it("con la nazionalità vuota non si chiede", () => {
    expect(richiedePermesso("")).toBe(false);
    expect(richiedePermesso(null)).toBe(false);
  });
});

describe("documenti richiesti", () => {
  const chiavi = (p: Parameters<typeof documentiRichiesti>[0]) => documentiRichiesti(p).map((r) => r.chiave);

  it("un cameriere italiano: identità, CF, scheda anagrafica, HACCP", () => {
    expect(chiavi({ nationality: "Italiana", primaryRole: "CAMERIERE" })).toEqual(["identita", "codice_fiscale", "scheda_anagrafica", "haccp"]);
  });

  it("un cuoco extracomunitario ha anche il permesso", () => {
    expect(chiavi({ nationality: "Marocchina", primaryRole: "CHEF_DE_PARTIE" })).toEqual([
      "identita",
      "codice_fiscale",
      "permesso",
      "scheda_anagrafica",
      "haccp",
    ]);
  });

  it("l'accoglienza non tocca gli alimenti: niente HACCP", () => {
    expect(chiavi({ nationality: "Italiana", primaryRole: "HOST" })).not.toContain("haccp");
  });
});

describe("verifica", () => {
  const oggi = new Date("2026-11-17T12:00:00Z");
  const persona = { nationality: "Albanese", primaryRole: "CAMERIERE" as const };
  const doc = (id: string, category: string, expiresAt: string | null = null) => ({
    id,
    category: category as never,
    expiresAt,
    createdAt: "2026-11-01T00:00:00Z",
  });

  it("un permesso scaduto non vale, uno valido sì", () => {
    const esiti = verificaDocumenti(persona, [doc("p1", "PERMESSO_SOGGIORNO", "2026-10-01")], [], oggi);
    expect(esiti.find((e) => e.chiave === "permesso")?.stato).toBe("scaduto");
    const ok = verificaDocumenti(persona, [doc("p2", "PERMESSO_SOGGIORNO", "2027-10-01")], [], oggi);
    expect(ok.find((e) => e.chiave === "permesso")?.stato).toBe("ok");
  });

  it("l'HACCP vale anche dal corso in Formazione", () => {
    const esiti = verificaDocumenti(persona, [], [{ kind: "HACCP", expiresAt: "2027-05-01", certificate: { id: "c" } }], oggi);
    const haccp = esiti.find((e) => e.chiave === "haccp");
    expect(haccp?.stato).toBe("ok");
    expect(haccp?.daFormazione).toBe(true);
  });

  it("senza nulla, tutto mancante", () => {
    expect(verificaDocumenti(persona, [], [], oggi).every((e) => e.stato === "mancante")).toBe(true);
  });
});
