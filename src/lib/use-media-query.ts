"use client";

import { useSyncExternalStore } from "react";

/**
 * Una media query come stato di React, senza sfarfallio all'idratazione.
 *
 * `useSyncExternalStore` è la forma giusta e non un vezzo: con un
 * `useState` + `useEffect` il primo render dice sempre «falso», il secondo
 * dice la verità, e fra i due lo schermo cambia impaginazione sotto gli
 * occhi. Qui il valore lato server è dichiarato (`false`) e quello lato
 * client viene letto **prima** della pittura.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notifica) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notifica);
      return () => mq.removeEventListener("change", notifica);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Il telefono: sotto `md`, dove sette colonne non stanno e non devono
 * starci. */
export function useSchermoStretto(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/**
 * Un puntatore **fine**: mouse o trackpad.
 *
 * Il trascinamento delle card vive solo qui. Su un touchscreen lo stesso
 * gesto — dito giù, dito che si muove — è lo scorrimento della griglia, e
 * per dare la precedenza al trascinamento bisognerebbe togliere lo scroll
 * alle card: su un tablet, dove il calendario si scorre di continuo, sarebbe
 * un peggioramento netto in cambio di una funzione che lì non si usa.
 */
export function usePuntatoreFine(): boolean {
  return useMediaQuery("(pointer: fine)");
}
