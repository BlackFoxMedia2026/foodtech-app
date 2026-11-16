import { normalizeUrl } from "./url-utils";
import type { TipoQr } from "./qr-tipi";

/**
 * Che cosa c'è **dentro** il codice.
 *
 * Quattro tipi su cinque portano un indirizzo, e quello si salva in
 * `destinationUrl` come sempre. Il Wi-Fi no: uno standard che esiste da prima
 * di noi dice che il telefono si collega leggendo una riga fatta così —
 * `WIFI:T:WPA;S:rete;P:segreto;;` — e quella riga non è un URL, non si apre in
 * un browser e non si copia negli appunti come un link.
 *
 * Per questo il contenuto si **deriva** invece di essere un campo: il
 * ristoratore scrive il nome della rete e la password, e la sintassi la scrive
 * il prodotto. È anche l'unico modo per non mostrargli mai una stringa che
 * comincia per `WIFI:T:`.
 */

export type Sicurezza = "WPA" | "WPA3" | "NONE";

export type PayloadWifi = {
  ssid: string;
  password: string;
  sicurezza: Sicurezza;
  nascosta: boolean;
};

export type PayloadCustom = {
  modo: "url" | "testo";
  valore: string;
};

export type PayloadQr = {
  wifi?: PayloadWifi;
  custom?: PayloadCustom;
};

export const PAYLOAD_WIFI_VUOTO: PayloadWifi = {
  ssid: "",
  password: "",
  sicurezza: "WPA",
  nascosta: false,
};

/**
 * I caratteri che nello standard hanno un significato, e vanno protetti.
 *
 * Una password che contiene un punto e virgola — e ce ne sono — chiuderebbe il
 * campo a metà: il telefono leggerebbe metà password e direbbe che la rete non
 * risponde, senza che nessuno capisca perché.
 */
function proteggi(v: string): string {
  return v.replace(/([\\;,:"])/g, "\\$1");
}

/**
 * Il tipo di sicurezza come lo capiscono i telefoni.
 *
 * `WPA` copre WPA e WPA2, ed è il valore che leggono tutti. WPA3 usa `SAE`,
 * che è il nome del suo metodo di autenticazione: i telefoni che non lo
 * conoscono tornano a chiedere la password a mano invece di collegarsi da
 * soli — una scomodità, non un codice rotto.
 */
function tipoSicurezza(s: Sicurezza): string {
  return s === "NONE" ? "nopass" : s === "WPA3" ? "SAE" : "WPA";
}

export function stringaWifi(w: PayloadWifi): string {
  const parti = [`T:${tipoSicurezza(w.sicurezza)}`, `S:${proteggi(w.ssid)}`];
  if (w.sicurezza !== "NONE") parti.push(`P:${proteggi(w.password)}`);
  if (w.nascosta) parti.push("H:true");
  return `WIFI:${parti.join(";")};;`;
}

/**
 * Il contrario di `stringaWifi`: la riga letta da un QR, di nuovo in campi.
 *
 * Serve a chi ha già il QR della rete — quello stampato dal router, o quello
 * che il telefono mostra in «Condividi rete» — e non ricorda la password.
 * L'ordine dei campi non è fisso (Android scrive `S:` prima di `T:`), e il
 * backslash protegge i caratteri speciali come in scrittura. Restituisce
 * `null` se il QR non è di una rete Wi-Fi.
 */
export function leggiStringaWifi(testo: string): PayloadWifi | null {
  const t = testo.trim();
  if (!/^WIFI:/i.test(t)) return null;

  const campi = new Map<string, string>();
  let chiave = "";
  let valore = "";
  let inValore = false;
  for (let i = 5; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && i + 1 < t.length) {
      if (inValore) valore += t[++i];
      else chiave += t[++i];
    } else if (!inValore && ch === ":") {
      inValore = true;
    } else if (ch === ";") {
      if (chiave) campi.set(chiave.toUpperCase(), valore);
      chiave = "";
      valore = "";
      inValore = false;
    } else if (inValore) {
      valore += ch;
    } else {
      chiave += ch;
    }
  }
  if (chiave && inValore) campi.set(chiave.toUpperCase(), valore);

  const ssid = campi.get("S") ?? "";
  if (!ssid) return null;
  const tipo = (campi.get("T") ?? "").toUpperCase();
  const sicurezza: Sicurezza = tipo === "NOPASS" ? "NONE" : tipo === "SAE" || tipo === "WPA3" ? "WPA3" : "WPA";
  const password = sicurezza === "NONE" ? "" : (campi.get("P") ?? "");
  return { ssid, password, sicurezza: !tipo && !password ? "NONE" : sicurezza, nascosta: /^true$/i.test(campi.get("H") ?? "") };
}

export type FontiContenuto = {
  kind: TipoQr;
  destinationUrl: string | null;
  payload: PayloadQr | null;
};

/** La riga che finisce dentro il codice. Vuota quando manca ancora qualcosa. */
export function contenutoQr(f: FontiContenuto): string {
  if (f.kind === "WIFI") {
    const w = f.payload?.wifi;
    if (!w || !w.ssid.trim()) return "";
    return stringaWifi(w);
  }
  if (f.kind === "CUSTOM" && f.payload?.custom?.modo === "testo") {
    return f.payload.custom.valore.trim();
  }
  return (f.destinationUrl ?? "").trim();
}

/**
 * L'indirizzo da aprire, copiare e provare — oppure `null`.
 *
 * Una rete Wi-Fi non ha un indirizzo, e un testo libero nemmeno: lì «Copia
 * link» e «Testa QR» non si mostrano, invece di mostrarsi e non funzionare.
 */
export function linkQr(f: FontiContenuto): string | null {
  if (f.kind === "WIFI") return null;
  if (f.kind === "CUSTOM" && f.payload?.custom?.modo === "testo") return null;
  const url = (f.destinationUrl ?? "").trim();
  return url ? url : null;
}

/** Gli indirizzi che il prodotto conosce già, per il locale che si sta usando. */
export function destinazioneAutomatica(kind: TipoQr, origine: string, slug: string): string | null {
  const base = origine.replace(/\/+$/, "");
  /* `?da=qr` serve a una domanda che il ristoratore fa davvero: «la gente
     inquadra il codice sul tavolo, o apre il link che ho messo su Instagram?».
     Senza questo segno le due letture sono indistinguibili. I codici già
     stampati continuano a funzionare: contano come «link», ed è la verità
     disponibile su di loro. */
  if (kind === "MENU") return `${base}/m/${slug}?da=qr`;
  if (kind === "BOOKING") return `${base}/book?venue=${slug}`;
  return null;
}

/** Come il ristoratore chiama quella destinazione, quando gliela mostriamo. */
export function nomeDestinazione(kind: TipoQr): string {
  switch (kind) {
    case "MENU":
      return "Menù del locale";
    case "BOOKING":
      return "Pagina prenotazione";
    case "PAY_TABLE":
      return "Conto del tavolo";
    case "WIFI":
      return "Rete del locale";
    default:
      return "Destinazione";
  }
}

/** Normalizza quello che ha scritto una persona: «iltuolocale.it» è un URL. */
export function urlScritto(v: string): string {
  const pulito = v.trim();
  return pulito ? normalizeUrl(pulito) : "";
}
