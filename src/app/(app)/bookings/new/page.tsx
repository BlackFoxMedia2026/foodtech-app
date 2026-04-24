import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingForm } from "@/components/bookings/booking-form";

export default async function NewBookingPage() {
  const ctx = await getActiveVenue();
  const tables = await db.table.findMany({
    where: { venueId: ctx.venueId, active: true },
    select: { id: true, label: true, seats: true },
    orderBy: { label: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <Button asChild variant="ghost" size="sm">
        <Link href="/bookings">
          <ArrowLeft className="h-4 w-4" /> Torna alle prenotazioni
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>Nuova prenotazione</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingForm tables={tables} />
        </CardContent>
      </Card>
    </div>
  );
}
