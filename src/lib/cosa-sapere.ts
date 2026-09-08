/**
 * «Cosa sapere di questo ospite», in tre righe e senza dossier.
 *
 * Durante un servizio pieno nessuno apre una scheda cliente. I fatti che
 * cambiano il modo di trattare una persona — un'allergia, un compleanno, una
 * nota che un collega ha scritto la settimana scorsa, «è la nona volta che
 * viene» — erano tutti nel prodotto, ognuno in una schermata diversa, e
 * quindi nessuno di loro arrivava al tavolo.
 *
 * Le regole di questa funzione:
 *
 * - **si dicono solo fatti**, e ognuno porta il perché con sé. Nessun
 *   punteggio, nessuna «probabilità di gradimento»: se non sappiamo una cosa
 *   non la inventiamo, e se la sappiamo la diciamo con le parole del fatto;
 * - **l'ordine è quello dell'urgenza**, non quello del database: prima ciò che
 *   può far male (allergie), poi ciò che rende la serata (l'occasione), poi
 *   ciò che qualcuno ha scritto **a mano** per questo momento, poi chi è;
 * - **il tetto è quattro righe.** Il quinto fatto più importante di una
 *   persona non serve a chi porta il pane: serve a chi guarda la scheda, e la
 *   scheda esiste già;
 * - **nessuna riga senza una fonte scritta.** «Ottava visita» esce dal
 *   contatore delle visite, che dal 7 settembre è vero (`refreshGuestStats`);
 *   le abitudini le dice la scheda, e solo con almeno tre visite.
 *
 * Vive in `lib` perché la rendono i componenti dell'interfaccia, che girano
 * nel browser.
 */

export type TonoDaSapere = "attenzione" | "bello" | "neutro";

export type RigaDaSapere = {
  /** Cosa si legge sul tavolo. Corto: si legge in piedi. */
  testo: string;
  tono: TonoDaSapere;
  /** Da dove viene, per il suggerimento: un fatto senza fonte è un'opinione. */
  fonte: string;
};

export const MAX_RIGHE_DA_SAPERE = 4;

/**
 * L'occasione in italiano. Serve anche fuori da qui: la scheda della
 * prenotazione mostrava `BIRTHDAY`, cioè come lo scrive il database.
 */
export function etichettaOccasione(occasion: string | null | undefined): string | null {
  if (!occasion) return null;
  return OCCASIONE[occasion] ?? null;
}

/** Le occasioni dette come le direbbe una persona, non come le scrive il database. */
export const OCCASIONE: Record<string, string> = {
  BIRTHDAY: "Compleanno",
  ANNIVERSARY: "Anniversario",
  BUSINESS: "Cena di lavoro",
  DATE: "Cena romantica",
  CELEBRATION: "Festeggiano",
  OTHER: "Occasione speciale",
};

/**
 * La nota delle preferenze sta dentro un campo JSON con una chiave `note`:
 * la leggevano due file con due copie della stessa funzione.
 */
export function notaPreferenze(preferences: unknown): string | null {
  if (preferences && typeof preferences === "object" && "note" in preferences) {
    const note = (preferences as { note?: unknown }).note;
    if (typeof note === "string" && note.trim()) return note.trim();
  }
  return null;
}

export type FattiOspite = {
  allergies?: string | null;
  /** Note riservate che il personale ha scritto sulla scheda. */
  privateNotes?: string | null;
  preferences?: unknown;
  /** Visite effettive: prenotazioni completate o sedute. */
  visits?: number | null;
  noShows?: number | null;
  loyaltyTier?: string | null;
  /** L'occasione di **questa** prenotazione. */
  occasion?: string | null;
};

/** Taglia una nota lunga senza spezzare una parola a metà. */
function corta(testo: string, max = 90): string {
  const pulito = testo.replace(/\s+/g, " ").trim();
  if (pulito.length <= max) return pulito;
  const taglio = pulito.slice(0, max);
  const spazio = taglio.lastIndexOf(" ");
  return `${(spazio > 40 ? taglio.slice(0, spazio) : taglio).trimEnd()}…`;
}

