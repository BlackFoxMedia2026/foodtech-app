import type { SegmentFilterType } from "@/server/campaigns";

/**
 * Il pubblico si sceglie in due tempi: prima **da chi si parte**, poi **chi si
 * toglie**. Queste sono le chiavi del primo tempo — il passo «Segmento» — e
 * tutte le altre appartengono al secondo, il passo «Filtri».
 *
 * I due insiemi non si calpestano: scegliere un altro gruppo di partenza non
 * azzera i filtri già impostati, e impostare un filtro non fa saltare il
 * gruppo. Prima erano la stessa schermata e il preset riscriveva il segmento
 * intero, quindi ogni ripensamento sul gruppo cancellava in silenzio il
 * lavoro fatto sotto.
 *
 * `loyaltyTier` sta di qua **e** compare fra i filtri: è la stessa colonna
 * vista da due distanze (il gruppo «VIP» e la casella «Livello fedeltà»).
 * Restano una cosa sola, quindi cambiare la casella sposta anche il gruppo —
 * il riepilogo dice sempre lo stato vero, non l'ultimo pulsante premuto.
 */
export const CHIAVI_SEGMENTO = ["audienceTag", "loyaltyTier", "birthdayThisMonth"] as const;

/** Le chiavi del passo «Filtri»: tutto ciò che affina un gruppo già scelto. */
export const CHIAVI_FILTRO = [
  "tags",
  "minTotalVisits",
  "inactiveDays",
  "minNoShowCount",
  "hasFutureBooking",
  "noFutureBooking",
  "hadCancelledBooking",
] as const;

export type IconaSegmento =
  | "Users"
  | "Repeat"
  | "TrendingDown"
  | "MoonStar"
  | "UserPlus"
  | "Crown"
  | "Cake"
  | "SlidersHorizontal";

export interface SegmentoPreset {
  id: string;
  label: string;
  /** Una riga sola: cosa vuol dire davvero questo gruppo, non come si chiama. */
  descrizione: string;
  icon: IconaSegmento;
  /** Solo valori di CHIAVI_SEGMENTO: il resto del segmento non viene toccato. */
  valori: Pick<SegmentFilterType, "audienceTag" | "loyaltyTier" | "birthdayThisMonth">;
}

/**
 * I gruppi pronti, con le stesse soglie della scheda ospite.
 *
 * Sono le etichette calcolate (`AUDIENCE_TAGS`): un cliente etichettato «a
 * rischio» sulla sua scheda finisce nel gruppo «a rischio». Non ci sono
 * gruppi basati su assegnazioni manuali travestite da comportamento — «venuti
 * una volta» conta le visite, non il livello che qualcuno ha dimenticato di
 * aggiornare.
 *
 * Il consenso marketing non è un gruppo: è applicato sempre e comunque, a
 * qualsiasi scelta si faccia qui.
 */
export const SEGMENTI: SegmentoPreset[] = [
  {
    id: "tutti",
    label: "Tutti i clienti",
    descrizione: "L'intera rubrica del locale, senza restrizioni.",
    icon: "Users",
    valori: {},
  },
  {
    id: "abituali",
    label: "Clienti abituali",
    descrizione: "Vengono spesso e sono passati di recente.",
    icon: "Repeat",
    valori: { audienceTag: "abituali" },
  },
  {
    id: "a_rischio",
    label: "Clienti a rischio",
    descrizione: "Erano abituali e hanno smesso di farsi vedere.",
    icon: "TrendingDown",
    valori: { audienceTag: "a_rischio" },
  },
  {
    id: "inattivi",
    label: "Clienti inattivi",
    descrizione: "Sono venuti, ma non da parecchio tempo.",
    icon: "MoonStar",
    valori: { audienceTag: "inattivi" },
  },
  {
    id: "prima_volta",
    label: "Venuti una volta",
    descrizione: "Una sola visita e nessun ritorno.",
    icon: "UserPlus",
    valori: { audienceTag: "prima_volta" },
  },
  {
    id: "vip",
    label: "Clienti VIP",
    descrizione: "Il livello fedeltà che assegni tu ai più affezionati.",
    icon: "Crown",
    valori: { loyaltyTier: "VIP" },
  },
  {
    id: "compleanno",
    label: "Compleanno questo mese",
    descrizione: "Chi compie gli anni nel mese in corso.",
    icon: "Cake",
    valori: { birthdayThisMonth: true },
  },
  {
    id: "personalizzato",
    label: "Segmento personalizzato",
    descrizione: "Nessun gruppo di partenza: il pubblico lo compongono i filtri.",
    icon: "SlidersHorizontal",
    valori: {},
  },
];

