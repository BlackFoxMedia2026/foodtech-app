import { createPrivateKey, sign } from "node:crypto";
import { componiLicenza, testoDaFirmare, type ContenutoLicenza } from "../../src/lib/licenza-centralino";

/**
 * La coppia di prova con cui si firmano le licenze nei percorsi end-to-end.
 *
 * **Non è un segreto**: è la stessa coppia di riferimento dei test di formato
 * (`tests/licenza-centralino.test.ts` e il gemello in blackfox-voice), non
 * firma niente di vero, e la sua metà pubblica sta in `playwright.config.ts`
 * perché il server la deve avere all'avvio.
 *
 * Sta in chiaro di proposito: una chiave di prova che va letta da una variabile
 * d'ambiente rende la prova impossibile da eseguire a chi la trova.
 */
const PRIVATA = "MC4CAQAwBQYDK2VwBCIEIDki24m9XftbqBvP+mJDYSeSjus9N6YujsGKhEbse/hx";

/** Firma una licenza per un locale, come farebbe miocentralino. */
export function licenzaDiProva(venueId: string, nomeLocale = "Locale di prova"): string {
  const contenuto: ContenutoLicenza = {
    v: 1,
    l: venueId,
    n: nomeLocale,
    d: new Date().toISOString().slice(0, 10),
  };
  const privata = createPrivateKey({
    key: Buffer.from(PRIVATA, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const firma = sign(null, Buffer.from(testoDaFirmare(contenuto), "utf8"), privata).toString(
    "base64url",
  );
  return componiLicenza(contenuto, firma);
}
