import { describe, expect, it } from "vitest";
import { CAMPAIGN_OBJECTIVES } from "@/lib/campaign-objectives";
import { segmentoAttivo } from "@/lib/campaign-segments";

/**
 * Scelto un obiettivo, il pannello «Chi la riceve» mostra il gruppo che
 * l'obiettivo propone. Se il segmento suggerito non coincide con nessun
 * gruppo, il pannello dice «Segmento personalizzato» a chi non ha
 * personalizzato niente — è successo con «Recupera clienti inattivi».
 */
describe("obiettivi della campagna", () => {
  it.each(CAMPAIGN_OBJECTIVES.filter((o) => o.id !== "custom").map((o) => [o.label, o] as const))(
    "«%s» propone un gruppo riconoscibile",
    (_label, obiettivo) => {
      expect(segmentoAttivo(obiettivo.suggestedSegment)).not.toBe("personalizzato");
    },
  );

  it("«Recupera clienti inattivi» propone i Clienti inattivi", () => {
    const o = CAMPAIGN_OBJECTIVES.find((x) => x.id === "win_back")!;
    expect(segmentoAttivo(o.suggestedSegment)).toBe("inattivi");
  });
});
