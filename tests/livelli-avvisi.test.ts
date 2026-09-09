import { describe, expect, it } from "vitest";
import { livelloAvviso } from "@/lib/livello-avviso";

/**
 * I quattro livelli degli avvisi del servizio.
 *
 * Non sono un campo nuovo: si **derivano** da `urgenza` (fra quanti minuti
 * questo avviso conta) e da `severity`. Il motivo di questi test è che la
 * derivazione decide **quanto grande** si mostra un avviso — per esteso o in
 * una riga — quindi sbagliarla non produce un ordine strano: produce una
 * schermata dove la cosa da fare adesso è la più piccola.
 */
describe("il livello di un avviso", () => {
  it("urgenza zero è «adesso», sia per un problema sia per un'occasione", () => {
    expect(livelloAvviso({ severity: "warning", urgenza: 0 })).toBe("adesso");
    // Questa è la riga che conta: un tavolo libero con una famiglia in piedi
    // non è grave, ma è l'unica cosa che si risolve solo adesso.
    expect(livelloAvviso({ severity: "opportunity", urgenza: 0 })).toBe("adesso");
  });

  it("entro un quarto d'ora è «fra poco»: diventerà «adesso» da solo", () => {
    expect(livelloAvviso({ severity: "warning", urgenza: 1 })).toBe("fra_poco");
    expect(livelloAvviso({ severity: "warning", urgenza: 15 })).toBe("fra_poco");
    expect(livelloAvviso({ severity: "opportunity", urgenza: 10 })).toBe("fra_poco");
  });

  it("oltre il quarto d'ora si guarda con calma", () => {
    expect(livelloAvviso({ severity: "warning", urgenza: 16 })).toBe("guarda");
    expect(livelloAvviso({ severity: "warning", urgenza: 40 })).toBe("guarda");
    // 10_000 è il modo con cui una regola dice «non urgente»: lavoro di
    // chiusura, nessuno sta più arrivando.
    expect(livelloAvviso({ severity: "opportunity", urgenza: 10_000 })).toBe("guarda");
  });

  it("una regola può dire il livello, quando il tempo direbbe la cosa sbagliata", () => {
    // Il caso vero: un ritardo conta adesso (urgenza zero) ma non è una
    // decisione da prendere, è una telefonata da fare. Senza questo, quattro
    // ritardi diventano quattro cartelli grandi e la decisione che c'è
    // davvero in quella schermata non si vede più.
    expect(livelloAvviso({ severity: "warning", urgenza: 0, livello: "guarda" })).toBe("guarda");
    // E vale anche al contrario: la regola vince sempre sulla derivazione.
    expect(livelloAvviso({ severity: "info", urgenza: 999, livello: "adesso" })).toBe("adesso");
  });

  it("un'informazione resta un'informazione, anche a urgenza zero", () => {
    // `info` non chiede niente a nessuno: non può prendersi lo spazio di una
    // decisione da prendere adesso, per quanto sia fresca.
    expect(livelloAvviso({ severity: "info", urgenza: 0 })).toBe("sapere");
    expect(livelloAvviso({ severity: "info", urgenza: 5 })).toBe("sapere");
    expect(livelloAvviso({ severity: "info", urgenza: 600 })).toBe("sapere");
  });
});
