import { describe, expect, it } from "vitest";
import { CATALOGO, requisitiMancanti, voceDi } from "@/server/integrations/registry";
import { adattatoreDi, slugConAdattatore } from "@/server/integrations/adapters";
import { eAdattatorePos, METODI_PER_CAPACITA } from "@/server/integrations/adapters/tipi";
import { CAPACITA, CATEGORIE } from "@/server/integrations/tipi";
import { SCOPE } from "@/server/integrations/adapters/lightspeed-k/config";

/**
 * **Il catalogo non deve poter mentire.**
 *
 * Esserci nel catalogo non vuol dire funzionare, e l'interfaccia mostra
 * quello che il catalogo dice. Queste prove fissano le combinazioni che
 * sarebbero bugie: una voce «disponibile» senza un connettore provato, una
 * capacità dichiarata senza il metodo che la fa, un pulsante «Installa» su
 * qualcosa che non ha codice.
 */

describe("catalogo delle integrazioni", () => {
  it("id e slug sono unici, e le categorie sono quelle ammesse", () => {
    const id = CATALOGO.map((v) => v.id);
    const slug = CATALOGO.map((v) => v.slug);
    expect(new Set(id).size).toBe(id.length);
    expect(new Set(slug).size).toBe(slug.length);
    for (const v of CATALOGO) {
      expect(CATEGORIE).toContain(v.categoria);
      expect(v.slug).toMatch(/^[a-z0-9-]+$/);
      expect(v.logo.monogramma.length).toBeGreaterThan(0);
    }
  });

  it("contiene le voci chieste, con la categoria giusta", () => {
    const attese: Record<string, string[]> = {
      POS: ["lightspeed-k", "oracle-simphony", "icg", "cassa-in-cloud", "tilby", "passepartout", "zucchetti"],
      PAGAMENTI: ["stripe", "adyen", "google-pay", "apple-pay", "paynopain"],
      PRENOTAZIONI: [
        "google",
        "google-maps",
        "facebook",
        "instagram",
        "opentable",
        "resy",
        "amadeus",
        "simple-night",
        "petal-maps",
      ],
      MARKETING: ["mailchimp", "brevo"],
      ANALYTICS: ["ga4", "gtm"],
      CRM: ["salesforce"],
      TELEFONIA: ["jusan", "gamma"],
    };
    for (const [categoria, slugs] of Object.entries(attese)) {
      for (const s of slugs) {
        expect(voceDi(s), s).not.toBeNull();
        expect(voceDi(s)!.categoria, s).toBe(categoria);
      }
    }
  });

  it("AVAILABLE solo per ciò che è IMPLEMENTED", () => {
    for (const v of CATALOGO.filter((x) => x.disponibilita === "AVAILABLE")) {
      expect(v.implementazione, v.slug).toBe("IMPLEMENTED");
    }
  });

  it("PREVIEW solo per IN_DEVELOPMENT, e con un adattatore vero", () => {
    for (const v of CATALOGO.filter((x) => x.disponibilita === "PREVIEW")) {
      expect(v.implementazione, v.slug).toBe("IN_DEVELOPMENT");
      expect(adattatoreDi(v.slug), v.slug).not.toBeNull();
    }
  });

  it("una voce PLANNED non si installa, non dichiara capacità e non ha codice", () => {
    for (const v of CATALOGO.filter((x) => x.implementazione === "PLANNED")) {
      expect(v.disponibilita, v.slug).toBe("COMING_SOON");
      expect(v.capacita, v.slug).toEqual([]);
      expect(v.versioneAdattatore, v.slug).toBeNull();
      expect(adattatoreDi(v.slug), v.slug).toBeNull();
      expect(v.autenticazione.verificata, v.slug).toBe(false);
    }
  });

  it("chi non è IMPLEMENTED dice cosa manca; chi lo è non ha niente da dire", () => {
    for (const v of CATALOGO) {
      if (v.implementazione === "IMPLEMENTED") expect(v.mancaPerOperare, v.slug).toEqual([]);
      else expect(v.mancaPerOperare.length, v.slug).toBeGreaterThan(0);
    }
  });

  it("oggi l'unica voce IMPLEMENTED è Stripe, ed è quella nativa", () => {
    /* Se questo test diventa rosso perché una voce è passata a IMPLEMENTED,
       la domanda da farsi prima di aggiornarlo è una sola: è stata provata
       contro il fornitore vero, con un account vero? */
    const implementate = CATALOGO.filter((v) => v.implementazione === "IMPLEMENTED").map((v) => v.slug);
    expect(implementate).toEqual(["stripe"]);
    expect(voceDi("stripe")!.nativa?.href).toBe("/settings/pagamenti");
  });

  it("ogni adattatore ha la sua voce, con la stessa versione", () => {
    for (const slug of slugConAdattatore()) {
      const v = voceDi(slug);
      expect(v, slug).not.toBeNull();
      expect(v!.versioneAdattatore).toBe(adattatoreDi(slug)!.versione);
    }
  });

  it("ogni capacità dichiarata ha il metodo che la fa, e nessun metodo resta senza capacità", () => {
    for (const slug of slugConAdattatore()) {
      const a = adattatoreDi(slug)!;
      const v = voceDi(slug)!;
      for (const c of v.capacita) expect(Object.keys(CAPACITA), c).toContain(c);
      if (!eAdattatorePos(a)) continue;

      for (const c of v.capacita) {
        for (const m of METODI_PER_CAPACITA[c] ?? []) {
          expect(typeof a.pos[m], `${slug}: ${c} dichiarata ma manca ${m}`).toBe("function");
        }
      }
      for (const [c, metodi] of Object.entries(METODI_PER_CAPACITA)) {
        const implementati = (metodi ?? []).filter((m) => typeof a.pos[m] === "function");
        if (implementati.length) {
          expect(v.capacita, `${slug}: implementa ${implementati.join(",")} ma non dichiara ${c}`).toContain(c);
        }
      }
    }
  });

  it("Lightspeed non dichiara ciò che non abbiamo verificato", () => {
    const v = voceDi("lightspeed-k")!;
    for (const c of ["orders.read", "payments.read", "payments.write", "close_order", "customers"]) {
      expect(v.capacita).not.toContain(c);
    }
    // Gli scope del catalogo sono gli stessi che l'adattatore chiede.
    expect(v.autenticazione.scope).toEqual([...SCOPE]);
  });

  it("la matrice delle risorse è coerente con le capacità dichiarate", () => {
    for (const v of CATALOGO.filter((x) => x.risorse?.length)) {
      const usate = new Set(v.risorse!.map((r) => r.usataDa).filter(Boolean));
      // Ogni capacità dichiarata poggia su almeno una risorsa della matrice…
      for (const c of v.capacita) expect(usate, `${v.slug}: ${c} senza risorsa`).toContain(c);
      for (const r of v.risorse!) {
        // …e ogni risorsa usata è una capacità dichiarata.
        if (r.usataDa) expect(v.capacita, `${v.slug}: ${r.risorsa}`).toContain(r.usataDa);
        // Ciò che l'API non offre non è usato, e non ha direzione.
        if (r.verifica === "NON_SUPPORTATA") {
          expect(r.usataDa, r.risorsa).toBeNull();
          expect(r.direzione, r.risorsa).toBe("NESSUNA");
        }
        // Una risorsa che Foodtech scrive deve essere scrivibile nell'API.
        if (r.direzione === "FOODTECH_A_FORNITORE" || r.direzione === "BIDIREZIONALE") {
          expect(r.api.scrittura, r.risorsa).toBe(true);
        }
        if (r.direzione === "FORNITORE_A_FOODTECH") expect(r.api.lettura, r.risorsa).toBe(true);
        // Nessuna voce in anteprima può dichiarare una risorsa «verificata».
        if (v.implementazione !== "IMPLEMENTED") expect(r.verifica, r.risorsa).not.toBe("VERIFICATA");
      }
    }
  });

  it("Cassa in Cloud: anteprima, chiave API, niente di ciò che l'API documentata non offre", () => {
    const v = voceDi("cassa-in-cloud")!;
    expect(v.implementazione).toBe("IN_DEVELOPMENT");
    expect(v.disponibilita).toBe("PREVIEW");
    expect(v.fornitore).toBe("TeamSystem");
    expect(v.autenticazione.modalita).toBe("API_KEY");
    expect(v.requisitiPiattaforma).toEqual([]);
    expect(v.webhook.configurazioneManuale).toBe(true);
    for (const c of ["payments.write", "close_order", "payment_methods", "customers"]) expect(v.capacita).not.toContain(c);
    expect(v.notaInstallazione).toMatch(/piano compatibile con l'accesso API/);
    expect(v.notaInstallazione).not.toMatch(/€|\d+[,.]\d{2}/);
  });

  it("i requisiti della piattaforma si leggono per nome, mai per valore", () => {
    const v = voceDi("lightspeed-k")!;
    expect(requisitiMancanti(v, {} as NodeJS.ProcessEnv)).toEqual([
      "LIGHTSPEED_K_CLIENT_ID",
      "LIGHTSPEED_K_CLIENT_SECRET",
    ]);
    expect(
      requisitiMancanti(v, {
        LIGHTSPEED_K_CLIENT_ID: "x",
        LIGHTSPEED_K_CLIENT_SECRET: "y",
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual([]);
  });
});
