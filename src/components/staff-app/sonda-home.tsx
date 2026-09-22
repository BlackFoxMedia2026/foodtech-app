"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useServizioVivo } from "@/lib/use-servizio-vivo";

/**
 * **La Home che si aggiorna da sola.**
 *
 * La Home è una pagina del server, e fino a ieri era anche una fotografia
 * ferma: un tavolo accomodato da un collega compariva al prossimo tocco su
 * «Home», non prima. Andava bene quando la Home era un riassunto; non va più
 * bene da quando la prima cosa che mostra è **la coda di cosa fare adesso**,
 * perché una coda che non si aggiorna non è una coda — è una lista vecchia.
 *
 * Non introduce niente di nuovo: è la stessa sonda della Sala
 * (`useServizioVivo`), che chiede ogni cinque secondi una domanda piccola —
 * «è cambiato qualcosa?» — e solo quando la risposta cambia fa ricalcolare la
 * pagina. Il registro dentro l'hook tiene **una sola** interrogazione per
 * schermata, quindi affiancarla ad altri componenti vivi non costa una
 * seconda richiesta.
 *
 * `router.refresh()` e non uno stato locale: la Home è fatta di sezioni rese
 * dal server a partire da una lettura sola, e ricalcolarla è il modo di
 * vederle tutte d'accordo fra loro. Tenere in memoria una copia dei tavoli
 * qui vorrebbe dire due verità sullo stesso schermo.
 */
export function SondaHome() {
  const router = useRouter();
  useServizioVivo(
    useCallback(async () => {
      router.refresh();
    }, [router]),
  );
  return null;
}
