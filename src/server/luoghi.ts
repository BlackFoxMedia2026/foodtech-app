import { siglaProvincia } from "@/lib/province-sigle";

/**
 * Suggerimenti di comuni e indirizzi mentre si scrive, per la scheda della
 * persona: «To» → Torino (TO); «Via Roma 12, Tor…» → via, civico, CAP,
 * comune e provincia già compilati.
 *
 * Usa **Photon** (photon.komoot.io), il geocoder su dati OpenStreetMap pensato
 * per il completamento: niente chiavi, come in Note Spese. È un'istanza
 * pubblica di comunità — va bene per i volumi di una scheda del personale, non
 * per migliaia di richieste al minuto; se servirà, si cambia solo questo file.
 *
 * Il testo digitato esce verso Photon: è un nome di città o una via, non un
 * nome di persona, e il modulo non manda altro.
 */

const PHOTON = "https://photon.komoot.io/api";
const TIMEOUT_MS = 6000;

export type Luogo = {
  /** Come si mostra nell'elenco: «Torino (TO)», «Via Roma 12, 10121 Torino (TO)». */
  etichetta: string;
  via: string;
  comune: string;
  provincia: string;
  cap: string;
  /** Solo fuori dall'Italia: «Spagna». */
  stato?: string;
};

type Proprieta = {
  type?: string;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
};

function sigla(p: Proprieta): string {
  if (p.countrycode !== "IT") return "";
  // La Valle d'Aosta è una provincia sola e OSM non la scrive: c'è solo la regione.
  return siglaProvincia(p.county ?? (p.state?.startsWith("Valle d") ? "Aosta" : undefined));
}

function nomeStato(p: Proprieta): string {
  const s = p.countrycode?.toUpperCase();
  if (!s) return p.country ?? "";
  try {
    return new Intl.DisplayNames("it", { type: "region" }).of(s) ?? p.country ?? s;
  } catch {
    return p.country ?? s;
  }
}

function aLuogo(p: Proprieta, soloComuni: boolean): Luogo | null {
  const estero = !!p.countrycode && p.countrycode !== "IT";
  const prov = estero ? "EE" : sigla(p);
  const comune = (p.type === "city" ? p.name : p.city) ?? p.district ?? p.name ?? "";
  if (!comune) return null;
  const stato = estero ? nomeStato(p) : undefined;
  const comuneLeggibile = estero ? `${comune}, ${stato}` : prov ? `${comune} (${prov})` : comune;

  if (soloComuni) {
    return { etichetta: comuneLeggibile, via: "", comune, provincia: prov, cap: p.postcode ?? "", stato };
  }
  const nomeVia = p.street ?? (p.type === "street" ? p.name : undefined);
  if (!nomeVia) return null;
  const via = [nomeVia, p.housenumber].filter(Boolean).join(" ");
  const etichetta = [via, [p.postcode, comuneLeggibile].filter(Boolean).join(" ")].join(", ");
  return { etichetta, via, comune, provincia: prov, cap: p.postcode ?? "", stato };
}

async function chiama(url: string): Promise<Proprieta[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Tavolo (scheda del personale)" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: { properties?: Proprieta }[] };
    return (json.features ?? []).map((f) => f.properties ?? {});
  } catch {
    // Servizio lento o irraggiungibile: niente suggerimenti, il campo resta
    // scrivibile a mano.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Il riquadro dell'Italia (con San Marino e il Vaticano dentro). */
const ITALIA = "&bbox=6.6,35.4,18.6,47.1";
/** Una spinta leggera verso il centro Italia, per le ricerche fuori dal riquadro. */
const SPINTA = "&lat=42.5&lon=12.5&zoom=6&location_bias_scale=0.1";

export async function cercaLuoghi(testo: string, soloComuni: boolean): Promise<Luogo[]> {
  const q = testo.trim();
  // Per un comune bastano due lettere («To» → Torino); per una via ne servono
  // di più, o Photon risponde con mezza Europa.
  if (q.length < (soloComuni ? 2 : 4)) return [];
  const base = `${PHOTON}?q=${encodeURIComponent(q)}`;

  let proprieta: Proprieta[];
  if (soloComuni) {
    // Prima i comuni italiani, poi — in coda — quelli esteri: chi è nato a
    // Tolosa deve poterlo scrivere, ma «To» è Torino, non Toronto.
    const [italia, mondo] = await Promise.all([
      chiama(`${base}&limit=6&layer=city${ITALIA}`),
      chiama(`${base}&limit=6&layer=city${SPINTA}`),
    ]);
    proprieta = [...italia.filter((p) => p.countrycode === "IT"), ...mondo.filter((p) => p.countrycode !== "IT")];
  } else {
    proprieta = await chiama(`${base}&limit=8&layer=house&layer=street${SPINTA}`);
  }

  const visti = new Set<string>();
  const out: Luogo[] = [];
  for (const p of proprieta) {
    const l = aLuogo(p, soloComuni);
    if (!l || visti.has(l.etichetta)) continue;
    visti.add(l.etichetta);
    out.push(l);
  }
  return out.slice(0, 6);
}
