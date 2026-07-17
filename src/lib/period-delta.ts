export type DeltaResult =
  | { available: false }
  | { available: true; value: number; isGood: boolean | null; kind: "count" | "rate" };

interface ComputeDeltaOptions {
  higherIsBetter?: boolean;
  kind?: "count" | "rate";
}

/**
 * Compares a current value against its previous-period equivalent.
 * "rate" metrics (already expressed as %) compare in absolute percentage
 * points; "count" metrics (bookings, covers, currency) compare in relative %.
 * Returns { available: false } when there's no previous-period baseline to
 * compare against, so callers can show "confronto non disponibile" instead
 * of a fabricated 0%/100%.
 */
export function computeDelta(
  current: number,
  previous: number,
  { higherIsBetter = true, kind = "count" }: ComputeDeltaOptions = {},
): DeltaResult {
  if (previous === 0) return { available: false };

  const value =
    kind === "rate" ? current - previous : Math.round(((current - previous) / previous) * 100);
  const isGood = value === 0 ? null : (value > 0) === higherIsBetter;

  return { available: true, value, isGood, kind };
}
