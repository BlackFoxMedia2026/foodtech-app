import {
  PAYLOAD_WIFI_VUOTO,
  contenutoQr,
  destinazioneAutomatica,
  linkQr,
  type PayloadQr,
} from "@/lib/qr-contenuto";
import { DESIGN_PREDEFINITO, type DesignQr } from "@/lib/qr-disegno";
import { schedaTipo, type TipoQr } from "@/lib/qr-tipi";

/**
 * Il QR mentre lo si sta facendo.
 *
 * Una sola forma per tutti e cinque i tipi, con i campi che non servono
 * semplicemente non chiesti: l'alternativa — un tipo diverso per ciascuno —
 * costringerebbe l'anteprima, il salvataggio e i pannelli del disegno a sapere
 * quale caso stanno maneggiando, per poi fare la stessa cosa in cinque punti.
 */
export type BozzaQr = {
  nome: string;
  kind: TipoQr;
  /** Solo per il pagamento al tavolo: uno per tavolo scelto. */
  tableIds: string[];
  destinationUrl: string;
  payload: PayloadQr;
  design: DesignQr;
};

/** Quello che l'editor deve sapere del locale per compilare da solo. */
export type ContestoQr = {
  origine: string;
  slug: string;
  nomeLocale: string;
  /** Il logo già caricato nel profilo del locale, se c'è. */
  logoLocale: string | null;
  tavoli: { id: string; label: string; pronto: boolean }[];
  /** Il pagamento al tavolo è acceso sul locale. */
  pagamentiAttivi: boolean;
  /**
   * Chi sta guardando può accendere il pagamento su un tavolo.
   *
   * Decidere che un tavolo incassa denaro non è un gesto di marketing:
   * l'operazione chiede `manage_venue`, mentre i QR chiedono `edit_marketing`.
   * Chi non ce l'ha vede i tavoli spenti e legge **chi** può accenderli,
   * invece di un pulsante che gli risponderebbe di no.
   */
  puoGestireTavoli: boolean;
  /** Il nome della rete già configurato nel portale Wi-Fi, se c'è. */
  ssidLocale: string | null;
};

/**
 * Un QR appena nato: già con un nome, già con una destinazione, già con un
 * invito sulla cornice.
 *
 * Un editor che si apre vuoto scarica su chi lo apre il lavoro di capire cosa
 * scriverci. Qui la prima schermata è già un codice che funziona: si può
 * salvare così com'è, e chi vuole cambiare cambia.
 */
export function bozzaNuova(kind: TipoQr, ctx: ContestoQr): BozzaQr {
  const scheda = schedaTipo(kind);
  return {
    nome: scheda.nomeSuggerito,
    kind,
    tableIds: [],
    destinationUrl: destinazioneAutomatica(kind, ctx.origine, ctx.slug) ?? "",
    payload:
      kind === "WIFI"
        ? { wifi: { ...PAYLOAD_WIFI_VUOTO, ssid: ctx.ssidLocale ?? "" } }
        : kind === "CUSTOM"
          ? { custom: { modo: "url", valore: "" } }
          : {},
    design: { ...DESIGN_PREDEFINITO, testoCornice: scheda.invito },
  };
}

/** Quello che finirà dentro il codice, mentre lo si scrive. */
export function contenutoBozza(b: BozzaQr, ctx: ContestoQr): string {
  if (b.kind === "PAY_TABLE") {
    /* Il segreto del tavolo non passa dal browser: qui basta un indirizzo
       della stessa forma e della stessa lunghezza, perché l'anteprima mostri
       un codice della stessa densità di quello che verrà stampato. */
    return b.tableIds.length > 0 ? `${ctx.origine.replace(/\/+$/, "")}/pay/${"x".repeat(32)}` : "";
  }
  return contenutoQr({ kind: b.kind, destinationUrl: b.destinationUrl, payload: b.payload });
}

/** L'indirizzo da provare con «Testa QR», quando ne esiste uno. */
export function linkBozza(b: BozzaQr): string | null {
  if (b.kind === "PAY_TABLE") return null;
  return linkQr({ kind: b.kind, destinationUrl: b.destinationUrl, payload: b.payload });
}
