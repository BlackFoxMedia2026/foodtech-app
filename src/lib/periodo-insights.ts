import { giornataInVenue, mezzanotteInVenue, shiftDateKey, todayInVenue } from "@/lib/venue-time";

/**
 * Il periodo di Analytics letto dall'indirizzo. Sta in `lib` perché lo
 * leggono due pagine: la panoramica dei numeri e il dettaglio di ciascuno.
 */

const PRESET_RANGE_KEYS = new Set([
  "last7",
  "last30",
  "last90",
  "currentMonth",
  "currentYear",
]);

/**
 * Il periodo, in giorni **del locale**.
 *
 * Si ragiona su date `AAAA-MM-GG` e si trasformano in istanti solo alla fine,
 * con il fuso del locale: `startOfDay`/`endOfDay` e `new Date(anno, mese, 1)`
 * rispondevano nel fuso del processo — UTC su Vercel — e «oggi» cominciava
 * alle 02:00 italiane, lasciando la cena dell'una di notte nel giorno prima.
 */
export function periodoDa(
  searchParams: {
    range?: string;
    from?: string;
    to?: string;
  },
  fuso: string,
) {
  const oggi = todayInVenue(fuso);
  const DATA = /^\d{4}-\d{2}-\d{2}$/;
  const periodo = (range: string, dal: string, al: string) => ({
    range,
    from: mezzanotteInVenue(dal, fuso),
    to: giornataInVenue(mezzanotteInVenue(al, fuso), fuso).fine,
    fromKey: dal,
    toKey: al,
  });

  if (
    searchParams.range === "custom" &&
    searchParams.from &&
    searchParams.to &&
    DATA.test(searchParams.from) &&
    DATA.test(searchParams.to)
  ) {
    return periodo("custom", searchParams.from, searchParams.to);
  }

  const key =
    searchParams.range && PRESET_RANGE_KEYS.has(searchParams.range)
      ? searchParams.range
      : "last7";

  if (key === "currentMonth") return periodo(key, `${oggi.slice(0, 8)}01`, oggi);
  if (key === "currentYear") return periodo(key, `${oggi.slice(0, 5)}01-01`, oggi);
  const days = key === "last30" ? 30 : key === "last90" ? 90 : 7;
  /*
    `- (days - 1)`, non `- days`. Oggi conta come uno dei giorni del periodo:
    sottraendone sette da mezzanotte di oggi la finestra copriva **otto**
    giorni di calendario, e la sintesi scriveva «gli ultimi 8 giorni» sotto una
    pillola che dice «Ultimi 7 giorni». Lo stesso valeva per 30 e 90.
  */
  return periodo(key, shiftDateKey(oggi, -(days - 1)), oggi);
}

/** Il periodo come si dice: «Ultimi 7 giorni», «dal 3 al 18 nov». */
export function nomePeriodo(range: string, dal: string, al: string): string {
  const NOMI: Record<string, string> = {
    last7: "Ultimi 7 giorni",
    last30: "Ultimi 30 giorni",
    last90: "Ultimi 90 giorni",
    currentMonth: "Mese corrente",
    currentYear: "Anno corrente",
  };
  if (NOMI[range]) return NOMI[range];
  const f = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
  return `Dal ${f.format(new Date(`${dal}T12:00:00Z`))} al ${f.format(new Date(`${al}T12:00:00Z`))}`;
}
