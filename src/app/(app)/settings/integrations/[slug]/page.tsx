import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { voceDi } from "@/server/integrations/registry";
import { dettaglioCliente } from "@/server/integrations/vista-cliente";
import { origineDellaPiattaforma } from "@/server/integrations/sync";
import { PresentazioneIntegrazione } from "@/components/integrations/presentazione-integrazione";
import { WizardCollegamento } from "@/components/integrations/wizard-collegamento";
import { GestioneIntegrazione } from "@/components/integrations/gestione-integrazione";
import { superAdminCorrente } from "@/lib/super-admin";

export const dynamic = "force-dynamic";

/**
 * Un'integrazione, vista dal ristoratore. Tre schermate, e le decide lo
 * **stato sul server**:
 *
 * - non collegata → la presentazione (`PresentazioneIntegrazione`): che cosa
 *   fa e un pulsante;
 * - «Collega» (`?collega=1`), o un collegamento iniziato e non finito → il
 *   wizard (`WizardCollegamento`), dal passo a cui era arrivato;
 * - collegata → la gestione (`GestioneIntegrazione`).
 *
 * La vista tecnica — adattatore, registro, certificazione — non è qui: sta in
 * /admin/integrazioni/<slug>, solo per i Super Admin di Foodtech. A loro
 * questa pagina mostra soltanto un collegamento per andarci.
 */
export default async function IntegrazionePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { collega?: string; installa?: string; esito?: string; passo?: string; consegna?: string };
}) {
  const ctx = await getActiveVenue();
  const voce = voceDi(params.slug);
  if (!voce) notFound();

  // Stripe ha la sua pagina, nata prima della piattaforma: si va lì.
  if (voce.nativa) redirect(voce.nativa.href);

  const indietro = (
    <Button asChild variant="ghost" size="sm" className="fissa -ml-2 h-11 self-start text-sm md:ml-0 md:h-9 md:text-xs">
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

  const puoConfigurare = can(ctx.role, "integration:configure");
  const puoInstallare = can(ctx.role, "integration:install");
  const d = await dettaglioCliente(
    ctx.venueId,
    params.slug,
    puoConfigurare ? { aggiornamentiDa: { origine: origineDellaPiattaforma(headers()) } } : {},
  );
  if (!d) notFound();

  const inst = d.installazione;
  // Il ritorno dall'accesso OAuth arriva con `installa=1`: è lo stesso wizard.
  const chiesto = searchParams.collega === "1" || searchParams.installa === "1";
  const passo = searchParams.passo === "accesso" || searchParams.passo === "auth" ? "accesso" : searchParams.passo === "sede" ? "sede" : null;
  const wizard =
    puoInstallare &&
    puoConfigurare &&
    inst?.condizione !== "sospesa" &&
    ((chiesto && (d.azione === "COLLEGA" || !!inst)) || inst?.condizione === "in_configurazione");

  const superAdmin = (await superAdminCorrente()).ok;

  return (
    <div className="schermo animate-fade-in gap-3">
      {indietro}
      <div className="fill-scroll max-md:[scrollbar-gutter:auto] md:pr-0.5">
        <div className="space-y-4 pb-6">
          {wizard && searchParams.consegna === "1" && (
            <p role="status" className="riquadro mx-auto max-w-2xl border-accent/40 bg-accent/10 p-3 text-sm">
              Sei qui dal collegamento dell&apos;assistenza Foodtech. Inserisci tu i dati di accesso di {voce.nome}: restano cifrati e
              nessuno, nemmeno Foodtech, potrà rileggerli.
            </p>
          )}
          {wizard ? (
            <WizardCollegamento dettaglio={d} esitoOAuth={searchParams.esito ?? null} passoRichiesto={passo} />
          ) : inst ? (
            <GestioneIntegrazione
              dettaglio={d}
              permessi={{
                configura: puoConfigurare,
                disconnetti: can(ctx.role, "integration:disconnect"),
                installa: puoInstallare,
              }}
            />
          ) : (
            <PresentazioneIntegrazione dettaglio={d} puoCollegare={puoInstallare} />
          )}

          {superAdmin && (
            <p className="mx-auto max-w-2xl text-center">
              <Link
                href={`/admin/integrazioni/${params.slug}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 text-[0.8125rem] text-muted-foreground underline-offset-4 md:min-h-0 md:text-xs hover:text-foreground hover:underline"
              >
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> Vista tecnica Foodtech
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
