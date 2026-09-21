import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingForm } from "@/components/bookings/booking-form";

/**
 * Nuova prenotazione.
 *
 * ## Quello che arriva dall'indirizzo
 *
 * `?guest=<id>` e `?phone=<numero>`: sono i dati che si sanno già quando si
 * arriva qui **da una telefonata** — dal riquadro della chiamata in Servizio o
 * dalle chiamate perse.
 *
 * Questa pagina li ignorava. I pulsanti «Prenota» del telefono li passavano e
 * il modulo si apriva vuoto: chi risponde doveva ridigitare il numero mentre
 * ascoltava la persona, che è il momento in cui si sbaglia una cifra. Un
 * collegamento che sembra portare qualcosa e non lo porta è peggio di un
 * collegamento che non c'è.
 *
 * Il nome si legge **dal database** e non dall'indirizzo: un nome preso da una
 * query finirebbe in una prenotazione vera senza che nessuno l'abbia scritto.
 * Dall'indirizzo si prende solo *di chi si tratta*, e chi si tratta lo dice il
 * database.
 *
 * `?chiamata=<id>` è la terza, e chiude il giro del telefono: la prenotazione
 * nata da qui si lega a quella telefonata, che nello storico smette di essere
 * «nessuno ha risposto» e spegne la richiamata in coda. Si verifica che sia
 * una chiamata **di questo locale** prima di passarla al modulo, come per
 * l'ospite.
 */
export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: { guest?: string; phone?: string; chiamata?: string };
}) {
  const ctx = await getActiveVenue();

  const [tables, ospite, chiamata] = await Promise.all([
    db.table.findMany({
      where: { venueId: ctx.venueId, active: true },
      select: { id: true, label: true, seats: true },
      orderBy: { label: "asc" },
    }),
    /* Filtrato per locale, come ogni lettura: un identificativo altrui non
       deve poter riempire un modulo qui dentro. */
    searchParams.guest
      ? db.guest.findFirst({
          where: { id: searchParams.guest, venueId: ctx.venueId },
          select: { firstName: true, lastName: true, phone: true },
        })
      : null,
    searchParams.chiamata
      ? db.phoneCall.findFirst({
          where: { id: searchParams.chiamata, venueId: ctx.venueId },
          select: { id: true },
        })
      : null,
  ]);

  const iniziale = {
    telefono: ospite?.phone ?? searchParams.phone ?? undefined,
    nome: ospite?.firstName ?? undefined,
    cognome: ospite?.lastName ?? undefined,
    chiamataId: chiamata?.id,
  };

  return (
    <div className="schermo animate-fade-in mx-auto w-full max-w-2xl gap-3">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/bookings">
          <ArrowLeft className="h-4 w-4" /> Torna alle prenotazioni
        </Link>
      </Button>
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="fissa">
          <CardTitle>Nuova prenotazione</CardTitle>
        </CardHeader>
        <CardContent className="fill-scroll pr-0.5">
          <BookingForm tables={tables} iniziale={iniziale} />
        </CardContent>
      </Card>
    </div>
  );
}
