import { del, put } from "@vercel/blob";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Dove finiscono i file che il ristoratore carica.
 *
 * ## Il difetto che questo file esiste per togliere
 *
 * L'unico archivio era Vercel Blob, e `BLOB_READ_WRITE_TOKEN` in sviluppo è
 * quasi sempre vuoto. Il risultato era una funzione spenta che *si dichiarava*
 * spenta — «l'archivio file non è configurato su questo ambiente» — ma che
 * restava spenta anche per chi stava costruendo proprio quella schermata: la
 * piantina non si poteva caricare, quindi il riconoscimento della planimetria
 * non si poteva provare, quindi la metà più costosa dell'editor di sala si
 * verificava solo a occhio o in produzione.
 *
 * Qui l'archivio diventa **due strade dietro la stessa porta**:
 *
 *  - c'è un token → Vercel Blob, esattamente come prima, senza differenze;
 *  - non c'è → una cartella sul disco (`.archivio-locale/`), servita dalla
 *    rotta `app/api/archivio-locale/[...percorso]`.
 *
 * La scelta è automatica e non si configura: il giorno che incolli un token
 * vero in `.env.local`, il ramo locale smette di essere usato e i file nuovi
 * vanno su Blob. Quelli vecchi restano raggiungibili finché la cartella esiste,
 * perché l'indirizzo salvato sulla sala dice già quale strada prendere.
 *
 * In produzione il ramo locale **non** si accende da solo: un disco di un
 * contenitore effimero è un posto dove i file scompaiono senza che nessuno se
 * ne accorga, e scoprirlo da una piantina sparita è il modo peggiore. Chi ospita
 * l'applicazione su una macchina con un disco vero lo dichiara, con
 * `ARCHIVIO_LOCALE=1`.
 */

/** La cartella dell'archivio su disco. Fuori da `public/` di proposito: non
 * deve finire in una build, e passando da una rotta possiamo decidere noi cosa
 * servire e cosa no. Si ricalcola a ogni chiamata invece di essere una costante
 * del modulo: così dipende dalla cartella di lavoro di adesso, non da quella
 * che c'era quando il modulo è stato caricato la prima volta. */
function radiceLocale(): string {
  return join(process.cwd(), ".archivio-locale");
}

/** Il prefisso degli indirizzi locali. È anche il modo di riconoscerli più
 * tardi: `eliminaFile` e `leggiFile` guardano questo, non una variabile
 * d'ambiente, perché un file salvato ieri in locale resta locale anche se oggi
 * il token c'è. */
export const PREFISSO_LOCALE = "/api/archivio-locale/";

export function archivioRemotoConfigurato(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function archivioLocaleAttivo(): boolean {
  if (archivioRemotoConfigurato()) return false;
  if (process.env.NODE_ENV === "production") return process.env.ARCHIVIO_LOCALE === "1";
  return true;
}

/** La domanda che le rotte fanno prima di accettare un file: si può salvare
 * qualcosa, da qualche parte? */
export function archivioDisponibile(): boolean {
  return archivioRemotoConfigurato() || archivioLocaleAttivo();
}

/**
 * Il nome del file arriva dall'utente, e con lui l'estensione.
 *
 * `"piantina.png"` dà `png`, ma `"piantina.png/../../.env"` darebbe
 * `png/../../.env`: su Blob sarebbe solo un percorso strano, su un disco è una
 * scrittura fuori dalla cartella. Qui i percorsi si ripuliscono una volta
 * sola, per tutte e due le strade.
 */
export function percorsoSicuro(pathname: string): string {
  const pulito = pathname
    .split("/")
    .map((segmento) => segmento.replace(/[^A-Za-z0-9._-]/g, "-"))
    .filter((segmento) => segmento.length > 0 && segmento !== "." && segmento !== "..")
    .join("/");
  if (!pulito) throw new Error("percorso_non_valido");
  return pulito;
}

export function indirizzoLocale(url: string): boolean {
  return url.startsWith(PREFISSO_LOCALE);
}

/** Il percorso su disco di un indirizzo locale, o `null` se quell'indirizzo
 * uscirebbe dalla cartella dell'archivio. */
export function fileLocale(url: string): string | null {
  if (!indirizzoLocale(url)) return null;
  const relativo = url.slice(PREFISSO_LOCALE.length).split("?")[0];
  try {
    return join(radiceLocale(), percorsoSicuro(decodeURIComponent(relativo)));
  } catch {
    return null;
  }
}

/**
 * Salva e restituisce l'indirizzo con cui il file si ritrova.
 *
 * L'indirizzo locale è **relativo**: il browser lo risolve sull'origine da cui
 * sta guardando, quindi funziona anche sul secondo `next dev` su un'altra porta
 * (vedi `NEXT_DIST_DIR` in `next.config.mjs`), dove un indirizzo assoluto
 * costruito da `NEXT_PUBLIC_APP_URL` punterebbe al server sbagliato.
 */
export async function salvaFile(pathname: string, file: Blob): Promise<{ url: string }> {
  const percorso = percorsoSicuro(pathname);

  if (archivioRemotoConfigurato()) {
    return put(percorso, file, { access: "public" });
  }
  if (!archivioLocaleAttivo()) throw new Error("archivio_non_configurato");

  const destinazione = join(radiceLocale(), percorso);
  await mkdir(dirname(destinazione), { recursive: true });
  await writeFile(destinazione, Buffer.from(await file.arrayBuffer()));
  return { url: PREFISSO_LOCALE + percorso };
}

/** Cancella senza far rumore: un file già sparito non è un errore da propagare
 * a chi stava solo sostituendo una piantina. */
export async function eliminaFile(url: string): Promise<void> {
  const locale = fileLocale(url);
  if (locale) {
    await rm(locale, { force: true }).catch(() => {});
    return;
  }
  if (!archivioRemotoConfigurato()) return;
  await del(url).catch(() => {});
}

/**
 * I byte di un file salvato, qualunque strada abbia preso.
 *
 * Serve al riconoscimento della planimetria, che manda l'immagine al modello
 * **come dato e non come indirizzo** (vedi `immagineComeDato` in
 * `server/floorplan-analysis.ts`). Per il ramo locale si legge dal disco invece
 * di fare una richiesta HTTP all'applicazione stessa: una richiesta che il
 * server fa a sé stesso mentre serve un'altra richiesta è un modo semplice di
 * incastrarsi, e comunque non saprebbe su quale porta bussare.
 */
export async function leggiFile(url: string): Promise<ArrayBuffer | null> {
  const locale = fileLocale(url);
  if (locale) {
    try {
      const dati = await readFile(locale);
      return dati.buffer.slice(dati.byteOffset, dati.byteOffset + dati.byteLength) as ArrayBuffer;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}
