import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { can, getActiveVenue } from "@/lib/tenant";
import { stripeConfigurato } from "@/lib/stripe";
import { riallineaStripe } from "@/server/stripe-connect";
import { db } from "@/lib/db";
import { ImpostazioniPagamenti } from "@/components/settings/impostazioni-pagamenti";

/**
 * Impostazioni → Pagamenti.
 *
 * Due cose, in quest'ordine: **collegare il conto Stripe del ristorante** e
 * poi decidere le regole del pagamento al tavolo. L'ordine non è estetico —
 * senza il primo il secondo non si può accendere, perché un QR attivo su un
 * locale che non può incassare manda le persone contro un errore.
 *
 * Lo stato si rilegge da Stripe a ogni apertura: il webhook `account.updated`
 * è la via normale, ma chi torna qui **nello stesso istante** in cui finisce
 * l'onboarding vedrebbe ancora «non collegato», e penserebbe di aver sbagliato
 * qualcosa.
 */

export const dynamic = "force-dynamic";

export default async function PagamentiSettingsPage() {
  const ctx = await getActiveVenue();

  // Sono i soldi e le coordinate bancarie del locale: non è una pagina da
  // lasciare aperta a chi può solo prendere prenotazioni.
  if (!can(ctx.role, "manage_venue")) {
    return (
      <div className="schermo animate-fade-in gap-3">
        <Button asChild variant="ghost" size="sm" className="fissa self-start">
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" /> Impostazioni
          </Link>
        </Button>
        <p className="riquadro p-5 text-sm text-muted-foreground">
          I pagamenti li configura chi amministra il locale.
        </p>
      </div>
    );
  }

  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  const [stato, regole, tavoli] = await Promise.all([
    riallineaStripe(ctx.venueId),
    db.venue.findUniqueOrThrow({
      where: { id: ctx.venueId },
      select: {
        qrPaymentsEnabled: true,
        tipsEnabled: true,
        tipPresets: true,
        minPaymentCents: true,
      },
    }),
    // Quanti tavoli hanno già il QR acceso: senza questo numero, «pagamento al
    // tavolo attivo» non dice se qualcuno può davvero pagare.
    db.table.count({ where: { venueId: ctx.venueId, payQrEnabled: true, payQrToken: { not: null } } }),
  ]);

  return (
    <div className="schermo animate-fade-in gap-3">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/settings">
          <ArrowLeft className="h-4 w-4" /> Impostazioni
        </Link>
      </Button>

      <ImpostazioniPagamenti
        configurato={stripeConfigurato()}
        stato={stato}
        regole={regole}
        tavoliAttivi={tavoli}
        currency={ctx.venue.currency}
        baseUrl={baseUrl}
      />
    </div>
  );
}
