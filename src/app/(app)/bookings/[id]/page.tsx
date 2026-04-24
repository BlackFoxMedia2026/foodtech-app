import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Clock, Phone, Mail, NotebookText } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge, SourceBadge } from "@/components/bookings/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default async function BookingDetail({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const item = await db.booking.findFirst({
    where: { id: params.id, venueId: ctx.venueId },
    include: { guest: true, table: true, payments: true },
  });
  if (!item) notFound();

  const guestName = item.guest ? `${item.guest.firstName} ${item.guest.lastName ?? ""}`.trim() : "Walk-in";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/bookings">
            <ArrowLeft className="h-4 w-4" /> Tutte le prenotazioni
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Prenotazione</p>
          <h1 className="text-display text-3xl">{guestName}</h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(item.startsAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge source={item.source} />
          <StatusBadge status={item.status} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Dettagli servizio</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <Info icon={Users} label="Persone" value={String(item.partySize)} />
            <Info icon={Clock} label="Durata" value={`${item.durationMin} min`} />
            <Info label="Tavolo" value={item.table?.label ?? "Da assegnare"} />
            <Info label="Occasione" value={item.occasion ?? "—"} />
            {item.depositCents > 0 && (
              <Info label="Caparra" value={formatCurrency(item.depositCents, ctx.venue.currency)} />
            )}
            <Info label="Riferimento" value={item.reference.slice(0, 10)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ospite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-base font-medium">{guestName}</p>
            {item.guest?.phone && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {item.guest.phone}
              </p>
            )}
            {item.guest?.email && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" /> {item.guest.email}
              </p>
            )}
            {item.guest && (
              <div className="flex flex-wrap gap-2">
                <Badge tone="gold">{item.guest.loyaltyTier}</Badge>
                <Badge tone="neutral">{item.guest.totalVisits} visite</Badge>
                {item.guest.allergies && <Badge tone="danger">{item.guest.allergies}</Badge>}
              </div>
            )}
            {item.guest && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/guests/${item.guest.id}`}>Apri scheda CRM</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {(item.notes || item.internalNotes) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <NotebookText className="h-4 w-4" /> Note
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {item.notes && <p>{item.notes}</p>}
            {item.internalNotes && (
              <p className="rounded-md bg-secondary px-3 py-2 text-muted-foreground">
                Interno: {item.internalNotes}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-base">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {value}
      </p>
    </div>
  );
}
