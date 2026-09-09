import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Clock, Phone, Mail, NotebookText } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoyaltyPill } from "@/components/guests/loyalty-pill";
import { CopyButton } from "@/components/ui/copy-button";
import { Button } from "@/components/ui/button";
import { StatusBadge, SourceBadge } from "@/components/bookings/status-badge";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { cosaSapere, etichettaOccasione } from "@/lib/cosa-sapere";
import { CosaSapere } from "@/components/guests/cosa-sapere";

export default async function BookingDetail({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const item = await db.booking.findFirst({
    where: { id: params.id, venueId: ctx.venueId },
    include: { guest: true, table: true, payments: true },
  });
  if (!item) notFound();

  const guestName = item.guest ? `${item.guest.firstName} ${item.guest.lastName ?? ""}`.trim() : "Walk-in";

  return (
    <div className="schermo animate-fade-in gap-4">
      <div className="fissa">
        <Button asChild variant="ghost" size="sm">
          <Link href="/bookings">
            <ArrowLeft className="h-4 w-4" /> Tutte le prenotazioni
          </Link>
        </Button>
      </div>

      <header className="fissa flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="t-etichetta">Prenotazione</p>
          <h1 className="text-display text-3xl">{guestName}</h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(item.startsAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge source={item.source} />
          <StatusBadge status={item.status} />
        </div>
      </header>

      <div className="fill-scroll space-y-6 pr-0.5">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Dettagli servizio</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <Info icon={Users} label="Persone" value={String(item.partySize)} />
              <Info icon={Clock} label="Durata" value={`${item.durationMin} min`} />
              <Info label="Tavolo" value={item.table?.label ?? "Da assegnare"} />
              {/* «BIRTHDAY» è come lo scrive il database, non come si dice. */}
              <Info label="Occasione" value={etichettaOccasione(item.occasion) ?? "—"} />
              {item.depositCents > 0 && (
                <Info label="Caparra" value={formatCurrency(item.depositCents, ctx.venue.currency)} />
              )}
              {/*
                Il riferimento **per intero**, e copiabile.

                Era troncato a dieci caratteri, e il cliente invece lo riceve
                completo — nella pagina di conferma e nell'email. Quindi quando
                telefonava leggendo la sua referenza, in sala si vedeva una
                stringa diversa: dieci caratteri su venticinque, impossibili da
                confrontare a voce.
              */}
              <div className="col-span-2">
                <p className="t-etichetta">Riferimento</p>
                <div className="mt-0.5 flex items-center gap-1">
                  <code className="break-all font-mono text-xs">{item.reference}</code>
                  <CopyButton value={item.reference} variant="ghost" size="sm" aria-label="Copia il riferimento" />
                </div>
                <p className="t-nota">È quello che il cliente ha ricevuto per email.</p>
              </div>
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
              {/*
                Il livello con la regola che vale in tutto il prodotto, non la
                colonna del database.

                Qui c'era una pillola d'oro con scritto «REGULAR»: il valore
                grezzo del database, e in **oro**, che è il colore del VIP. Un
                cliente normale sembrava un cliente da trattare col guanto
                bianco. `LoyaltyPill` ha già deciso che NEW e REGULAR non si
                mostrano — sono deduzioni, e le deduzioni le fa il profilo
                dalle prenotazioni vere.
              */}
              {item.guest && (
                <div className="flex flex-wrap gap-2">
                  <LoyaltyPill tier={item.guest.loyaltyTier} />
                  <Badge tone="neutral">{item.guest.totalVisits} visite</Badge>
                </div>
              )}

              {/*
                Cosa sapere di questa persona, come in Servizio e in Sala.
                L'allergia era una pillola rossa fra le altre: adesso è la prima
                riga di un elenco, con la stessa forma che ha nelle schermate
                dove si lavora.
              */}
              {item.guest && (
                <CosaSapere
                  disposizione="colonna"
                  righe={cosaSapere({
                    allergies: item.guest.allergies,
                    privateNotes: item.guest.privateNotes,
                    preferences: item.guest.preferences,
                    visits: item.guest.totalVisits,
                    noShows: item.guest.noShowCount,
                    loyaltyTier: item.guest.loyaltyTier,
                    occasion: item.occasion,
                  })}
                />
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
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: string }) {
  return (
    <div>
      <p className="t-etichetta">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-base">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {value}
      </p>
    </div>
  );
}
