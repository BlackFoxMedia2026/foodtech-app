import type { Capacita } from "../tipi";

/**
 * **Che cosa si certifica, e a quale livello.** Funzioni pure.
 *
 * Una integrazione non ha un solo stato di verifica: ogni **capacità** ne ha
 * uno per **livello**. «Tilby crea ordini» può essere provato contro l'API
 * vera mentre «Tilby stampa in cucina» non lo è ancora, e nessuna delle due
 * cose dice qualcosa sullo scontrino italiano.
 *
 * I livelli, in ordine:
 *
 * - `FIXTURE` — provato con risposte costruite sulla documentazione;
 * - `PROVIDER_API` — provato contro l'API vera del fornitore (sandbox o
 *   account reale): la risposta è arrivata ed era quella attesa;
 * - `REAL_POS` — una persona ha guardato il POS vero e ha confermato
 *   l'effetto (la comanda stampata, il conto aggiornato). **Mai** da solo
 *   perché l'API ha risposto 200;
 * - `REAL_POS_ITALY` — come sopra, su un POS italiano con RT, per ciò che
 *   tocca la fiscalità.
 *
 * Nessuno stato qui dentro è scritto a mano: la matrice si calcola dalle
 * evidenze registrate (`IntegrationCertificationEvidence`).
 */

export const LIVELLI = ["FIXTURE", "PROVIDER_API", "REAL_POS", "REAL_POS_ITALY"] as const;
export type Livello = (typeof LIVELLI)[number];

export const ESITI = ["PASSED", "FAILED", "INCONCLUSIVE"] as const;
export type Esito = (typeof ESITI)[number];

export const ETICHETTA_LIVELLO: Record<Livello, string> = {
  FIXTURE: "Fixture",
  PROVIDER_API: "API",
  REAL_POS: "POS",
  REAL_POS_ITALY: "POS IT",
};

export type CapacitaCertificabile = {
  chiave: string;
  etichetta: string;
  /** Le capacità della piattaforma a cui corrisponde (compatibilità con `tipi.ts`). */
  capacitaPiattaforma: Capacita[];
  livelli: Livello[];
  /** Serve a mandare comande dalla sala: entra nello stato di certificazione. */
  essenziale: boolean;
  /** POTREBBE chiudere un conto, emettere uno scontrino, fiscalizzare. */
  effettoFiscalePossibile: boolean;
  /** Si verifica solo guardando un dispositivo (stampante, KDS). */
  richiedeHardware: boolean;
  /** Il metodo dell'adattatore senza cui la capacità non esiste per quel fornitore. */
  richiedeMetodo?: string;
};

