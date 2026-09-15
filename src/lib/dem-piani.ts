/**
 * I piani DEM di partenza.
 *
 * Non sono la verità: la verità sta in `DemPlan`, perché i prezzi si cambiano
 * senza pubblicare una versione dell'applicazione. Questo elenco serve a due
 * cose sole — riempire la tabella la prima volta su un'installazione nuova, e
 * dire al codice quale slug è il piano compreso, che è l'unico su cui esiste
 * una regola (non si compra, non si disdice, e vale finché non se ne compra
 * un altro).
 *
 * Il punto di §1: nessun componente conosce «€19,90» o «20.000». Chi deve
 * mostrare un piano lo legge dal database.
 */

/** Lo slug del piano compreso nell'abbonamento Foodtech. */
export const PIANO_INCLUSO = "incluso";

export type PianoIniziale = {
  slug: string;
  name: string;
  monthlyEmails: number;
  priceCents: number;
  sortOrder: number;
  description: string;
  badge?: string;
};

export const PIANI_INIZIALI: PianoIniziale[] = [
  {
    slug: PIANO_INCLUSO,
    name: "Incluso",
    monthlyEmails: 500,
    priceCents: 0,
    sortOrder: 0,
    description: "Compreso nel tuo abbonamento Foodtech, senza costi aggiuntivi.",
  },
  {
    slug: "start",
    name: "Start",
    monthlyEmails: 20_000,
    priceCents: 1990,
    sortOrder: 1,
    description: "Per chi scrive ai propri clienti ogni mese.",
  },
  {
    slug: "business",
    name: "Business",
    monthlyEmails: 100_000,
    priceCents: 4990,
    sortOrder: 2,
    description: "Per chi ha una lista cresciuta e campagne regolari.",
    badge: "Più scelto",
  },
  {
    slug: "pro",
    name: "Pro",
    monthlyEmails: 300_000,
    priceCents: 9900,
    sortOrder: 3,
    description: "Per più locali e invii frequenti.",
  },
  {
    slug: "premium",
    name: "Premium",
    monthlyEmails: 1_000_000,
    priceCents: 24900,
    sortOrder: 4,
    description: "Per gruppi con liste molto grandi.",
  },
];

const FORMATO_NUMERO = new Intl.NumberFormat("it-IT");
const FORMATO_EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

/** «100.000» — i numeri di questo modulo si leggono a colpo d'occhio o non servono. */
export function invii(n: number): string {
  return FORMATO_NUMERO.format(n);
}

/** «€19,90», e «Incluso» quando non si paga niente in più. */
export function prezzoPiano(priceCents: number): string {
  if (priceCents <= 0) return "Incluso";
  return FORMATO_EURO.format(priceCents / 100);
}
