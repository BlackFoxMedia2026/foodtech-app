import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import { reputazioneDi, panoramicaDem } from "@/server/dem/statistiche";
import { statoInvio } from "@/server/dem/dominio";
import { SchedaReputazione } from "@/components/dem/scheda-reputazione";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const NUM = new Intl.NumberFormat("it-IT");

/**
 * «Come stanno andando i miei invii».
 *
 * Due cose sulla stessa pagina perché sono due facce della stessa domanda: la
 * reputazione dice se le email **arrivano**, la panoramica dice se **vengono
 * lette**. Separarle vorrebbe dire far cercare in due posti la risposta a
 * «funziona?».
 */
export default async function ReputazionePage() {
  const ctx = await getActiveVenue();
  const [reputazione, panoramica, invio] = await Promise.all([
    reputazioneDi(ctx.venueId),
    panoramicaDem(ctx.venueId, 30),
    statoInvio(ctx.venueId),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-fade-in">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/settings#marketing">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <header>
        <h1 className="t-titolo-pagina">Reputazione</h1>
      </header>

      <SchedaReputazione
        livello={reputazione.livello}
        messaggio={reputazione.messaggio}
        tassoRimbalzi={reputazione.tassoRimbalzi}
        tassoSegnalazioni={reputazione.tassoSegnalazioni}
        dominioPronto={reputazione.dominioPronto}
        dkim={invio.dkim}
        spf={invio.spf}
        dmarc={invio.dmarc}
      />

      {!invio.configurato && (
        <section className="surface p-5">
          <p className="t-titolo-scheda">Manca il dominio di invio</p>
          <p className="t-nota mt-1">
            Le newsletter partono da un indirizzo che porta il nome del tuo locale: si configura una
            volta sola.
          </p>
          <Button asChild variant="accent" className="mt-4">
            <Link href="/settings/marketing/invio">Configura il dominio</Link>
          </Button>
        </section>
      )}

      <section className="surface p-5 md:p-6">
        <h2 className="t-titolo-sezione">Ultimi 30 giorni</h2>
        {panoramica.inviate === 0 ? (
          <p className="t-nota mt-3">
            Nessuna campagna inviata nel periodo: qui compariranno i risultati appena ne parte una.
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato etichetta="Email inviate" valore={NUM.format(panoramica.inviate)} />
            <Dato etichetta="Consegnate" valore={pct(panoramica.tassoConsegna)} />
            <Dato etichetta="Aperture" valore={pct(panoramica.tassoApertura)} />
            <Dato etichetta="Click" valore={pct(panoramica.tassoClick)} />
            <Dato etichetta="Non recapitate" valore={pct(panoramica.tassoRimbalzo)} />
            <Dato etichetta="Disiscrizioni" valore={pct(panoramica.tassoDisiscrizione)} />
          </dl>
        )}
      </section>
    </div>
  );
}

/*
  Una percentuale che non c'è non è «0%».

  Il tasso di apertura si misura su chi ha ricevuto: finché nessuna consegna è
  stata confermata, quel rapporto non esiste — e scrivere zero significherebbe
  dire «nessuno l'ha aperta» di una campagna che potrebbe essere ancora per
  strada.
*/
function pct(valore: number | null): string {
  return valore === null ? "—" : `${valore.toLocaleString("it-IT")}%`;
}

function Dato({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <dt className="t-etichetta">{etichetta}</dt>
      <dd className="text-display mt-0.5 text-xl tabular-nums">{valore}</dd>
    </div>
  );
}