export const CAPACITA_CERTIFICABILI: CapacitaCertificabile[] = [
  { chiave: "connection", etichetta: "Connessione e autenticazione", capacitaPiattaforma: [], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: false },
  { chiave: "locations", etichetta: "Sedi", capacitaPiattaforma: ["locations"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: false, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getLocations" },
  { chiave: "floors", etichetta: "Sale", capacitaPiattaforma: ["tables"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: false, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getFloors" },
  { chiave: "tables", etichetta: "Tavoli", capacitaPiattaforma: ["tables"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getTables" },
  { chiave: "menu", etichetta: "Menu e prodotti", capacitaPiattaforma: ["menu"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getMenu" },
  { chiave: "tax_rates", etichetta: "Aliquote IVA", capacitaPiattaforma: ["tax_rates"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: false, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getTaxRates" },
  { chiave: "payment_methods", etichetta: "Metodi di pagamento", capacitaPiattaforma: ["payment_methods"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: false, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getPaymentMethods" },
  { chiave: "create_order", etichetta: "Crea ordine", capacitaPiattaforma: ["orders.write"], livelli: ["FIXTURE", "PROVIDER_API", "REAL_POS"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "createOrder" },
  { chiave: "table_association", etichetta: "Ordine sul tavolo giusto", capacitaPiattaforma: ["orders.write"], livelli: ["FIXTURE", "PROVIDER_API", "REAL_POS"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "createOrder" },
  { chiave: "add_round", etichetta: "Seconda comanda (round o ordine nuovo)", capacitaPiattaforma: ["orders.write"], livelli: ["FIXTURE", "PROVIDER_API", "REAL_POS"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "createOrder" },
  { chiave: "kitchen", etichetta: "Cucina (stampa o KDS)", capacitaPiattaforma: ["orders.write"], livelli: ["FIXTURE", "PROVIDER_API", "REAL_POS"], essenziale: true, effettoFiscalePossibile: false, richiedeHardware: true, richiedeMetodo: "createOrder" },
  { chiave: "read_bill", etichetta: "Leggi conto", capacitaPiattaforma: ["orders.read"], livelli: ["FIXTURE", "PROVIDER_API"], essenziale: false, effettoFiscalePossibile: false, richiedeHardware: false, richiedeMetodo: "getOrder" },
  { chiave: "payment", etichetta: "Pagamento", capacitaPiattaforma: ["payments.write"], livelli: ["FIXTURE", "PROVIDER_API", "REAL_POS", "REAL_POS_ITALY"], essenziale: false, effettoFiscalePossibile: true, richiedeHardware: false, richiedeMetodo: "createPayment" },
  { chiave: "close_bill", etichetta: "Chiusura conto", capacitaPiattaforma: [], livelli: ["REAL_POS", "REAL_POS_ITALY"], essenziale: false, effettoFiscalePossibile: true, richiedeHardware: true },
  { chiave: "fiscal_document", etichetta: "Documento fiscale", capacitaPiattaforma: [], livelli: ["REAL_POS_ITALY"], essenziale: false, effettoFiscalePossibile: true, richiedeHardware: true },
];

export function capacitaCertificabile(chiave: string): CapacitaCertificabile | null {
  return CAPACITA_CERTIFICABILI.find((c) => c.chiave === chiave) ?? null;
}

/** Le capacità che esistono per un fornitore: quelle il cui metodo l'adattatore ha. */
export function capacitaDelFornitore(metodi: Set<string>): CapacitaCertificabile[] {
  return CAPACITA_CERTIFICABILI.filter((c) => !c.richiedeMetodo || metodi.has(c.richiedeMetodo));
}

/* -------------------------------------------------------------------------- */
/*  Dalle evidenze alla matrice                                               */
/* -------------------------------------------------------------------------- */

export type EvidenzaMinima = { capability: string; level: string; result: string; createdAt: Date };

export type Cella = { esito: Esito | null; il: Date | null; applicabile: boolean };
export type RigaMatrice = { capacita: CapacitaCertificabile; celle: Record<Livello, Cella> };

/**
 * Una cella è l'esito dell'evidenza **più recente** per quella capacità e
 * quel livello: una prova ripetuta sostituisce la precedente nella matrice,
 * senza cancellarla (le evidenze sono immutabili). Nessuna cella si deduce
 * da un'altra: un `REAL_POS` superato non riempie la casella `PROVIDER_API`.
 */
export function matrice(capacita: CapacitaCertificabile[], evidenze: EvidenzaMinima[]): RigaMatrice[] {
  const ultima = new Map<string, EvidenzaMinima>();
  for (const e of evidenze) {
    const k = `${e.capability}|${e.level}`;
    const prima = ultima.get(k);
    if (!prima || prima.createdAt.getTime() <= e.createdAt.getTime()) ultima.set(k, e);
  }
  return capacita.map((c) => ({
    capacita: c,
    celle: Object.fromEntries(
      LIVELLI.map((l) => {
        const e = ultima.get(`${c.chiave}|${l}`);
        return [l, { esito: (e?.result as Esito | undefined) ?? null, il: e?.createdAt ?? null, applicabile: c.livelli.includes(l) }];
      }),
    ) as Record<Livello, Cella>,
  }));
}

/** Superata al livello indicato (l'evidenza più recente è PASSED). */
export function superata(righe: RigaMatrice[], capacita: string, livello: Livello): boolean {
  return righe.find((r) => r.capacita.chiave === capacita)?.celle[livello].esito === "PASSED";
}

/* -------------------------------------------------------------------------- */
/*  Stato di certificazione (separato dallo stato di implementazione)         */
/* -------------------------------------------------------------------------- */

export const STATI_CERTIFICAZIONE = ["PREVIEW", "API_VERIFIED", "POS_VERIFIED", "POS_IT_VERIFIED"] as const;
export type StatoCertificazione = (typeof STATI_CERTIFICAZIONE)[number];

export const ETICHETTA_CERTIFICAZIONE: Record<StatoCertificazione, string> = {
  PREVIEW: "Anteprima",
  API_VERIFIED: "API verificata",
  POS_VERIFIED: "POS verificato",
  POS_IT_VERIFIED: "POS italiano verificato",
};

/**
 * - `API_VERIFIED`: ogni capacità essenziale che ha il livello API è
 *   superata a quel livello;
 * - `POS_VERIFIED`: ogni capacità essenziale che ha il livello POS è
 *   superata su un POS vero (crea ordine, tavolo, seconda comanda, cucina);
 * - `POS_IT_VERIFIED`: in più, documento fiscale superato su un POS italiano.
 */
export function statoCertificazione(righe: RigaMatrice[]): StatoCertificazione {
  const essenziali = righe.filter((r) => r.capacita.essenziale);
  const tutte = (l: Livello) => essenziali.filter((r) => r.capacita.livelli.includes(l)).every((r) => r.celle[l].esito === "PASSED");
  if (!essenziali.length || !tutte("PROVIDER_API")) return "PREVIEW";
  if (!tutte("REAL_POS")) return "API_VERIFIED";
  const fiscale = righe.find((r) => r.capacita.chiave === "fiscal_document");
  return fiscale?.celle.REAL_POS_ITALY.esito === "PASSED" ? "POS_IT_VERIFIED" : "POS_VERIFIED";
}

/** Le quattro condizioni perché «Invia comanda» possa, un giorno, parlare con questa cassa. */
export const PER_INVIA_COMANDA = ["create_order", "table_association", "add_round", "kitchen"] as const;

export function prontoPerInviaComanda(righe: RigaMatrice[]): { pronto: boolean; mancano: string[] } {
  const mancano = PER_INVIA_COMANDA.filter((c) => !superata(righe, c, "REAL_POS"));
  return { pronto: mancano.length === 0, mancano: [...mancano] };
}

/* -------------------------------------------------------------------------- */
/*  Rilascio                                                                  */
/* -------------------------------------------------------------------------- */

export const FASI_RILASCIO = ["INTERNAL", "PRIVATE_BETA", "PUBLIC_BETA", "GENERAL_AVAILABILITY"] as const;
export type FaseRilascio = (typeof FASI_RILASCIO)[number];

export const ETICHETTA_RILASCIO: Record<FaseRilascio, string> = {
  INTERNAL: "Interna",
  PRIVATE_BETA: "Beta privata",
  PUBLIC_BETA: "Beta pubblica",
  GENERAL_AVAILABILITY: "Disponibile a tutti",
};

/** Chi può installare: nelle prime due fasi solo i locali con accesso beta. */
export function richiedeAccessoBeta(fase: FaseRilascio): boolean {
  return fase === "INTERNAL" || fase === "PRIVATE_BETA";
}

/**
 * Ciò che vede il cliente cambia solo con le prove: la beta pubblica chiede le
 * capacità essenziali verificate contro l'API, la disponibilità generale un
 * POS vero. Restringere si può sempre.
 */
export function faseAmmessa(fase: FaseRilascio, stato: StatoCertificazione): { ok: true } | { ok: false; motivo: string } {
  const rango = STATI_CERTIFICAZIONE.indexOf(stato);
  if (fase === "PUBLIC_BETA" && rango < STATI_CERTIFICAZIONE.indexOf("API_VERIFIED")) {
    return { ok: false, motivo: "La beta pubblica richiede le capacità essenziali verificate contro l'API del fornitore." };
  }
  if (fase === "GENERAL_AVAILABILITY" && rango < STATI_CERTIFICAZIONE.indexOf("POS_VERIFIED")) {
    return { ok: false, motivo: "La disponibilità generale richiede le capacità essenziali verificate su un POS vero." };
  }
  return { ok: true };
}
