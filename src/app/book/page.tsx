import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicBookingForm } from "@/components/bookings/public-booking-form";
import { db } from "@/lib/db";

export default async function BookPage(props: { searchParams?: { venue?: string; embed?: string } }) {
  const venueId = props.searchParams?.venue;
  const isEmbed = props.searchParams?.embed === "1";

  const venue = venueId
    ? await db.venue.findFirst({
        where: { id: venueId, active: true },
        select: { id: true, name: true, slug: true },
      })
    : null;

  const card = venue ? (
    <Card className="shadow-lg border-slate-200">
      <CardHeader>
        <CardTitle className="text-2xl">Nuova prenotazione</CardTitle>
      </CardHeader>
      <CardContent>
        <PublicBookingForm venueId={venue.id} venueName={venue.name} embed={isEmbed} />
      </CardContent>
    </Card>
  ) : (
    <Card className="shadow-lg border-slate-200">
      <CardContent className="text-center text-slate-500 py-8">Locale non trovato</CardContent>
    </Card>
  );

  if (isEmbed) {
    return <div className="p-4">{card}</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-serif font-bold text-slate-900">Prenota con noi</h1>
          <p className="text-slate-600">Scegli la data e l&apos;ora perfetta per la tua cena</p>
        </div>

        {card}

        <div className="text-center text-sm text-slate-500">
          <p>Hai domande? Chiamaci o inviaci un messaggio</p>
        </div>
      </div>
    </div>
  );
}
