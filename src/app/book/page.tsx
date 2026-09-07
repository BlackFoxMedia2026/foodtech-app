import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { db } from "@/lib/db";

export default async function BookPage(props: {
  searchParams?: { venue?: string; embed?: string; c?: string };
}) {
  const venueId = props.searchParams?.venue;
  const isEmbed = props.searchParams?.embed === "1";
  // `c` è la campagna che ha portato qui questa persona: viaggia nel link
  // dentro l'email. La verifica che sia di questo locale la fa la route.
  const campaignId = props.searchParams?.c;

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
          campaignId={campaignId}
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
    <div className="relative z-0 min-h-screen overflow-hidden bg-background p-4 text-foreground">
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
