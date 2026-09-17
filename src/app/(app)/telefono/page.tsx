import { notFound } from "next/navigation";
import { getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { elencoChiamate } from "@/server/chiamate";
import { ElencoChiamateVista } from "@/components/telefono/elenco-chiamate";
import { TelefonoBrowser } from "@/components/telefono/telefono-browser";
import { statoTelefonoBrowser } from "@/server/telefono-browser";
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
 * ## Cosa fa, e cosa non fa ancora
 *
 * Fa l'unica cosa che il ristoratore rifà venti volte in una sera: guardare
 * chi ha chiamato e non ha trovato nessuno, per richiamarlo. **Non** risponde
 * dal browser e non registra: quelle sono le prossime, e una pagina che le
 * annunciasse con un pulsante spento sarebbe una promessa, non un prodotto.
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

  const [elenco, telefono] = await Promise.all([
    elencoChiamate(ctx.venueId, { solo, giorni }),
    statoTelefonoBrowser(ctx.venueId),
  ]);

  /* Il telefono nel browser compare solo se è configurato **e** solo a chi in
     questo locale risponde al telefono: la rotta che dà le credenziali chiede
     `manage_bookings`, e un riquadro che si collega e fallisce per chi non ha
     quel permesso sarebbe un errore inventato dall'interfaccia. */
  const puoRispondere = telefono.pronto && can(ctx.role, "manage_bookings");

  return (
    /* Il telefono nel browser entra **dentro** l'elenco e non accanto: la
       pagina è una colonna alta esattamente il video, e un secondo figlio
       fuori dal contenitore romperebbe la regola «una schermata operativa si
       guarda, non si scorre». */
    <ElencoChiamateVista
      telefono={puoRispondere ? <TelefonoBrowser /> : null}
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
