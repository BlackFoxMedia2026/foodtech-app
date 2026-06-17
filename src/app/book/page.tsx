import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif font-bold text-slate-900">Prenota con noi</h1>
          <p className="text-slate-600">Scegli la data e l&apos;ora perfetta per la tua cena</p>
        </div>

        <Card className="shadow-lg border-slate-200">
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
              <div className="text-center text-slate-500 py-8">Nessun locale disponibile al momento</div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-sm text-slate-500">
          <p>Hai domande? Chiamaci o inviaci un messaggio</p>
        </div>
      </div>
    </div>
  );
}
