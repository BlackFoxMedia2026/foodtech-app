import { normalizeUrl } from "./url-utils";

/**
 * Le superfici pubbliche che un locale ha già, e che vivono di un QR sul
 * tavolo.
 *
 * La pagina dei QR code partiva da un foglio bianco: «Nessun QR code creato»,
 * e poi tocca a te sapere che cosa collegare e a quale indirizzo. Ma il
 * prodotto **sa già** quali pagine pubbliche esistono per quel locale — il
 * menu, la prenotazione, il portale Wi-Fi, il link delle recensioni — e sa
 * anche quali di quelle non sono ancora pronte.
 *
 * Questa funzione è pura di proposito: prende i fatti e restituisce le
 * superfici. Chi li legge dal database sta in `server/qr-codes.ts`.
 *
 * **Una superficie che non è pronta non si nasconde: si dice.** Nascondere il
 * portale Wi-Fi perché non è configurato lascia il ristoratore a chiedersi
 * perché non lo vede; dirgli «manca la configurazione» con il collegamento a
 * dove si fa è l'unica versione utile.
 */

export type StatoSuperficie = "pronta" | "giaCreato" | "manca";

export type Superficie = {
  chiave: "menu" | "prenota" | "wifi" | "recensione";
  nome: string;
  /** Che cosa vede il cliente che inquadra il codice. */
  descrizione: string;
  categoria: "MENU" | "BOOKING" | "REVIEW" | "OTHER";
  url: string;
  stato: StatoSuperficie;
  /** Solo quando `stato === "manca"`: che cosa serve prima. */
  cosaManca?: string;
  /** Solo quando `stato === "manca"`: dove si sistema. */
  dove?: string;
};

export type FattiDelLocale = {
  slug: string;
  /** L'origine su cui il locale è raggiungibile, senza barra finale. */
  origine: string;
  /** Il portale Wi-Fi è stato configurato almeno una volta. */
  wifiPronto: boolean;
  /** Quanti piatti un cliente vedrebbe aprendo la carta adesso. */
  piattiVisibili: number;
  /** Il primo collegamento di recensione attivo, se c'è. `etichetta` vuota
   *  quando la piattaforma non ha un nome da scrivere. */
  linkRecensione: { url: string; etichetta: string } | null;
  /** Le destinazioni dei QR già esistenti. */
  giaCreati: string[];
};

/** Due indirizzi che portano allo stesso posto vanno considerati uguali. */
export function stessaDestinazione(a: string, b: string): boolean {
  const pulisci = (u: string) => {
    try {
      const x = new URL(normalizeUrl(u.trim()));
      const percorso = x.pathname.replace(/\/+$/, "");
      return `${x.host.toLowerCase()}${percorso}${x.search}`;
    } catch {
      return u.trim().toLowerCase().replace(/\/+$/, "");
    }
  };
  return pulisci(a) === pulisci(b);
}

export function superficiPubbliche(f: FattiDelLocale): Superficie[] {
  const base = f.origine.replace(/\/+$/, "");
  const esiste = (url: string) => f.giaCreati.some((g) => stessaDestinazione(g, url));

  const superfici: Superficie[] = [
    {
      chiave: "menu",
      nome: "Il menu al tavolo",
      descrizione: "Chi inquadra legge la carta: solo le categorie attive e i piatti disponibili.",
      categoria: "MENU",
      url: `${base}/m/${f.slug}`,
      stato: f.piattiVisibili > 0 ? "pronta" : "manca",
      ...(f.piattiVisibili > 0
        ? {}
        : { cosaManca: "la carta non ha ancora piatti disponibili", dove: "/menu" }),
    },
    {
      chiave: "prenota",
      nome: "Prenota un tavolo",
      descrizione: "La pagina di prenotazione del locale, con i tuoi orari e i tuoi turni.",
      categoria: "BOOKING",
      url: `${base}/book?venue=${f.slug}`,
      stato: "pronta",
    },
    {
      chiave: "wifi",
      nome: "Il portale Wi-Fi",
      descrizione: "Il cliente si collega lasciando un contatto: da lì nasce il suo profilo.",
      categoria: "OTHER",
      url: `${base}/wifi/${f.slug}`,
      stato: f.wifiPronto ? "pronta" : "manca",
      ...(f.wifiPronto
        ? {}
        : { cosaManca: "il portale non è ancora configurato", dove: "/settings/wifi" }),
    },
    {
      chiave: "recensione",
      nome: f.linkRecensione?.etichetta
        ? `Lascia una recensione su ${f.linkRecensione.etichetta}`
        : "Lascia una recensione",
      descrizione: "Da mettere sullo scontrino o sul tavolo a fine cena, non all'ingresso.",
      categoria: "REVIEW",
      url: f.linkRecensione?.url ?? "",
      stato: f.linkRecensione ? "pronta" : "manca",
      ...(f.linkRecensione
        ? {}
        : { cosaManca: "nessun collegamento di recensione impostato", dove: "/settings?parte=ospiti" }),
    },
  ];

  /* Un QR che esiste già non si propone di nuovo: si dice che c'è. Il
     confronto è sulla destinazione, non sul nome, perché è la destinazione che
     fa il duplicato. */
  return superfici.map((s) =>
    s.stato === "pronta" && esiste(s.url) ? { ...s, stato: "giaCreato" as const } : s,
  );
}
