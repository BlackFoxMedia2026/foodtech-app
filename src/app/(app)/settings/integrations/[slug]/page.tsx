import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { voceDi } from "@/server/integrations/registry";
import { dettaglioPerLocale } from "@/server/integrations/vista";
import { origineDellaPiattaforma } from "@/server/integrations/sync";
import { PercorsoInstallazione } from "@/components/integrations/percorso-installazione";
import { DettaglioIntegrazione } from "@/components/integrations/dettaglio-integrazione";
import { superAdminCorrente } from "@/lib/super-admin";

export const dynamic = "force-dynamic";

/**
 * Una integrazione: il percorso di installazione finché non è attiva, la
 * pagina di gestione dopo.
 *
 * Quale delle due lo decide lo **stato sul server**: un'installazione a metà
 * riapre il percorso dal passo a cui era arrivata; una attiva mostra la
 * gestione, e «Riconfigura» (`?installa=1`) riapre il percorso sopra quella.
 */

/** Gli stati in cui l'integrazione è ancora dentro il percorso. */
const NEL_PERCORSO = new Set(["INSTALLING", "NEEDS_CONFIGURATION", "CONNECTED"]);

export default async function IntegrazionePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { installa?: string; esito?: string; passo?: string };
}) {
  const ctx = await getActiveVenue();
  const voce = voceDi(params.slug);
  if (!voce) notFound();

  // Stripe ha la sua pagina, nata prima della piattaforma: si va lì.
  if (voce.nativa) redirect(voce.nativa.href);

  const indietro = (
    <Button asChild variant="ghost" size="sm" className="fissa self-start">
      <Link href="/settings/integrations">
        <ArrowLeft className="h-4 w-4" /> Integrazioni
      </Link>
    </Button>
  );

  if (!can(ctx.role, "integration:view")) {
    return (
      <div className="schermo animate-fade-in gap-3">
        {indietro}
        <p className="riquadro p-5 text-sm text-muted-foreground">Le integrazioni le gestisce chi amministra il locale.</p>
      </div>
    );
  }

  const dettaglio = await dettaglioPerLocale(
    ctx.venueId,
    params.slug,
    can(ctx.role, "integration:logs"),
    // L'indirizzo dei webhook da incollare nel pannello del fornitore: solo a
    // chi può configurare, e solo per le voci che lo richiedono.
    can(ctx.role, "integration:configure") ? { origine: origineDellaPiattaforma(headers()) } : undefined,
  );
  if (!dettaglio) notFound();

  // La console di certificazione: solo per i Super Admin di Foodtech, mai per i ristoratori.
  const superAdmin = (await superAdminCorrente()).ok;
  const stato = dettaglio.installazione?.status ?? null;
  const percorso =
    !dettaglio.installazione ||
    NEL_PERCORSO.has(stato ?? "") ||
    searchParams.installa === "1";

  return (
    <div className="schermo animate-fade-in gap-3">
      {indietro}
      <header className="fissa">
        <p className="t-etichetta">Impostazioni / Integrazioni / {voce.nome}</p>
      </header>
      <div className="fill-scroll pr-0.5">
        <div className="pb-4">
          {percorso ? (
            <PercorsoInstallazione
              slug={params.slug}
              dettaglio={dettaglio}
              esitoOAuth={searchParams.esito ?? null}
              passoRichiesto={searchParams.passo === "auth" ? 1 : null}
              puoInstallare={can(ctx.role, "integration:install")}
              puoConfigurare={can(ctx.role, "integration:configure")}
            />
          ) : (
            <DettaglioIntegrazione
              dettaglio={dettaglio}
              permessi={{
                configura: can(ctx.role, "integration:configure"),
                disconnetti: can(ctx.role, "integration:disconnect"),
                installa: can(ctx.role, "integration:install"),
                registro: can(ctx.role, "integration:logs"),
              }}
              superAdmin={superAdmin}
            />
          )}
        </div>
      </div>
    </div>
  );
}
