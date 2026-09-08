export type IntentMatch = { kind: "internal"; intent: string; params: Record<string, string> } | { kind: "external" };

type Rule = {
  intent: string;
  test: (message: string) => Record<string, string> | null;
};

const DIACRITICS = /[̀-ͯ]/g;

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(DIACRITICS, "");
}

const SECTION_ROUTES = [
  "panoramica",
  "prenotazioni",
  "sala",
  "camerieri",
  "ospiti",
  "esperienze",
  "marketing",
  "pagamenti",
  "analytics",
];

// Deterministic, keyword-based matching — deliberately NOT an LLM call.
// Classifying every message via an LLM would consume the external quota (or
// at least latency/cost) just to route messages that are perfectly
// answerable from internal data, which defeats the "internal first" design.
// This covers the intent set from the v1 scope; anything that doesn't match
// falls through to the ChatGPT fallback.
const rules: Rule[] = [
  /* ---------------------------------------------------------------------- */
  /*  Le cinque domande operative (§56)                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Stanno **prima** delle regole generiche che seguono? No: stanno qui, dopo
   * quelle sui numeri di oggi e prima della navigazione, e l'ordine conta.
   *
   * «quanti coperti» deve continuare a rispondere coi coperti; ma «chi
   * rischia di non presentarsi» contiene la parola «prenotazione» in molte
   * formulazioni, e senza una regola sua finirebbe sull'elenco di oggi — una
   * risposta plausibile alla domanda sbagliata, che è il modo peggiore di
   * sbagliare.
   *
   * Le espressioni coprono come lo dice una persona, non una tassonomia: «chi
   * mi salta», «chi non si presenta», «rischio no show».
   */
  {
    intent: "chi_rischia_assenza",
    test: (m) =>
      /(no.?show|assenz)/.test(m) ||
      (/(chi|quali)/.test(m) && /(non si presenta|non viene|salta|manca)/.test(m)) ||
      (/rischi/.test(m) && /(presenta|venir|arriv)/.test(m))
        ? {}
        : null,
  },
  {
    intent: "tavoli_lunghi",
    test: (m) =>
      /tavol/.test(m) &&
      (/(lungh|lento|lenti|oltre|in ritardo|sfor|tardan)/.test(m) ||
        /(non si liber|stanno andando lung|ci mettono)/.test(m))
        ? {}
        : null,
  },
  {
    intent: "chi_non_torna",
    test: (m) =>
      (/(chi|quali|quanti)/.test(m) && /(non torna|non tornano|non viene piu|non vengono piu)/.test(m)) ||
      /inattiv/.test(m) ||
      (/client/.test(m) && /(persi|perduti|spariti|dormient)/.test(m))
        ? {}
        : null,
  },
  {
    intent: "piatti_che_rendono_meno",
    test: (m) =>
      (/(piatt|carta|menu)/.test(m) &&
        /(rendon|rendimento|margine|margini|redditiv|guadagn|convengon|conviene)/.test(m)) ||
      (/(piatt)/.test(m) && /(peggior|meno)/.test(m) && !/vendut/.test(m))
        ? {}
        : null,
  },
  {
    intent: "giorno_peggiore",
    test: (m) =>
      /giorn/.test(m) &&
      /(peggior|piu vuoto|piu scarico|meno gente|meno copert|piu debole|migliore|piu pieno)/.test(m)
        ? {}
        : null,
  },

  {
    intent: "get_today_reservations",
    test: (m) => ((/prenotazion/.test(m) && /(oggi|stasera|stamattina|adesso|ora)/.test(m)) || /mostra.*prenotazion/.test(m) ? {} : null),
  },
  {
    intent: "get_unassigned_tables",
    test: (m) => (/tavol/.test(m) && (/non.*(assegnat|cameriere)/.test(m) || /senza cameriere/.test(m)) ? {} : null),
  },
  {
    intent: "get_available_tables",
    test: (m) => (/tavol.*liber/.test(m) || /quali tavoli.*disponibil/.test(m) ? {} : null),
  },
  {
    intent: "get_waiter_assignments",
    test: (m) => (/camerier/.test(m) && /assegnat/.test(m) && !/non.*assegnat/.test(m) ? {} : null),
  },
  {
    intent: "get_occupancy",
    test: (m) => (/occupazion/.test(m) ? {} : null),
  },
  {
    intent: "get_service_covers",
    test: (m) => (/copert/.test(m) ? {} : null),
  },
  {
    intent: "get_period_revenue",
    test: (m) => (/(fatturat|incass|ricav)/.test(m) ? {} : null),
  },
  {
    intent: "get_expiring_contracts",
    test: (m) => (/contratt/.test(m) && /scaden|scad/.test(m) ? {} : null),
  },
  {
    intent: "assign_waiter",
    test: (m) => {
      const match = m.match(/assegna\s+([a-z]+(?:\s+[a-z]+)?)\s+(?:ai\s+tavoli|al\s+tavolo)\s+(.+)/);
      return match ? { waiterName: match[1].trim(), tableRange: match[2].trim() } : null;
    },
  },
  {
    intent: "navigate_to_section",
    test: (m) => {
      const match = m.match(/apri\s+(?:le\s+|la\s+|il\s+|i\s+)?(\w+)/);
      if (!match) return null;
      const section = SECTION_ROUTES.find((s) => s === match[1] || match[1].startsWith(s.slice(0, 5)));
      return section ? { section } : null;
    },
  },
];

export function classifyIntent(rawMessage: string): IntentMatch {
  const message = normalize(rawMessage);
  for (const rule of rules) {
    const params = rule.test(message);
    if (params) return { kind: "internal", intent: rule.intent, params };
  }
  return { kind: "external" };
}
