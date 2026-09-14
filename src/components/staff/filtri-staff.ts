"use client";

import { useCallback, useEffect, useState } from "react";
import type { StaffDepartment, StaffPrimaryRole } from "@prisma/client";

export type FiltriStaff = {
  reparto: StaffDepartment | "tutti";
  ruolo: StaffPrimaryRole | "tutti";
  stato: "tutti" | "in-turno" | "riposo" | "assenza";
};

export const FILTRI_VUOTI: FiltriStaff = { reparto: "tutti", ruolo: "tutti", stato: "tutti" };

export const STATI_FILTRO: { value: FiltriStaff["stato"]; label: string }[] = [
  { value: "tutti", label: "Tutti gli stati" },
  { value: "in-turno", label: "In turno" },
  { value: "riposo", label: "Riposo" },
  { value: "assenza", label: "Ferie / Permesso" },
];

export function filtriAttivi(filtri: FiltriStaff): boolean {
  return filtri.reparto !== "tutti" || filtri.ruolo !== "tutti" || filtri.stato !== "tutti";
}

const CHIAVE = "tavolo:staff:filtri";

/**
 * I filtri dello Staff, **condivisi fra Persone e Turni**.
 *
 * Persone e Turni sono due pagine vere e non due stati di un componente — è
 * quello che fa funzionare «mandami il link dei turni di sabato». Ma passando
 * dall'una all'altra si attraversa il router, e uno `useState` muore lì: chi
 * aveva ristretto a «Cucina» per capire chi c'è in brigata, e poi passava
 * all'elenco per aprire una scheda, ritrovava tutti e tredici.
 *
 * L'indirizzo sarebbe l'altra casa possibile, ed è quella sbagliata qui: le
 * pagine sono `force-dynamic`, quindi ogni tendina costerebbe un giro sul
 * server per filtrare dati che sono **già nel browser**. `sessionStorage`
 * tiene il contesto per il tempo in cui si sta lavorando e lo lascia andare
 * alla chiusura della scheda, che è esattamente la vita utile di un filtro.
 *
 * Il primo render è sempre `FILTRI_VUOTI` e la lettura avviene dopo il
 * montaggio: il server non ha una `sessionStorage` da reidratare, e partire
 * da un valore che lui non può conoscere sarebbe una discordanza.
 */
export function useFiltriStaff() {
  const [filtri, setFiltri] = useState<FiltriStaff>(FILTRI_VUOTI);

  useEffect(() => {
    try {
      const salvato = sessionStorage.getItem(CHIAVE);
      if (salvato) setFiltri({ ...FILTRI_VUOTI, ...(JSON.parse(salvato) as Partial<FiltriStaff>) });
    } catch {
      // Navigazione privata, o archiviazione negata: si resta sui filtri vuoti.
    }
  }, []);

  const aggiorna = useCallback((prossimi: FiltriStaff) => {
    setFiltri(prossimi);
    try {
      sessionStorage.setItem(CHIAVE, JSON.stringify(prossimi));
    } catch {
      // Idem: il filtro funziona lo stesso, non sopravvive al cambio pagina.
    }
  }, []);

  return [filtri, aggiorna] as const;
}
