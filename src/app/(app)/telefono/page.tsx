import { notFound } from "next/navigation";
import { getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { elencoChiamate } from "@/server/chiamate";
import { ElencoChiamateVista } from "@/components/telefono/elenco-chiamate";
import { statoTelefonoBrowser } from "@/server/telefono-browser";
import { capacitaDi } from "@/server/voice/provider";
import { cosaDaFareAlTelefono } from "@/server/voice/da-fare";
import { DaFare } from "@/components/telefono/da-fare";
import { risposteDelLocale } from "@/server/voice/conoscenza";
import { RispostePronte } from "@/components/telefono/risposte-pronte";
import { insightDaApprovare } from "@/server/voice/insight";
import { interrotteDaSeguire } from "@/server/voice/recupero-link";
import { Interrotte } from "@/components/telefono/interrotte";
import { DaApprovare } from "@/components/telefono/insight";
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
 * **Stessa risposta a chi non può rispondere al telefono** (`use_phone`:
 * manager, reception, camerieri — non marketing, non sola lettura). Anche per
 * loro la voce in barra non c'è, quindi vale lo stesso ragionamento; e il
 * ruolo che uno ha nel locale glielo dice il suo manager, non un messaggio a
 * un indirizzo tentato a mano.
 *
 * Questo controllo **non c'era**: la pagina guardava solo la licenza, e un
 * accesso in sola lettura leggeva nomi, numeri e chiamate perse di tutti i
 * clienti del locale.
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
  if (!stato.attivo || !can(ctx.role, "use_phone")) notFound();

  const solo = searchParams.solo === "perse" ? "perse" : "tutte";
  const giorni = [1, 7, 30].includes(Number(searchParams.giorni))
    ? Number(searchParams.giorni)
    : 7;

  const [elenco, daFare, telefono, capacita, risposte, proposte, interrotte] =
    await Promise.all([
      elencoChiamate(ctx.venueId, { solo, giorni }),
      cosaDaFareAlTelefono(ctx.venueId),
      statoTelefonoBrowser(ctx.venueId),
      capacitaDi(ctx.venueId),
      /* Le risposte pronte arrivano con la pagina: sono dieci frasi corte, e
       cercarle mentre una persona aspetta in linea non deve costare una
       richiesta al server per ogni lettera. */
      risposteDelLocale(ctx.venueId),
      insightDaApprovare(ctx.venueId),
      /* Le telefonate finite a meta: chi non ha ricevuto il link e una
         persona da richiamare, e chi lavora al telefono deve vederlo qui. */
      interrotteDaSeguire(ctx.venueId),
    ]);

  /*
    Il telefono nel browser **non è più qui**: sta nel guscio, su qualunque
    pagina (`layout.tsx`).

    Non è uno spostamento estetico. Due copie in pagina vorrebbero dire due
    registrazioni SIP con la stessa utenza, e la stessa chiamata che squilla
    due volte sullo stesso schermo. Qui resta una riga che dice **dove** si
    risponde — un fatto, non uno stato che potrebbe contraddire quello vero.
  */
  const rispondeNelBrowser = telefono.pronto && capacita.browser;

  return (
    /* Il telefono nel browser entra **dentro** l'elenco e non accanto: la
       pagina è una colonna alta esattamente il video, e un secondo figlio
       fuori dal contenitore romperebbe la regola «una schermata operativa si
       guarda, non si scorre». */
    <ElencoChiamateVista
      telefono={
        rispondeNelBrowser ? (
          <p className="fissa riquadro p-3 t-nota">
            Le chiamate squillano su <strong>qualunque pagina</strong> di
            Tavolo: il riquadro per rispondere compare in basso a destra, dove
            sei.
          </p>
        ) : null
      }
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
          interrotte={
            <Interrotte
              fuso={ctx.venue.timezone}
              righe={interrotte.map((r) => ({
                id: r.id,
                numero: r.numero,
                nome: r.nome,
                persone: r.persone,
                quando: r.quando?.toISOString() ?? null,
                passo: r.passo,
                invio: r.invio,
                daRichiamare: r.daRichiamare,
              }))}
            />
          }
          risposte={<RispostePronte risposte={risposte} />}
          approvazioni={
            <DaApprovare
              proposte={proposte.map((p) => ({
                id: p.id,
                tipo: p.tipo,
                valore: p.valore,
                chi: p.chi,
                ospite: p.ospite,
              }))}
            />
          }
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
      /* Chi può scrivere nella scheda di un cliente vede i gesti che lo
         fanno: proporre una nota lo può fare chi risponde al telefono, e
         approvarla chiede la stessa capacità con cui si modifica una scheda a
         mano. */
      puoModificareSchede={can(ctx.role, "manage_bookings")}
      solo={solo}
      giorni={giorni}
      fuso={ctx.venue.timezone}
    />
  );
}
