"use client";

/**
 * Il logo del QR: prima si vede, poi si conserva.
 *
 * ## Il difetto che questo file esiste per togliere
 *
 * Il logo si sceglieva mandando subito il file al server e aspettando
 * l'indirizzo di ritorno per poterlo mostrare. Due conseguenze, e nessuna
 * delle due si vedeva dal codice:
 *
 *  1. **l'anteprima aspettava la rete.** In un editor in cui ogni altra cosa —
 *     colore, forma dei moduli, cornice — cambia il codice mentre si muove il
 *     dito, il logo era l'unica che faceva aspettare;
 *  2. **senza lo spazio immagini configurato, non si vedeva affatto.**
 *     `BLOB_READ_WRITE_TOKEN` è documentato come facoltativo (`.env.example`),
 *     e il prodotto è scritto perché una funzione spenta lo dica invece di
 *     rompersi. Qui invece la scelta del file falliva, e il ristoratore
 *     leggeva l'errore che il browser dà a una richiesta che non arriva.
 *
 * Adesso l'ordine è rovesciato: il file si legge **nel browser**, diventa un
 * `data:` e finisce nel disegno all'istante — nessuna richiesta, quindi
 * nessuna richiesta che possa fallire. Al server si va una volta sola, quando
 * si preme «Salva QR», che è anche l'unico momento in cui serve davvero un
 * indirizzo duraturo: fino ad allora il logo vive nell'anteprima e nei file
 * che si scaricano, che si compongono tutti nel browser.
 *
 * Il `data:` non viene mai salvato: `DesignInput` accetta 2000 caratteri per
 * `logoUrl` proprio perché lì dentro deve starci un indirizzo, non
 * un'immagine.
 */

/** Quello che un lettore di QR e i tre renderer sanno maneggiare. */
export const LOGO_TIPI = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

/** Per il campo `accept` del selettore di file. */
export const LOGO_ACCEPT = LOGO_TIPI.join(",");

/**
 * Un megabyte, e non i cinque che accetta il server.
 *
 * Il file qui non viaggia: sta nello stato dell'editor come testo base64, e
 * da lì viene riscritto dentro l'SVG dell'anteprima a ogni ritocco di colore.
 * Cinque megabyte diventano quasi sette di testo da ricomporre mentre si
 * trascina un cursore — cioè un editor che si impunta.
 *
 * Non è una limitazione vera: il marchio di un locale a 512 px pesa qualche
 * decina di kilobyte, e oltre il megabyte c'è quasi sempre una fotografia
 * messa lì per sbaglio.
 */
export const LOGO_MASSIMO = 1024 * 1024;

const NOMI_TIPI = "PNG, JPG, WEBP o SVG";

/** Perché questo file non va bene, detto a chi l'ha scelto. `null` se va bene. */
export function problemaLogo(file: File): string | null {
  if (!LOGO_TIPI.includes(file.type as (typeof LOGO_TIPI)[number])) {
    return `Questo formato non va: serve un ${NOMI_TIPI}.`;
  }
  if (file.size > LOGO_MASSIMO) {
    return `L'immagine pesa ${Math.round(file.size / 1024 / 102.4) / 10} MB: il massimo è 1 MB. Di solito basta esportarla più piccola.`;
  }
  return null;
}

/**
 * Il file come `data:`, cioè come qualcosa che si può disegnare subito.
 *
 * `URL.createObjectURL` darebbe una stringa più corta, ma un `blob:` non
 * sopravvive al viaggio: l'SVG che si scarica lo porterebbe con sé come
 * riferimento morto, e un SVG caricato **come immagine** — la strada per fare
 * il PNG — non ha il permesso di andare a prendere niente fuori da sé. Il
 * `data:` è già quello che `lib/qr-export.ts` si procura comunque prima di
 * ogni download: prenderlo qui significa averlo già pronto.
 */
export function fileInDataUrl(file: File): Promise<string> {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onload = () => risolvi(String(lettore.result));
    lettore.onerror = () => rifiuta(new Error("lettura_fallita"));
    lettore.readAsDataURL(file);
  });
}

/** Il logo è ancora solo nel browser, e va portato da qualche parte. */
export function logoDaConservare(url: string | null | undefined): url is string {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Il logo messo al sicuro, e l'indirizzo con cui ritrovarlo.
 *
 * Passa dall'unico caricamento che esiste per i QR
 * (`api/qr-codes/upload-logo`): non ne serve un secondo, e averne due
 * significherebbe due posti in cui ricordarsi i permessi.
 */
export async function conservaLogo(dataUrl: string): Promise<string> {
  const file = await (await fetch(dataUrl)).blob();
  const corpo = new FormData();
  corpo.append("file", file, `logo.${estensione(file.type)}`);

  let res: Response;
  try {
    res = await fetch("/api/qr-codes/upload-logo", { method: "POST", body: corpo });
  } catch {
    /* La richiesta non è nemmeno partita: rete assente, o il server che non
       risponde. È l'unico caso in cui il browser dice «Failed to fetch», ed è
       esattamente la frase che non deve arrivare a chi legge. */
    throw new Error("Non siamo riusciti a caricare il logo: controlla la connessione e riprova.");
  }

  const dati = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !dati.url) {
    throw new Error(dati.message ?? "Non siamo riusciti a caricare il logo. Riprova.");
  }
  return dati.url;
}

function estensione(tipo: string): string {
  if (tipo === "image/jpeg") return "jpg";
  if (tipo === "image/svg+xml") return "svg";
  if (tipo === "image/webp") return "webp";
  return "png";
}
