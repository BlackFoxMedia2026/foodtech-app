import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Cake, Download, Mail, Phone, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGuestProfile, getGuestTimeline } from "@/server/guest-intelligence";
import { GuestProfilePanel, GuestTimeline } from "@/components/guests/guest-profile-panel";
import { Badge } from "@/components/ui/badge";
import { Etichetta } from "@/components/ui/etichetta";
import { Blocco } from "@/components/ui/blocco";
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
            <p className="t-etichetta">Ospite</p>
            <h1 className="text-display text-3xl">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <LoyaltyPill tier={g.loyaltyTier} />
              {g.anonymizedAt && (
                <Badge tone="neutral" className="text-muted-foreground">
                  dati cancellati su richiesta
                </Badge>
              )}
              {/* Un'allergia non è un tag: è un fatto che cambia il servizio
                  adesso. Forma quadrata e icona — il linguaggio dei segnali —
                  così non si legge come «VIP», che è un'opinione, né come
                  «abituale», che è una formula. */}
              {g.allergies && (
                <Etichetta linguaggio="segnale" icona={AlertTriangle}>
                  {g.allergies}
                </Etichetta>
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

      {/*
        La fascia del leggio (§28 del brief).

        La scheda rispondeva a «quali dati abbiamo di questa persona»: undici
        riquadri, ognuno con la sua verità, e per sapere se aveva un'allergia
        bisognava trovare il riquadro giusto. La domanda vera è «chi è questa
        persona **per il ristorante**», e chi la fa ha dieci secondi.

        Cinque cose, sempre le stesse, sempre qui: quanto è di casa, quante
        volte è venuta, quando l'ultima volta, cosa non può mangiare, quante
        volte non si è presentata. Non un dato nuovo — tutti erano già sulla
        pagina, sparsi in tre riquadri diversi.

        Si mostra solo quello che c'è: «0 assenze» non è un'informazione.
      */}
      <ContestoServizio
        tier={g.loyaltyTier}
        visite={profile?.visits ?? null}
        ultimaVisita={profile?.lastVisitAt ?? null}
        giorniDaUltima={profile?.daysSinceLastVisit ?? null}
        allergie={g.allergies}
        assenze={profile?.noShows ?? 0}
        ultimaAssenza={profile?.lastNoShowAt ?? null}
      />

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

          {/*
            Il valore sta qui e non a destra per due ragioni. La prima è di
            senso: punti, gift card e movimenti rispondono alla stessa domanda
            — quanto vale questa persona — e stavano in due colonne diverse.
            La seconda è che questa colonna finiva con quattrocento pixel di
            vuoto sotto «Contatti» mentre l'altra scorreva.
          */}
          <LoyaltyPanel
            guestId={g.id}
            guestName={g.firstName}
            saldo={saldo}
            currency={ctx.venue.currency}
            canAdjust={can(ctx.role, "manage_venue")}
          />

          {/* Chiuso: i movimenti si guardano quando si cerca un pagamento, non
              ogni volta che si apre una scheda. Da chiuso dice quanti sono. */}
          <Blocco
            titolo="Movimenti"
            valore={
              g.payments.length === 0
                ? "nessuno"
                : `${g.payments.length} ${g.payments.length === 1 ? "movimento" : "movimenti"}`
            }
          >
            {g.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun pagamento registrato.</p>
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
          </Blocco>
        </div>

        <div className="space-y-6 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          {profile && <GuestProfilePanel profile={profile} currency={ctx.venue.currency} />}

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
        </div>
      </div>
    </div>
  );
}

/**
 * Le cinque cose che servono al leggio, e nient'altro.
 *
 * Sono le stesse che compaiono nel Servizio e sulla prenotazione
 * (`lib/cosa-sapere`), qui messe in fila in cima alla scheda: chi apre una
 * scheda mentre qualcuno è alla porta non ha tempo di leggere undici
 * riquadri.
 *
 * Ogni voce si mostra **solo se c'è**. «0 assenze» non è un'informazione: è
 * rumore che allontana quella vera — la stessa regola del briefing in
 * Panoramica.
 */
function ContestoServizio({
  tier,
  visite,
  ultimaVisita,
  giorniDaUltima,
  allergie,
  assenze,
  ultimaAssenza,
}: {
  tier: string;
  visite: number | null;
  ultimaVisita: string | null;
  giorniDaUltima: number | null;
  allergie: string | null;
  assenze: number;
  ultimaAssenza: string | null;
}) {
  const voci: { etichetta: string; valore: string; nota?: string; allarme?: boolean }[] = [];

  if (tier === "VIP" || tier === "AMBASSADOR") {
    voci.push({
      etichetta: "Livello",
      valore: tier === "AMBASSADOR" ? "Ambassador" : "VIP",
      nota: "assegnato dal locale",
    });
  }
  if (visite != null && visite > 0) {
    voci.push({ etichetta: "Visite", valore: String(visite) });
  }
  if (ultimaVisita) {
    voci.push({
      etichetta: "Ultima visita",
      valore: formatDate(new Date(ultimaVisita)),
      nota:
        giorniDaUltima != null
          ? giorniDaUltima === 0
            ? "oggi"
            : `${giorniDaUltima} ${giorniDaUltima === 1 ? "giorno" : "giorni"} fa`
          : undefined,
    });
  }
  if (allergie) {
    voci.push({ etichetta: "Non può mangiare", valore: allergie, allarme: true });
  }
  if (assenze > 0) {
    voci.push({
      etichetta: assenze === 1 ? "Assenza" : "Assenze",
      valore: String(assenze),
      // Due assenze di due anni fa non sono due assenze di un mese: la data
      // è metà dell'informazione.
      nota: ultimaAssenza ? `l'ultima il ${formatDate(new Date(ultimaAssenza))}` : undefined,
      allarme: true,
    });
  }

  // Una persona nuova, senza allergie e senza assenze: non c'è niente da dire,
  // e una fascia vuota direbbe che qualcosa non ha caricato.
  if (voci.length === 0) return null;

  return (
    <section
      aria-label="Cosa sapere di questa persona"
      className="fissa riquadro comodo flex flex-wrap gap-x-8 gap-y-3 bg-current/[0.04]"
    >
      {voci.map((v) => (
        <div key={v.etichetta}>
          <p className="t-etichetta">{v.etichetta}</p>
          <p className={v.allarme ? "text-accent" : undefined}>
            {v.valore}
            {v.nota && <span className="t-nota"> · {v.nota}</span>}
          </p>
        </div>
      ))}
    </section>
  );
}
