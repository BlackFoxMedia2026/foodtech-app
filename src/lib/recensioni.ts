import type { ReviewPlatform } from "@prisma/client";

/**
 * I nomi delle piattaforme e il tetto ai collegamenti.
 *
 * Stanno in `lib` e non accanto al resto delle recensioni perché li usa anche
 * il modulo nelle Impostazioni, che gira nel browser: importarli da
 * `server/reviews` si porterebbe dietro il client del database. È lo stesso
 * motivo per cui `durataUmana` vive in `lib/durata`.
 */

/** Le piattaforme che un ristorante italiano usa davvero, nell'ordine giusto. */
export const PIATTAFORME = [
  "GOOGLE",
  "TRIPADVISOR",
  "THEFORK",
  "TRUSTPILOT",
  "FACEBOOK",
  "INSTAGRAM",
  "YELP",
  "OTHER",
] as const satisfies readonly ReviewPlatform[];

export const NOME_PIATTAFORMA: Record<ReviewPlatform, string> = {
  GOOGLE: "Google",
  TRIPADVISOR: "TripAdvisor",
  THEFORK: "TheFork",
  TRUSTPILOT: "Trustpilot",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  YELP: "Yelp",
  OTHER: "Altro",
};

/**
 * Quanti collegamenti al massimo.
 *
 * Quattro sono già tanti: davanti a sei bottoni una persona contenta non
 * sceglie, chiude. Il primo è quello che conta.
 */
export const MAX_LINK = 4;
