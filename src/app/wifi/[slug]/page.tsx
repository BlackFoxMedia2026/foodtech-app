import { notFound } from "next/navigation";
import { Wifi } from "lucide-react";
import { getPortale } from "@/server/wifi";
import { WifiPortalForm } from "@/components/wifi/wifi-portal-form";

export const dynamic = "force-dynamic";

/**
 * Il portale Wi-Fi che apre chi è appena entrato nel locale.
 *
 * Nessuna intestazione dell'applicazione e nessun accesso: chi è qui ha il
 * telefono in mano e vuole la rete. Il testo di benvenuto lo scrive il locale.
 *
 * Se il portale non è configurato — manca il nome della rete o la password —
 * questa pagina **non esiste**. Un modulo che raccoglie indirizzi email senza
 * dare niente in cambio è peggio di una pagina mancante, e il personale la
 * password la sa dire a voce.
 */
export default async function WifiPortalPage({ params }: { params: { slug: string } }) {
  const portale = await getPortale(params.slug);
  if (!portale) notFound();

  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-sm space-y-6 py-10">
        <header className="space-y-3 text-center">
          {portale.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={portale.logoUrl} alt={portale.venueName} className="mx-auto h-14 w-auto object-contain" />
          ) : (
            <Wifi
              className="mx-auto h-10 w-10"
              style={{ color: portale.accent ?? undefined }}
              aria-hidden="true"
            />
          )}
          <h1 className="text-display text-2xl">{portale.venueName}</h1>
          {portale.welcome && <p className="text-sm text-muted-foreground">{portale.welcome}</p>}
        </header>

        <WifiPortalForm portale={portale} />
      </div>
    </div>
  );
}
