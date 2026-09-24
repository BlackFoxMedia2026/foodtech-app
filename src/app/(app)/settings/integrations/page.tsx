import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { catalogoCliente } from "@/server/integrations/vista-cliente";
import { CatalogoIntegrazioni } from "@/components/integrations/catalogo-integrazioni";

export const dynamic = "force-dynamic";

/**
 * Impostazioni → Integrazioni.
 *
 * Il catalogo è lo stesso per tutti i locali (`server/integrations/registry.ts`);
 * ciò che cambia da un locale all'altro è cosa ha installato, e lo stato di
 * ognuna. Due ristoranti dello stesso gruppo vedono lo stesso elenco e due
 * insiemi diversi di schede «Collegata».
 *
 * È la vista del cliente (`vista-cliente.ts`): cinque stati e un pulsante.
 * Quella di Foodtech sta in /admin/integrazioni.
 */
export default async function IntegrazioniPage() {
  const ctx = await getActiveVenue();

  if (!can(ctx.role, "integration:view")) {
    return (
      <div className="schermo animate-fade-in gap-3">
        <Button asChild variant="ghost" size="sm" className="fissa self-start">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" /> Impostazioni
          </Link>
        </Button>
        <p className="riquadro p-5 text-sm text-muted-foreground">
          Le integrazioni le gestisce chi amministra il locale.
        </p>
      </div>
    );
  }

  const schede = await catalogoCliente(ctx.venueId, { stripe: ctx.venue.stripeChargesEnabled });

  return (
    <div className="schermo animate-fade-in gap-3">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/settings?sez=sistema">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <header className="fissa">
        <p className="t-etichetta">Impostazioni / Integrazioni</p>
        <h1 className="mt-1 t-titolo-pagina">Integrazioni</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Collega Foodtech agli strumenti che il tuo ristorante utilizza già.
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
        <div className="pb-4">
          <CatalogoIntegrazioni schede={schede} puoCollegare={can(ctx.role, "integration:install")} />
        </div>
      </div>
    </div>
  );
}
