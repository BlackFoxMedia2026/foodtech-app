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

  /*
    Si accetta l'identificativo **o lo slug**.

    I link che il prodotto genera da solo — il codice da incorporare, le
    campagne, le automazioni — portano l'identificativo, e restano com'erano.
    Ma un ristoratore che vuole mettere il link su Instagram scrive
    «…/book?venue=aurora-bistrot», non un codice di venticinque caratteri
    senza senso: e prima quel link mostrava «Locale non trovato».
  */
  const venue = venueId
    ? await db.venue.findFirst({
        where: { active: true, OR: [{ id: venueId }, { slug: venueId }] },
        select: {
          id: true,
          name: true,
          slug: true,
          brandLogoUrl: true,
          brandAccent: true,
          phone: true,
          email: true,
          largePartyFrom: true,
        },
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
          largePartyFrom={venue.largePartyFrom}
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
    /*
      Due situazioni diverse, due frasi diverse.

      Senza `?venue` non è che il locale non si trova: è che nessuno ha detto
      quale. «Locale non trovato» su `/book` senza parametri era una risposta
      falsa a una domanda che non era stata fatta — e chi ci arrivava per
      sbaglio non capiva né cosa fosse andato storto né cosa fare.
    */
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        {venueId ? (
          <>
            Questo locale non c&apos;è, o non accetta prenotazioni online in questo momento.
            <br />
            Se hai il numero, una telefonata è la strada più breve.
          </>
        ) : (
          <>
            Questo indirizzo va usato col link del ristorante.
            <br />
            Chiedilo a chi ti ha invitato, o cercalo sul suo sito.
          </>
        )}
      </CardContent>
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
