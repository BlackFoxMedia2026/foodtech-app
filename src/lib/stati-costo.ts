import type { StatoCosto } from "./costi-infrastruttura";

/**
 * Gli stati economici di un cliente, che possono coesistere.
 *
 * Un badge solo perderebbe informazione, ed è il punto di §4 della richiesta:
 * «NORMALE» accanto a «PREVISIONE SUPERAMENTO» non è una contraddizione, è la
 * situazione di Aurora Bistrot — al 40% del budget oggi, diretto a superarlo
 * fra dodici giorni. Ridurre i due a uno significa scegliere fra dire che va
 * tutto bene e dire che va tutto male, quando la verità è che va bene **adesso**.
 *
 * Qui non si fa aritmetica economica: i numeri arrivano già calcolati dal
 * server (`ricalcolaPeriodo`). Questo modulo li traduce in etichette, decide
 * l'ordine in cui i clienti vanno guardati, e nient'altro.
 */

export type EtichettaStato =
  | "NORMALE"
  | "ATTENZIONE"
  | "CRITICO"
  | "LIMITE"
  | "BLOCCATO"
  | "PREVISIONE_SUPERAMENTO"
  | "OVERRIDE_ATTIVO"
  | "NON_CALCOLABILE";

export const TESTO_STATO: Record<EtichettaStato, string> = {
  NORMALE: "Regolare",
  ATTENZIONE: "Attenzione",
  CRITICO: "Critico",
  LIMITE: "Limite raggiunto",
  BLOCCATO: "Bloccato",
  PREVISIONE_SUPERAMENTO: "Previsione superamento",
  OVERRIDE_ATTIVO: "Override attivo",
  NON_CALCOLABILE: "Configurazione incompleta",
};

/** I toni del prodotto, non una tavolozza nuova: `Badge` li conosce già. */
export const TONO_STATO: Record<EtichettaStato, "neutral" | "info" | "gold" | "warning" | "success-soft" | "danger"> = {
  NORMALE: "success-soft",
  ATTENZIONE: "gold",
  CRITICO: "warning",
  LIMITE: "danger",
  BLOCCATO: "danger",
  PREVISIONE_SUPERAMENTO: "gold",
  OVERRIDE_ATTIVO: "info",
  NON_CALCOLABILE: "warning",
};

export type DatiStato = {
  stato: StatoCosto;
  /** Gli invii sono fermi: sospensione, o limite raggiunto senza sconfinamento. */
  inviiFermi: boolean;
  previsioneOltreBudget: boolean;
  previsioneAttendibile: boolean;
  overrideAttivo: boolean;
  /** Falso quando manca il listino o il cambio: il costo non si sa calcolare. */
  calcolabile: boolean;
};

/**
 * Le etichette da mostrare, nell'ordine in cui si leggono.
 *
 * Prima quella che descrive la situazione economica di oggi, poi quelle che
 * aggiungono un fatto: una previsione, un'autorizzazione, una configurazione
 * incompleta. Il blocco viene prima di tutto perché è l'unico stato in cui il
 * cliente **non sta lavorando**, ed è la cosa che chi apre la pagina deve
 * vedere per prima.
 */
export function etichetteDi(dati: DatiStato): EtichettaStato[] {
  const fuori: EtichettaStato[] = [];

  if (dati.inviiFermi) fuori.push("BLOCCATO");
  else fuori.push(dati.stato as EtichettaStato);

  /* La previsione si annuncia solo finché ha senso: su un cliente che ha già
     superato il budget, «potrebbe superarlo» è rumore che copre il fatto. */
  if (dati.previsioneOltreBudget && dati.previsioneAttendibile && dati.stato !== "LIMITE") {
    fuori.push("PREVISIONE_SUPERAMENTO");
  }
  if (dati.overrideAttivo) fuori.push("OVERRIDE_ATTIVO");
  if (!dati.calcolabile) fuori.push("NON_CALCOLABILE");

  return fuori;
}

/**
 * Quanto urgentemente questo cliente va guardato: più alto, più in alto.
 *
 * L'ordine è quello di §5 della richiesta, e non è arbitrario: sono i clienti
 * su cui si può ancora fare qualcosa, dal più compromesso al meno. Chi è
 * bloccato sta perdendo campagne adesso; chi ha una previsione di sforamento
 * ha ancora dieci giorni per essere chiamato.
 */
export function priorita(dati: DatiStato): number {
  if (dati.inviiFermi) return 60;
  if (dati.stato === "LIMITE") return 50;
  if (dati.stato === "CRITICO") return 40;
  if (dati.previsioneOltreBudget && dati.previsioneAttendibile) return 30;
  if (dati.stato === "ATTENZIONE") return 20;
  /* La configurazione incompleta sta sopra il «regolare» ma sotto tutto il
     resto: non è un cliente in difficoltà, è un cliente di cui non sappiamo
     niente — e non saperlo è peggio che saperlo tranquillo. */
  if (!dati.calcolabile) return 10;
  return 0;
}

export type FiltroCosti =
  | "tutti"
  | "normali"
  | "attenzione"
  | "critici"
  | "bloccati"
  | "previsione"
  | "override";

/** Il filtro della barra in alto, applicato a una riga già calcolata. */
export function passaIlFiltro(dati: DatiStato, filtro: FiltroCosti): boolean {
  switch (filtro) {
    case "tutti":
      return true;
    case "normali":
      return !dati.inviiFermi && dati.stato === "NORMALE" && !dati.previsioneOltreBudget;
    case "attenzione":
      return !dati.inviiFermi && dati.stato === "ATTENZIONE";
    case "critici":
      return !dati.inviiFermi && (dati.stato === "CRITICO" || dati.stato === "LIMITE");
    case "bloccati":
      return dati.inviiFermi;
    case "previsione":
      return dati.previsioneOltreBudget && dati.previsioneAttendibile;
    case "override":
      return dati.overrideAttivo;
  }
}