export function segmentoById(id: string | null): SegmentoPreset | null {
  return SEGMENTI.find((s) => s.id === id) ?? null;
}

function chiaveImpostata(segment: SegmentFilterType, chiave: string): boolean {
  const valore = segment[chiave as keyof SegmentFilterType];
  if (valore === undefined || valore === null || valore === false) return false;
  if (Array.isArray(valore)) return valore.length > 0;
  return true;
}

/** Quanti filtri del passo «Filtri» sono davvero in uso. */
export function contaFiltri(segment: SegmentFilterType): number {
  return CHIAVI_FILTRO.filter((k) => chiaveImpostata(segment, k)).length;
}

/**
 * Quale card risulta scelta, letta **dallo stato dei filtri** e non da un
 * «ultimo cliccato»: se dopo aver scelto «Clienti VIP» si cambia il livello
 * fedeltà nel passo dopo, la card VIP si spegne da sola. È corretto — quel
 * pubblico non è più quello.
 */
export function segmentoAttivo(segment: SegmentFilterType): string {
  const senzaGruppo = CHIAVI_SEGMENTO.every((k) => !chiaveImpostata(segment, k));
  if (senzaGruppo && contaFiltri(segment) === 0) return "tutti";
  for (const preset of SEGMENTI) {
    if (preset.id === "tutti" || preset.id === "personalizzato") continue;
    const combacia = CHIAVI_SEGMENTO.every(
      (k) => (segment[k] ?? null) === (preset.valori[k] ?? null),
    );
    if (combacia) return preset.id;
  }
  return "personalizzato";
}

/**
 * Applica un gruppo lasciando in piedi i filtri: si riscrivono solo le chiavi
 * che il gruppo possiede, le altre restano dove l'utente le ha messe.
 */
export function applicaSegmento(segment: SegmentFilterType, preset: SegmentoPreset): SegmentFilterType {
  const pulito: SegmentFilterType = { ...segment };
  for (const k of CHIAVI_SEGMENTO) delete pulito[k];
  return { ...pulito, ...preset.valori };
}

export interface FiltroAttivo {
  id: string;
  label: string;
  valore: string;
}

const LIVELLI_FEDELTA: Record<string, string> = {
  NEW: "Nuovo",
  REGULAR: "Regolare",
  VIP: "VIP",
  AMBASSADOR: "Ambassador",
};

/**
 * I filtri in uso, già scritti in italiano per il riepilogo.
 *
 * `presetId` serve a non dire due volte la stessa cosa: se il gruppo di
 * partenza è «Clienti VIP», il livello fedeltà è già il gruppo — elencarlo
 * anche fra i filtri farebbe sembrare applicata una restrizione in più.
 */
export function filtriAttivi(segment: SegmentFilterType, presetId: string | null = null): FiltroAttivo[] {
  const voci: FiltroAttivo[] = [];
  if (segment.tags?.length) voci.push({ id: "tags", label: "Tag", valore: segment.tags.join(", ") });
  if (segment.loyaltyTier && presetId !== "vip") {
    voci.push({
      id: "loyaltyTier",
      label: "Livello fedeltà",
      valore: LIVELLI_FEDELTA[segment.loyaltyTier] ?? segment.loyaltyTier,
    });
  }
  if (segment.minTotalVisits !== undefined) {
    voci.push({ id: "minTotalVisits", label: "Visite minime", valore: String(segment.minTotalVisits) });
  }
  if (segment.inactiveDays !== undefined) {
    voci.push({ id: "inactiveDays", label: "Inattivo da almeno", valore: `${segment.inactiveDays} giorni` });
  }
  if (segment.minNoShowCount !== undefined) {
    voci.push({ id: "minNoShowCount", label: "No-show minimi", valore: String(segment.minNoShowCount) });
  }
  if (segment.hasFutureBooking) {
    voci.push({ id: "futureBooking", label: "Prenotazione futura", valore: "Sì" });
  }
  if (segment.noFutureBooking) {
    voci.push({ id: "futureBooking", label: "Prenotazione futura", valore: "No" });
  }
  if (segment.hadCancelledBooking) {
    voci.push({ id: "hadCancelledBooking", label: "Ha annullato in passato", valore: "Sì" });
  }
  return voci;
}
