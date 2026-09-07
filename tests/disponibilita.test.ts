import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * Le regole di disponibilità hanno già una batteria di 45 controlli, scritta
 * prima che il progetto avesse un test runner: `scripts/check-availability-rules.ts`.
 *
 * Non la riscrivo — funziona e copre casi che sarebbe uno spreco duplicare.
 * La collego qui perché `npm test` resti l'unico comando da ricordare: se
 * quelle regole si rompono, se ne accorge chi lancia i test, non solo chi si
 * ricorda dello script.
 */

describe("regole di disponibilità (scripts/check-availability-rules.ts)", () => {
  it("le 45 verifiche passano", () => {
    const out = execFileSync("npx", ["tsx", "scripts/check-availability-rules.ts"], {
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(out).toMatch(/verifiche superate/);
    expect(out).not.toMatch(/fallit/i);
  }, 120_000);
});
