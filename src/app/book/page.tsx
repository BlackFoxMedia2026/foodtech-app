import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { db } from "@/lib/db";

export default async function BookPage(props: { searchParams?: { venue?: string; embed?: string } }) {
  const venueId = props.searchParams?.venue;
  const isEmbed = props.searchParams?.embed === "1";

  const venue = venueId
    ? await db.venue.findFirst({
        where: { id: venueId, active: true },
        select: { id: true, name: true, slug: true, brandLogoUrl: true, brandAccent: true, phone: true, email: true },
      })
    : null;

  const card = venue ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Nuova prenotazione</CardTitle>
      </CardHeader>
      <CardContent>
        <PublicBookingForm
          venueId={venue.id}
          venueName={venue.name}
          embed={isEmbed}
          logoUrl={venue.brandLogoUrl ?? undefined}
          primaryColor={venue.brandAccent ?? undefined}
          phone={venue.phone ?? undefined}
          email={venue.email ?? undefined}
        />
      </CardContent>
    </Card>
  ) : (
    <Card>
      <CardContent className="text-center text-muted-foreground py-8">Locale non trovato</CardContent>
    </Card>
  );

  if (isEmbed) {
    return <div className="p-4">{card}</div>;
  }

  return (
    <div className="dark relative z-0 min-h-screen overflow-hidden bg-background p-4 text-foreground">
      <div className="mesh-bg pointer-events-none absolute -inset-32 -z-10">
        <div className="mesh-blob mesh-blob-1" />
        <div className="mesh-blob mesh-blob-2" />
        <div className="mesh-blob mesh-blob-3" />
        <div className="mesh-blob mesh-blob-4" />
        <div className="mesh-blob mesh-blob-5" />
        <div className="mesh-blob mesh-blob-6" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl space-y-6 py-8">
        <div className="text-center space-y-2">
          <h1 className="text-display text-4xl font-bold">Prenota con noi</h1>
          <p className="text-muted-foreground">Scegli la data e l&apos;ora perfetta per la tua cena</p>
        </div>

        {card}
      </div>
    </div>
  );
}
