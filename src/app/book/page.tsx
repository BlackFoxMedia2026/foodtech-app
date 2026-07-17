import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { AmbientBackground } from "@/components/shell/ambient-background";
import { db } from "@/lib/db";

export default async function BookPage(props: { searchParams?: { venue?: string } }) {
  const venueSlug = props.searchParams?.venue;

  let selectedVenue = null;
  if (venueSlug) {
    selectedVenue = await db.venue.findFirst({
      where: { slug: venueSlug, active: true },
      select: { id: true, name: true, slug: true },
    });
  } else {
    selectedVenue = await db.venue.findFirst({
      where: { active: true },
      select: { id: true, name: true, slug: true },
    });
  }

  const allVenues = await db.venue.findMany({
    where: { active: true },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="dark relative z-0 min-h-screen overflow-hidden bg-background p-4 text-foreground">
      <AmbientBackground />

      <div className="relative z-10 mx-auto max-w-2xl space-y-6 py-8">
        <div className="text-center space-y-2">
          <h1 className="text-display text-4xl font-bold">Prenota con noi</h1>
          <p className="text-muted-foreground">Scegli la data e l&apos;ora perfetta per la tua cena</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Nuova prenotazione</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedVenue ? (
              <PublicBookingForm
                venues={allVenues}
                selectedVenueId={selectedVenue.id}
                selectedVenueName={selectedVenue.name}
              />
            ) : (
              <div className="text-center text-muted-foreground py-8">Nessun locale disponibile al momento</div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground">
          <p>Hai domande? Chiamaci o inviaci un messaggio</p>
        </div>
      </div>
    </div>
  );
}
