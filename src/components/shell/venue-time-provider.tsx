"use client";

import { createContext, useContext } from "react";
import { DEFAULT_VENUE_TIMEZONE, todayInVenue } from "@/lib/venue-time";

/**
 * Rende disponibile il fuso orario del locale ai componenti client.
 *
 * Serve perché «oggi» va calcolato nel fuso del ristorante (vedi
 * lib/venue-time.ts) e i componenti client non possono leggere il database.
 * L'alternativa era passare la stessa proprietà lungo sei livelli di
 * componenti: un contesto costa meno e non si dimentica.
 */

const VenueTimezoneContext = createContext<string>(DEFAULT_VENUE_TIMEZONE);

export function VenueTimeProvider({
  timezone,
  children,
}: {
  timezone: string | null | undefined;
  children: React.ReactNode;
}) {
  return (
    <VenueTimezoneContext.Provider value={timezone || DEFAULT_VENUE_TIMEZONE}>
      {children}
    </VenueTimezoneContext.Provider>
  );
}

export function useVenueTimezone() {
  return useContext(VenueTimezoneContext);
}

/** Il giorno corrente del locale, come `YYYY-MM-DD`. */
export function useVenueToday() {
  return todayInVenue(useVenueTimezone());
}
