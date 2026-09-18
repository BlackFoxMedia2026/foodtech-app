import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActiveVenue } from "@/lib/tenant";
import { statoInvio } from "@/server/dem/dominio";
import { sesAttivo } from "@/server/dem/ses";
import { ImpostazioniInvio } from "@/components/dem/impostazioni-invio";

export const dynamic = "force-dynamic";

/**
 * Da dove escono le newsletter di questo locale.
 *
 * Quando l'invio non è ancora acceso su questa installazione la pagina lo
 * dice e si ferma: far compilare un dominio a qualcuno per poi non poterlo
 * verificare è peggio che non offrire la schermata.
 */
export default async function ImpostazioniInvioPage() {
  const ctx = await getActiveVenue();
  const stato = await statoInvio(ctx.venueId);

  if (!sesAttivo() && !stato.configurato) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 animate-fade-in">
        <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
          <Link href="/settings?sez=marketing">
            <ArrowLeft className="h-4 w-4" /> Impostazioni
          </Link>
        </Button>
        <header>
          <h1 className="t-titolo-pagina">Impostazioni invio</h1>
        </header>
        <section className="surface p-6">
          <p className="t-titolo-scheda">Non ancora disponibile</p>
          <p className="t-corpo mt-2 text-muted-foreground">
            L&apos;invio con il tuo dominio non è ancora attivo su questo account. Scrivici e lo
            accendiamo: nel frattempo puoi già preparare campagne e segmenti.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-fade-in">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/settings?sez=marketing">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <header>
        <h1 className="t-titolo-pagina">Impostazioni invio</h1>
        <p className="t-corpo mt-2 text-muted-foreground">
          Le newsletter partono da un indirizzo tuo, non nostro: chi le riceve vede il nome del
          locale, e le risposte arrivano dove le leggi.
        </p>
      </header>

      <ImpostazioniInvio
        iniziale={{
          ...stato,
          ultimoControllo: stato.ultimoControllo?.toISOString() ?? null,
        }}
      />
    </div>
  );
}
