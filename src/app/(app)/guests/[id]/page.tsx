import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Cake, Download, Mail, Phone, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGuestProfile, getGuestTimeline } from "@/server/guest-intelligence";
import { GuestProfilePanel, GuestTimeline } from "@/components/guests/guest-profile-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoyaltyPill } from "@/components/guests/loyalty-pill";
import { EditGuestDialog } from "@/components/guests/edit-guest-dialog";
import { TagEditor } from "@/components/guests/tag-editor";
import { StatusBadge } from "@/components/bookings/status-badge";
import { can, getActiveVenue } from "@/lib/tenant";
import { getSaldoFedelta } from "@/server/loyalty";
import { LoyaltyPanel } from "@/components/guests/loyalty-panel";
import { ErasureDialog } from "@/components/guests/erasure-dialog";
import { getGuest } from "@/server/guests";
import { formatCurrency, formatDate, formatDateTime, initials } from "@/lib/utils";
import { notaPreferenze } from "@/lib/cosa-sapere";

const PAYMENT_KIND_LABEL = {
  DEPOSIT: "Caparra",
  PREAUTH: "Preautorizzazione",
  TICKET: "Ticket",
  REFUND: "Rimborso",
  PACKAGE: "Pacchetto",
} as const;

const PAYMENT_STATUS_TONE = {
  PENDING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
} as const;



export default async function GuestDetail({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const g = await getGuest(ctx.venueId, params.id);
  if (!g) notFound();

  const [profile, timeline, saldo] = await Promise.all([
    getGuestProfile(ctx.venueId, params.id),
    getGuestTimeline(ctx.venueId, params.id),
    getSaldoFedelta(ctx.venueId, params.id),
  ]);

  const name = `${g.firstName} ${g.lastName ?? ""}`.trim();

  return (
    <div className="schermo animate-fade-in gap-4">
      <Button asChild variant="ghost" size="sm" className="fissa self-start">
        <Link href="/guests"><ArrowLeft className="h-4 w-4" /> CRM ospiti</Link>
      </Button>

      <header className="fissa flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base">{initials(name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Ospite</p>
            <h1 className="text-display text-3xl">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LoyaltyPill tier={g.loyaltyTier} />
              {g.anonymizedAt && (
                <Badge tone="neutral" className="text-muted-foreground">
                  dati cancellati su richiesta
                </Badge>
              )}
              {g.allergies && (
                <Badge tone="danger" className="badge-dot">{g.allergies}</Badge>
              )}
            </div>
            <div className="mt-3">
              <TagEditor guestId={g.id} tags={g.tags} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Riservata al manager: cancellare i dati di una persona non è un
              gesto da fare di corsa fra due tavoli. */}
          {can(ctx.role, "manage_venue") && (
            <Button asChild variant="outline" size="sm">
              {/* La richiesta di accesso ai propri dati: si scarica e si gira
                  a chi l'ha chiesta. */}
              <a href={`/api/guests/${g.id}/export`} download>
                <Download className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Esporta i dati
              </a>
            </Button>
          )}
          {can(ctx.role, "manage_venue") && !g.anonymizedAt && (
            <ErasureDialog guestId={g.id} guestName={name} />
          )}
          <EditGuestDialog
          guest={{
            id: g.id,
            firstName: g.firstName,
            lastName: g.lastName,
            email: g.email,
            phone: g.phone,
            birthday: g.birthday,
            loyaltyTier: g.loyaltyTier,
            allergies: g.allergies,
            privateNotes: g.privateNotes,
            marketingOptIn: g.marketingOptIn,
            preferences: g.preferences,
          }}
        />
        </div>
      </header>

      <div className="fill min-h-0 space-y-6 overflow-y-auto pr-0.5 lg:grid lg:grid-cols-[1fr_1.6fr] lg:gap-6 lg:space-y-0 lg:overflow-hidden">
        <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <Card>
            <CardHeader><CardTitle>Contatti</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {g.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {g.email}</p>}
              {g.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {g.phone}</p>}
              {g.birthday && <p className="flex items-center gap-2"><Cake className="h-4 w-4 text-muted-foreground" /> {formatDate(g.birthday)}</p>}
              <p className="text-xs text-muted-foreground">
                Marketing: {g.marketingOptIn ? "consenso attivo" : "non iscritto"}
              </p>
            </CardContent>
          </Card>

          {notaPreferenze(g.preferences) && (
            <Card>
              <CardHeader><CardTitle>Preferenze</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{notaPreferenze(g.preferences)}</CardContent>
            </Card>
          )}

          {g.privateNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Note riservate
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{g.privateNotes}</CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          {profile && <GuestProfilePanel profile={profile} currency={ctx.venue.currency} />}

          <LoyaltyPanel
            guestId={g.id}
            guestName={g.firstName}
            saldo={saldo}
            currency={ctx.venue.currency}
            canAdjust={can(ctx.role, "manage_venue")}
          />

          <GuestTimeline events={timeline} />

          <Card>
            <CardHeader><CardTitle>Storico visite</CardTitle></CardHeader>
            <CardContent>
              {g.bookings.length === 0 ? (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Nessuna prenotazione storica.
                </p>
              ) : (
                <ul className="divide-y">
                  {g.bookings.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{formatDateTime(b.startsAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.partySize} pers. · {b.table?.label ?? "—"}
                        </p>
                      </div>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Movimenti</CardTitle></CardHeader>
            <CardContent>
              {g.payments.length === 0 ? (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Nessun pagamento registrato.
                </p>
              ) : (
                <ul className="divide-y">
                  {g.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{PAYMENT_KIND_LABEL[p.kind]}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatCurrency(p.amountCents, p.currency)}</span>
                        <Badge tone={PAYMENT_STATUS_TONE[p.status]}>{p.status}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

