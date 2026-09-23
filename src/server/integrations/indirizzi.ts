import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ErroreIntegrazione } from "./errori";

/**
 * **Indirizzi di un fornitore scelti per installazione, senza SSRF.**
 *
 * Lightspeed, Cassa in Cloud e Tilby hanno un host fisso scritto nel codice.
 * Oracle Simphony no: ogni cliente ha i suoi indirizzi (servizi e
 * autenticazione), e li scrive il ristoratore nel percorso di installazione.
 * Un indirizzo scritto a mano è un indirizzo a cui Foodtech manderà le
 * **credenziali** del cliente (per Oracle: la password dell'API account e i
 * token): se fosse libero, basterebbe scrivere
 * `http://169.254.169.254/` o l'host di un malintenzionato.
 *
 * Le regole, tutte obbligatorie:
 *
 * - **solo `https:`**, porta standard o esplicita, niente utente/password
 *   nell'indirizzo, niente query né frammento;
 * - **niente indirizzi IP scritti a mano** e niente `localhost`: si accetta
 *   solo un nome di dominio;
 * - il dominio deve finire con uno dei **suffissi consentiti** dal fornitore
 *   (per Oracle, i domini Oracle; estendibili dall'operatore con una
 *   variabile d'ambiente, mai dal ristoratore);
 * - **al momento della chiamata** il nome si risolve, e se anche uno solo
 *   degli indirizzi è privato, di loopback, link-local, CGNAT o riservato,
 *   la chiamata non parte (protegge dal DNS che cambia dopo il salvataggio);
 * - i redirect non si seguono: li blocca il client HTTP (`redirect: "error"`).
 *
 * L'unica eccezione è un'**origine di prova** esatta, decisa dall'operatore
 * con una variabile d'ambiente del server (per il server finto delle prove
 * nel browser): mai dal modulo di installazione.
 */

export type RegoleIndirizzo = {
  /** Suffissi di dominio ammessi, senza punto iniziale: `oraclecloud.com`. */
  suffissi: string[];
  /** Un'origine esatta ammessa anche se http/localhost (solo prove). */
  originePerProve?: string | null;
};

const NON_VALIDO = (motivo: string) =>
  new ErroreIntegrazione("INVALID_CONFIGURATION", `Indirizzo non ammesso: ${motivo}`);

/** Normalizza e controlla la forma. Restituisce l'indirizzo senza `/` finale. */
export function validaIndirizzo(valore: string, regole: RegoleIndirizzo): string {
  const grezzo = (valore ?? "").trim();
  let u: URL;
  try {
    u = new URL(grezzo);
  } catch {
    throw NON_VALIDO("non è un indirizzo");
  }
  const pulito = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;

  if (regole.originePerProve && u.origin === new URL(regole.originePerProve).origin) {
    if (u.username || u.password || u.search || u.hash) throw NON_VALIDO("parti non ammesse");
    return pulito;
  }

  if (u.protocol !== "https:") throw NON_VALIDO("serve https");
  if (u.username || u.password) throw NON_VALIDO("credenziali nell'indirizzo");
  if (u.search || u.hash) throw NON_VALIDO("query o frammento");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIP(host.replace(/^\[|\]$/g, ""))) throw NON_VALIDO("indirizzo IP");
  if (host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) throw NON_VALIDO("host locale");
  const ammesso = regole.suffissi.some((s) => {
    const suf = s.toLowerCase().replace(/^\./, "");
    return host === suf || host.endsWith(`.${suf}`);
  });
  if (!ammesso) throw NON_VALIDO(`il dominio deve essere fra ${regole.suffissi.join(", ")}`);
  return pulito;
}

/* -------------------------------------------------------------------------- */
/*  Indirizzi IP che non si chiamano mai                                      */
/* -------------------------------------------------------------------------- */

function ipv4Riservato(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, metadati cloud
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function ipRiservato(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Riservato(ip);
  if (v === 6) {
    const x = ip.toLowerCase();
    const mappato = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mappato) return ipv4Riservato(mappato[1]!);
    return (
      x === "::" ||
      x === "::1" ||
      x.startsWith("fc") ||
      x.startsWith("fd") || // ULA
      /^fe[89ab]/.test(x) || // link-local
      x.startsWith("ff") // multicast
    );
  }
  return true;
}

type Risolutore = (host: string) => Promise<string[]>;
const risolutoreVero: Risolutore = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
let risolutore: Risolutore = risolutoreVero;

/** Nelle prove il DNS non si interroga: si decide cosa risponde. */
export function usaRisolutorePerProve(r: Risolutore | undefined) {
  if (process.env.NODE_ENV === "production") throw new Error("solo_nelle_prove");
  risolutore = r ?? risolutoreVero;
}

/**
 * Da chiamare **prima di ogni chiamata** a un indirizzo scelto per
 * installazione: rifà i controlli di forma e risolve il nome.
 */
export async function controllaPrimaDiChiamare(url: string, regole: RegoleIndirizzo): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw NON_VALIDO("non è un indirizzo");
  }
  if (u.username || u.password) throw NON_VALIDO("credenziali nell'indirizzo");
  // La query di una chiamata è normale: le regole di forma valgono per l'origine.
  validaIndirizzo(u.origin, regole);
  if (regole.originePerProve && u.origin === new URL(regole.originePerProve).origin) return;
  let indirizzi: string[];
  try {
    indirizzi = await risolutore(u.hostname);
  } catch {
    throw new ErroreIntegrazione("PROVIDER_UNAVAILABLE", "Il nome del server del fornitore non si risolve");
  }
  if (!indirizzi.length || indirizzi.some(ipRiservato)) throw NON_VALIDO("il nome punta a una rete privata");
}
