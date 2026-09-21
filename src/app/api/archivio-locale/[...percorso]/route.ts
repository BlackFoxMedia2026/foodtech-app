import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { archivioLocaleAttivo, fileLocale, PREFISSO_LOCALE } from "@/server/archivio-file";

/**
 * Serve i file dell'archivio su disco.
 *
 * Esiste solo quando l'archivio locale è attivo — cioè quando manca
 * `BLOB_READ_WRITE_TOKEN` fuori dalla produzione, o quando chi ospita
 * l'applicazione ha dichiarato `ARCHIVIO_LOCALE=1`. Altrimenti risponde 404
 * come una rotta che non c'è, perché in quel caso non c'è davvero niente da
 * servire.
 *
 * Non chiede la sessione, e la scelta è deliberata: replica quello che fa
 * l'archivio vero, dove `put(..., { access: "public" })` produce un indirizzo
 * che chiunque lo conosca può aprire. Un'anteprima che in sviluppo chiede il
 * login e in produzione no sarebbe una differenza invisibile fra i due
 * ambienti, ed è esattamente il genere di differenza che si scopre tardi. La
 * difesa è la stessa di Blob: il percorso contiene un UUID, e i percorsi si
 * ripuliscono in `percorsoSicuro` prima di toccare il disco.
 */

const TIPI: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export async function GET(_req: Request, { params }: { params: { percorso: string[] } }) {
  if (!archivioLocaleAttivo()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const percorso = fileLocale(PREFISSO_LOCALE + params.percorso.join("/"));
  if (!percorso) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let dati: Buffer;
  try {
    dati = await readFile(percorso);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const estensione = percorso.split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(new Uint8Array(dati), {
    headers: {
      "content-type": TIPI[estensione] ?? "application/octet-stream",
      // `inline` perché questi file si guardano dentro l'applicazione — una
      // piantina in un `<img>`, un PDF in un riquadro — non si scaricano.
      "content-disposition": "inline",
      // Il nome contiene un UUID: un file a quell'indirizzo non cambia mai.
      // In sviluppo teniamo la cache corta lo stesso, perché cancellare la
      // cartella e ricaricare è un gesto che si fa spesso.
      "cache-control": "private, max-age=60",
    },
  });
}
