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
