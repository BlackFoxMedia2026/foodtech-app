import { describe, expect, it } from "vitest";
import {
  ACTIVE_WAITLIST_STATUSES,
  CLOSED_WAITLIST_STATUSES,
  canTransition,
} from "@/server/waitlist";
import type { WaitlistStatus } from "@prisma/client";

/**
 * La macchina a stati della lista d'attesa, fissata per iscritto.
 *
 * Il buco che questi test impediscono di riaprire: la prima versione
 * consentiva qualunque transizione verso lo stesso stato, quindi «accomoda»
 * premuto due volte creava **due prenotazioni** per la stessa persona sullo
 * stesso tavolo. In sala si traduce in un tavolo occupato due volte e in un
 * gruppo mandato via per niente.
 */

const TUTTI: WaitlistStatus[] = [
  "WAITING",
  "NOTIFIED",
  "OFFERED",
  "CONFIRMED",
  "SEATED",
  "CANCELLED",
  "LEFT",
  "EXPIRED",
  "DECLINED",
  "NO_SHOW",
];

describe("percorso normale", () => {
  it("chi aspetta può essere avvisato, poi confermare, poi sedersi", () => {
    expect(canTransition("WAITING", "NOTIFIED")).toBe(true);
    expect(canTransition("NOTIFIED", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "SEATED")).toBe(true);
  });

  it("chi aspetta può sedersi subito, senza passare dall'avviso", () => {
    // Capita continuamente: il tavolo si libera mentre la persona è davanti a te.
    expect(canTransition("WAITING", "SEATED")).toBe(true);
  });

  it("si può uscire dalla lista da qualunque stato attivo", () => {
    for (const stato of ACTIVE_WAITLIST_STATUSES) {
      expect(canTransition(stato, "LEFT")).toBe(true);
      expect(canTransition(stato, "CANCELLED")).toBe(true);
    }
  });
});

describe("gli stati definitivi sono definitivi", () => {
  it("da uno stato chiuso non si esce più", () => {
    for (const chiuso of CLOSED_WAITLIST_STATUSES) {
      for (const destinazione of TUTTI) {
        expect(canTransition(chiuso, destinazione)).toBe(false);
      }
    }
  });

  it("accomodare due volte non è possibile", () => {
    // È il bug che ha motivato questo file.
    expect(canTransition("SEATED", "SEATED")).toBe(false);
  });

  it("chi è già uscito non può essere riaccodato", () => {
    expect(canTransition("LEFT", "WAITING")).toBe(false);
    expect(canTransition("EXPIRED", "NOTIFIED")).toBe(false);
    expect(canTransition("CANCELLED", "SEATED")).toBe(false);
  });
});

describe("le auto-transizioni", () => {
  it("ri-avvisare è ammesso: richiamare qualcuno rinnova la tenuta del tavolo", () => {
    expect(canTransition("NOTIFIED", "NOTIFIED")).toBe(true);
  });

  it("nessun altro stato può ripetersi", () => {
    for (const stato of TUTTI) {
      if (stato === "NOTIFIED") continue;
      expect(canTransition(stato, stato)).toBe(false);
    }
  });
});

describe("transizioni senza senso", () => {
  it("non si conferma chi non è stato avvisato", () => {
    expect(canTransition("WAITING", "CONFIRMED")).toBe(false);
  });

  it("non si segna assente chi non aveva confermato", () => {
    // NO_SHOW ha senso solo dopo una conferma: senza, la persona non aveva
    // preso nessun impegno.
    expect(canTransition("WAITING", "NO_SHOW")).toBe(false);
    expect(canTransition("NOTIFIED", "NO_SHOW")).toBe(false);
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
  });

  it("uno stato inventato non apre nessuna porta", () => {
    expect(canTransition("BOH" as WaitlistStatus, "SEATED")).toBe(false);
    expect(canTransition("WAITING", "BOH" as WaitlistStatus)).toBe(false);
  });
});

describe("attivi e chiusi non si sovrappongono", () => {
  it("nessuno stato è insieme attivo e chiuso", () => {
    for (const attivo of ACTIVE_WAITLIST_STATUSES) {
      expect(CLOSED_WAITLIST_STATUSES).not.toContain(attivo);
    }
  });

  it("ogni stato è o attivo o chiuso, tranne OFFERED che non viene mai scritto", () => {
    const coperti = [...ACTIVE_WAITLIST_STATUSES, ...CLOSED_WAITLIST_STATUSES] as string[];
    const scoperti = TUTTI.filter((s) => !coperti.includes(s));
    expect(scoperti).toEqual(["OFFERED"]);
  });
});
