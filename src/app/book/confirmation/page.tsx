import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { formatDate, formatTime } from "@/lib/utils";

export default async function ConfirmationPage(props: { searchParams?: { bookingId?: string } }) {
  const bookingId = props.searchParams?.bookingId;

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-600 mb-4">Prenotazione non trovata</p>
            <Button asChild>
              <Link href="/">Torna alla homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { guest: true, venue: true },
  });

  if (!booking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-red-600 mb-4">Prenotazione non trovata</p>
            <Button asChild>
              <Link href="/">Torna alla homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isConfirmed = booking.status === "CONFIRMED";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="mx-auto max-w-2xl">
        <Card className="shadow-lg border-slate-200">
          <CardContent className="pt-12 pb-12">
            <div className="text-center space-y-6">
              {isConfirmed ? (
                <>
                  <div className="flex justify-center">
                    <CheckCircle2 className="h-16 w-16 text-green-500" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">
                      La tua prenotazione è confermata!
                    </h1>
                    <p className="text-slate-600">Grazie per aver scelto {booking.venue.name}</p>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-6 space-y-4 text-left">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Data</p>
                        <p className="text-lg font-semibold text-slate-900">{formatDate(booking.startsAt)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Ora</p>
                        <p className="text-lg font-semibold text-slate-900">{formatTime(booking.startsAt)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Persone</p>
                        <p className="text-lg font-semibold text-slate-900">{booking.partySize}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Referenza</p>
                        <p className="text-lg font-semibold text-slate-900">{booking.reference}</p>
                      </div>
                    </div>
                    {booking.guest?.email && (
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Email di conferma</p>
                        <p className="text-slate-900">{booking.guest.email}</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-900">
                      📧 Riceverai un promemoria 24 ore prima della tua prenotazione
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-center">
                    <Clock className="h-16 w-16 text-amber-500" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-serif font-bold text-slate-900 mb-2">Prenotazione in sospeso</h1>
                    <p className="text-slate-600">Il nostro team sta verificando la tua richiesta</p>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-6 space-y-4 text-left">
                    <p className="text-slate-900">
                      Grazie per la tua prenotazione! La tua richiesta verrà confermata dal nostro team entro{" "}
                      <strong>24 ore</strong> tramite email.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Data richiesta</p>
                        <p className="text-lg font-semibold text-slate-900">{formatDate(booking.startsAt)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Ora richiesta</p>
                        <p className="text-lg font-semibold text-slate-900">{formatTime(booking.startsAt)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Numero persone</p>
                        <p className="text-lg font-semibold text-slate-900">{booking.partySize}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Referenza</p>
                        <p className="text-lg font-semibold text-slate-900">{booking.reference}</p>
                      </div>
                    </div>
                    {booking.guest?.email && (
                      <div>
                        <p className="text-sm text-slate-600 font-medium">Email di contatto</p>
                        <p className="text-slate-900">{booking.guest.email}</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-900">
                      📧 Se abbiamo bisogno di contattarti, chiameremo al {booking.guest?.phone}
                    </p>
                  </div>
                </>
              )}

              <Button asChild size="lg" className="mt-4">
                <Link href="/">Torna alla homepage</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center text-sm text-slate-500">
          <p>Hai domande? Contattaci direttamente</p>
          <p className="mt-2">
            {booking.venue.phone && <span>📞 {booking.venue.phone}</span>}
            {booking.venue.phone && booking.venue.email && <span> • </span>}
            {booking.venue.email && <span>📧 {booking.venue.email}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
