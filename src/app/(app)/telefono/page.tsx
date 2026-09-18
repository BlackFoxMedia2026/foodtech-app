import { notFound } from "next/navigation";
import { getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { elencoChiamate } from "@/server/chiamate";
import { ElencoChiamateVista } from "@/components/telefono/elenco-chiamate";
import { TelefonoBrowser } from "@/components/telefono/telefono-browser";
import { statoTelefonoBrowser } from "@/server/telefono-browser";
import { capacitaDi } from "@/server/voice/provider";
import { cosaDaFareAlTelefono } from "@/server/voice/da-fare";
import { DaFare } from "@/components/telefono/da-fare";
import { can } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * Il telefono del locale: chi ha chiamato, e chi non ha trovato nessuno.
 *
 * ## Perché «non esiste» e non «non hai i permessi»
 *
 * Un locale senza il telefono collegato riceve **404**. Non è un dispetto: la
 * voce in barra non c'è, quindi arrivarci significa aver scritto l'indirizzo a
 * mano, e una pagina che risponde «non hai comprato questa funzione» a chi
 * prova gli indirizzi è un catalogo di quello che esiste. Cosa c'è da avere
 * sta scritto in Impostazioni → Telefono, che è il posto dove si va a
 * guardare.
 *
 * ## Due colonne, due domande
 *
 * **Da fare**: chi va richiamato adesso — la coda delle richiamate e le
 * chiamate perse che nessuno ha ancora guardato. È la parte che si guarda
 * venti volte in una sera.
 *
 * **Storico**: com'è andato il telefono, con l'esito di ogni chiamata. È la
 * parte che si guarda una volta al mese, e serve a una domanda sola: quante
 * telefonate diventano prenotazioni.
 *
 * Erano una lista sola con un filtro sopra, e la prima delle due si trovava
 * solo premendo. In servizio quello che si trova premendo non si trova.
 */
export default async function TelefonoPage({
  searchParams,
}: {
  searchParams: { solo?: string; giorni?: string };
}) {
  const ctx = await getActiveVenue();
  const stato = await statoCentralino(ctx.venueId);
  if (!stato.attivo) notFound();

  const solo = searchParams.solo === "perse" ? "perse" : "tutte";
  const giorni = [1, 7, 30].includes(Number(searchParams.giorni))
    ? Number(searchParams.giorni)
    : 7;

  const [elenco, daFare, telefono, capacita] = await Promise.all([
    elencoChiamate(ctx.venueId, { solo, giorni }),
    cosaDaFareAlTelefono(ctx.venueId),
    statoTelefonoBrowser(ctx.venueId),
    capacitaDi(ctx.venueId),
  ]);

  /* Il telefono nel browser compare solo se è configurato **e** solo a chi in
     questo locale risponde al telefono: la rotta che dà le credenziali chiede
     `manage_bookings`, e un riquadro che si collega e fallisce per chi non ha
     quel permesso sarebbe un errore inventato dall'interfaccia. */
  /* `capacita.browser` è la terza condizione, e non è una ripetizione: i dati
     SIP possono essere configurati su un fornitore che non fa WebRTC, e in quel
     caso il riquadro si collegherebbe a vuoto. */
  const puoRispondere =
    telefono.pronto && capacita.browser && can(ctx.role, "manage_bookings");

  return (
    /* Il telefono nel browser entra **dentro** l'elenco e non accanto: la
       pagina è una colonna alta esattamente il video, e un secondo figlio
       fuori dal contenitore romperebbe la regola «una schermata operativa si
       guarda, non si scorre». */
    <ElencoChiamateVista
      telefono={puoRispondere ? <TelefonoBrowser capacita={capacita} /> : null}
      /* Le date diventano testo qui e non nel componente: un componente
         `"use client"` non riceve oggetti `Date`. */
      daFare={
        <DaFare
          fuso={ctx.venue.timezone}
          richiamate={daFare.richiamate.map((r) => ({
            id: r.id,
            numero: r.numero,
            ospite: r.ospite,
            callId: r.callId,
            tentativi: r.tentativi,
            nota: r.nota,
            creata: r.creata.toISOString(),
            inRitardo: r.inRitardo,
          }))}
          perse={daFare.perse.map((p) => ({
            ...p,
            quando: p.quando.toISOString(),
          }))}
        />
      }
      elenco={{
        ...elenco,
        chiamate: elenco.chiamate.map((c) => ({
          ...c,
          quando: c.quando.toISOString(),
          prenotazione: c.prenotazione
            ? {
                ...c.prenotazione,
                startsAt: c.prenotazione.startsAt.toISOString(),
              }
            : null,
        })),
      }}
      solo={solo}
      giorni={giorni}
      fuso={ctx.venue.timezone}
    />
  );
}
