import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import { getBrandSettings } from "@/server/venue-brand";
import { BrandSettingsForm } from "@/components/settings/brand-settings-form";

export const dynamic = "force-dynamic";

export default async function BrandSettingsPage() {
  const ctx = await getActiveVenue();
  const venue = await getBrandSettings(ctx.venueId);

  return (
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa">
        {/* Sul telefono non c'è la barra delle sezioni in alto: senza questo
            link l'unica via di ritorno era il tasto indietro. */}
        <Link
          href="/settings?sez=locale"
          className="-ml-1 inline-flex min-h-[44px] items-center gap-2 px-1 text-[0.9375rem] text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Impostazioni
        </Link>
        <p className="t-etichetta hidden md:block">Impostazioni</p>
        <p className="text-sm text-muted-foreground">
          Carica il logo, scegli i colori e imposta le informazioni principali del tuo ristorante.
        </p>
      </header>

      <div className="fill-scroll max-md:[scrollbar-gutter:auto] md:pr-0.5">
      <BrandSettingsForm
        initial={{
          name: venue.name,
          brandLogoUrl: venue.brandLogoUrl ?? "",
          coverImage: venue.coverImage ?? "",
          brandAccent: venue.brandAccent ?? "",
          brandSecondaryColor: venue.brandSecondaryColor ?? "",
          brandTypography: venue.brandTypography ?? "",
          phone: venue.phone ?? "",
          email: venue.email ?? "",
          address: venue.address ?? "",
          websiteUrl: venue.websiteUrl ?? "",
          instagramUrl: venue.instagramUrl ?? "",
          facebookUrl: venue.facebookUrl ?? "",
          googleBusinessUrl: venue.googleBusinessUrl ?? "",
        }}
      />
      </div>
    </div>
  );
}
