import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * I campi che nessuno legge devono **dirlo**.
 *
 * ## Perché questo test esiste
 *
 * Perché il difetto più frequente trovato negli audit di questo prodotto non è
 * il codice sbagliato: è la **colonna che sembra una funzione**. Un campo nello
 * schema, con il suo nome parlante e il suo valore per difetto, che nessuna
 * riga di codice legge. Chi apre lo schema crede che ci sia una funzione; chi
 * la cerca ci perde mezz'ora; e chi decide di «collegarla» cambia in silenzio
 * il comportamento di ogni locale — perché quel valore per difetto non l'ha
 * scelto nessuno.
 *
 * `VoiceConfiguration` ne aveva quattordici su ventotto.
 *
 * ## Cosa pretende, e cosa non pretende
 *
 * Non pretende che tutto sia implementato: alcune cose dipendono da un
 * fornitore di SMS, da spazio dove tenere l'audio, da una telefonata vera per
 * provarle. Pretende che siano **dichiarate**: un campo che nessuno legge deve
 * portare scritto nello schema `NON LETTO` o `SUPERATO`, con il perché.
 *
 * Così il giorno in cui qualcuno aggiunge una colonna e non la collega, questo
 * test diventa rosso mentre sta ancora scrivendo — non fra sei mesi, in un
 * audit, come «funzione che non funziona».
 */

/** I modelli su cui questa regola vale, e perché proprio questi. */
const MODELLI = [
  /* Il telefono è il posto dove è successo: la configurazione della voce è
     nata come una schermata intera, e la schermata non è mai arrivata. */
  "VoiceConfiguration",
];

/** Campi che non sono impostazioni e non si leggono per forza dal codice. */
const TECNICI = new Set(["id", "venueId", "createdAt", "updatedAt", "venue"]);

function campiDi(modello: string): { nome: string; commento: string }[] {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const inizio = schema.indexOf(`model ${modello} {`);
  expect(inizio, `modello ${modello} non trovato`).toBeGreaterThan(-1);
  const blocco = schema.slice(inizio, schema.indexOf("\n}", inizio));

  const campi: { nome: string; commento: string }[] = [];
  let commento = "";
  for (const riga of blocco.split("\n").slice(1)) {
    const t = riga.trim();
    if (t.startsWith("///")) {
      commento += ` ${t.slice(3).trim()}`;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("@@") || t === "") continue;
    const m = /^([a-zA-Z][A-Za-z0-9_]*)\s+\S/.exec(t);
    if (m && !TECNICI.has(m[1]!)) campi.push({ nome: m[1]!, commento });
    commento = "";
  }
  return campi;
}

/**
 * Se il nome del campo compare da qualche parte dentro `src/`.
 *
 * Volutamente **grossolano**: cerca il nome e basta. Un test più preciso
 * («viene letto in una `select`») sarebbe più fedele e molto più fragile, e
 * qui serve rispondere a una domanda sola — questo campo esiste solo nello
 * schema?
 */
function nominatoNelCodice(nome: string): boolean {
  try {
    execFileSync("grep", ["-rqE", `\\b${nome}\\b`, "--include=*.ts", "--include=*.tsx", "src"]);
    return true;
  } catch {
    return false;
  }
}

const DICHIARAZIONI = /NON LETT|NON IMPLEMENTAT|SUPERAT/i;

describe("un campo che nessuno legge lo dice nello schema", () => {
  for (const modello of MODELLI) {
    it(`${modello}: ogni campo o è usato, o porta scritto che non lo è`, () => {
      const muti = campiDi(modello)
        .filter((c) => !nominatoNelCodice(c.nome))
        .filter((c) => !DICHIARAZIONI.test(c.commento))
        .map((c) => c.nome);

      expect(
        muti,
        `Questi campi di ${modello} non li legge nessuno e non lo dichiarano. ` +
          "Collegali, oppure scrivi nel commento dello schema NON LETTO / SUPERATO " +
          "con il motivo (vedi docs/TABELLE-SENZA-CODICE.md).",
      ).toEqual([]);
    });
  }

  it("la regola può diventare rossa: un campo inventato senza dichiarazione", () => {
    /* La prova che il controllo controlla: un nome che non esiste in `src/` e
       un commento che non dichiara niente devono contare come difetto. */
    expect(nominatoNelCodice("campoCheNonEsisteDaNessunaParte")).toBe(false);
    expect(DICHIARAZIONI.test(" Il testo, con i segnaposti.")).toBe(false);
  });

  it("riconosce le dichiarazioni che usiamo davvero", () => {
    expect(DICHIARAZIONI.test(" **NON LETTO** (21 set 2026): manca il canale.")).toBe(true);
    expect(DICHIARAZIONI.test(" **SUPERATO** (21 set 2026): lo fa il centralino.")).toBe(true);
  });
});
