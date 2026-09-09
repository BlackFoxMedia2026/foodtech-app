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
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Impostazioni</p>
        <h1 className="text-display text-3xl">Brand</h1>
        <p className="text-sm text-muted-foreground">
          Carica il logo, scegli i colori e imposta le informazioni principali del tuo ristorante.
        </p>
      </header>

      <div className="fill-scroll pr-0.5">
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
