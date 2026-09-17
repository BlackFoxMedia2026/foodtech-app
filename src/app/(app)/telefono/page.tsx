import { notFound } from "next/navigation";
import { getActiveVenue } from "@/lib/tenant";
import { statoCentralino } from "@/server/licenza-centralino";
import { elencoChiamate } from "@/server/chiamate";
import { ElencoChiamateVista } from "@/components/telefono/elenco-chiamate";

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

  const elenco = await elencoChiamate(ctx.venueId, { solo, giorni });

  return (
    <ElencoChiamateVista
      elenco={{
        ...elenco,
        chiamate: elenco.chiamate.map((c) => ({
          ...c,
          quando: c.quando.toISOString(),
          prenotazione: c.prenotazione
            ? { ...c.prenotazione, startsAt: c.prenotazione.startsAt.toISOString() }
            : null,
        })),
      }}
      solo={solo}
      giorni={giorni}
      fuso={ctx.venue.timezone}
    />
  );
}