export function cosaSapere(fatti: FattiOspite): RigaDaSapere[] {
  const righe: RigaDaSapere[] = [];

  // 1. Ciò che può far male. Sempre prima, e mai tagliato dal tetto.
  if (fatti.allergies?.trim()) {
    righe.push({
      testo: corta(fatti.allergies),
      tono: "attenzione",
      fonte: "Allergie e intolleranze dalla scheda dell'ospite.",
    });
  }

  // 2. Ciò che rende la serata: si apparecchia diversamente.
  if (fatti.occasion && OCCASIONE[fatti.occasion]) {
    righe.push({
      testo: OCCASIONE[fatti.occasion],
      tono: "bello",
      fonte: "Occasione dichiarata su questa prenotazione.",
    });
  }

  // 3. Ciò che una persona ha scritto a mano, per questo momento.
  if (fatti.privateNotes?.trim()) {
    righe.push({
      testo: corta(fatti.privateNotes),
      tono: "neutro",
      fonte: "Nota riservata scritta dal personale sulla scheda.",
    });
  }

  const preferenze = notaPreferenze(fatti.preferences);
  if (preferenze) {
    righe.push({
      testo: corta(preferenze),
      tono: "neutro",
      fonte: "Preferenze scritte sulla scheda dell'ospite.",
    });
  }

  // 4. Chi è. Una riga sola, quella che dice più cosa.
  const visite = fatti.visits ?? 0;
  const vip = fatti.loyaltyTier === "VIP" || fatti.loyaltyTier === "AMBASSADOR";
  if (vip) {
    righe.push({
      testo: visite > 0 ? `Cliente affezionato · ${visite}ª visita` : "Cliente affezionato",
      tono: "bello",
      fonte: "Livello fedeltà sulla scheda, e visite contate sulle prenotazioni.",
    });
  } else if (visite === 0) {
    righe.push({
      testo: "Prima volta qui",
      tono: "neutro",
      fonte: "Nessuna visita registrata prima di questa.",
    });
  } else if (visite >= 5) {
    righe.push({
      testo: `${visite}ª visita`,
      tono: "bello",
      fonte: "Visite contate sulle prenotazioni completate o sedute.",
    });
  }

  // 5. L'avviso, per ultimo e senza giudizio: è un fatto, non un'etichetta
  // sulla persona. Si dice a chi accoglie, non si mostra al cliente.
  const assenze = fatti.noShows ?? 0;
  if (assenze > 0) {
    righe.push({
      testo:
        assenze === 1 ? "Una volta non si è presentato" : `${assenze} volte non si è presentato`,
      tono: "attenzione",
      fonte: "Prenotazioni segnate come assenza sulla sua scheda.",
    });
  }

  return tagliaTenendoGliAvvisi(righe);
}

/**
 * Il tetto, con una regola: **gli avvisi non si tagliano**.
 *
 * La prima versione tagliava in fondo, e su un ospite con allergia,
 * anniversario, nota del personale e preferenze scritte scompariva «una volta
 * non si è presentato» — cioè il fatto che cambia se quel tavolo lo si tiene
 * o lo si libera. Un tetto che butta via l'avviso e tiene la preferenza è un
 * tetto che decide male.
 *
 * Gli avvisi restano tutti; gli altri riempiono i posti che avanzano, nel
 * loro ordine di importanza. E l'ordine finale è quello di partenza, perché
 * l'allergia si legge prima di tutto.
 */
function tagliaTenendoGliAvvisi(righe: RigaDaSapere[]): RigaDaSapere[] {
  if (righe.length <= MAX_RIGHE_DA_SAPERE) return righe;

  const tenute = new Set<number>();
  righe.forEach((r, i) => {
    if (r.tono === "attenzione") tenute.add(i);
  });
  for (let i = 0; i < righe.length && tenute.size < MAX_RIGHE_DA_SAPERE; i++) {
    tenute.add(i);
  }

  return righe.filter((_, i) => tenute.has(i));
}
