/**
 * Il ponte tra il gestionale e l'app Foodtech (cartella `mobile/`).
 *
 * L'app carica queste stesse pagine dal server e Capacitor ci aggiunge
 * `window.Capacitor`, con i plugin nativi già registrati. Il sito quindi non
 * dipende da nessun pacchetto Capacitor: chiede al ponte se c'è, e se c'è lo
 * usa. Nel browser normale tutte le funzioni qui sotto dicono «non disponibile»
 * e i pulsanti che ne dipendono non compaiono.
 */

type Ascolto = { remove: () => Promise<void> };

type PluginWifi = {
  checkPermissions(): Promise<{ location: string }>;
  requestPermissions(): Promise<{ location: string }>;
  startScan(): Promise<void>;
  getAvailableNetworks(): Promise<{ networks: { ssid: string; rssi: number }[] }>;
  getSsid(): Promise<{ ssid: string }>;
  addListener(evento: "networksScanned", fn: () => void): Promise<Ascolto> | Ascolto;
};

type Ponte = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (nome: string) => boolean;
  Plugins?: { CapacitorWifi?: PluginWifi };
};

function ponte(): Ponte | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: Ponte }).Capacitor;
  return c?.isNativePlatform?.() ? c : null;
}

/** Siamo dentro l'app Foodtech, e non in un browser. */
export function inApp(): boolean {
  return ponte() !== null;
}

export function piattaforma(): "android" | "ios" | "web" {
  const p = ponte()?.getPlatform?.();
  return p === "android" || p === "ios" ? p : "web";
}

function pluginWifi(): PluginWifi | null {
  const c = ponte();
  if (!c?.isPluginAvailable?.("CapacitorWifi")) return null;
  return c.Plugins?.CapacitorWifi ?? null;
}

/** Si possono leggere le reti intorno (solo Android: iOS non lo permette a nessuna app). */
export function scansioneRetiDisponibile(): boolean {
  return pluginWifi() !== null;
}

export type ReteVicina = { ssid: string; segnale: number };

async function permessoPosizione(w: PluginWifi): Promise<void> {
  // Android e iOS legano il nome delle reti alla posizione: senza il permesso
  // la scansione torna vuota in silenzio, ed è peggio di un errore chiaro.
  let stato = (await w.checkPermissions()).location;
  if (stato !== "granted") stato = (await w.requestPermissions()).location;
  if (stato !== "granted") {
    throw new Error("Per vedere le reti serve il permesso di posizione: concedilo all'app Foodtech nelle impostazioni.");
  }
}

/**
 * Le reti che il telefono vede adesso, dalla più forte, senza doppioni.
 *
 * Su Android si fa una scansione vera; su iOS, dove l'elenco non è accessibile,
 * torna soltanto la rete a cui il telefono è collegato.
 */
export async function retiVicineDalTelefono(): Promise<ReteVicina[]> {
  const w = pluginWifi();
  if (!w) throw new Error("La scansione delle reti funziona solo nell'app Foodtech.");
  await permessoPosizione(w);

  if (piattaforma() === "ios") {
    const { ssid } = await w.getSsid();
    return ssid ? [{ ssid, segnale: 0 }] : [];
  }

  // Android limita le scansioni (quattro ogni due minuti): se il sistema la
  // rifiuta, l'ultimo elenco che ha in memoria è comunque buono.
  await new Promise<void>((fatto) => {
    let ascolto: Ascolto | null = null;
    const fine = () => {
      clearTimeout(scadenza);
      void ascolto?.remove();
      fatto();
    };
    const scadenza = setTimeout(fine, 8000);
    // Dal ponte grezzo `addListener` restituisce l'ascolto e non una promessa
    // (lo vela solo `registerPlugin` di @capacitor/core): vanno bene entrambi.
    Promise.resolve()
      .then(() => w.addListener("networksScanned", fine))
      .then((a) => {
        ascolto = a;
        return w.startScan();
      })
      .catch(fine);
  });

  const { networks } = await w.getAvailableNetworks();
  const migliori = new Map<string, number>();
  for (const n of networks) {
    const nome = n.ssid?.trim();
    if (!nome) continue; // le reti nascoste non hanno nome da proporre
    migliori.set(nome, Math.max(migliori.get(nome) ?? -999, n.rssi));
  }
  return [...migliori].map(([ssid, segnale]) => ({ ssid, segnale })).sort((a, b) => b.segnale - a.segnale);
}
