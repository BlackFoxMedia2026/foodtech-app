import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock, Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * La pagina che il cliente vede subito dopo aver prenotato.
 *
 * Era rimasta all'epoca precedente del prodotto, e si vedeva: fondo grigio
 * chiaro con `bg-gradient-to-br from-slate-50`, titolo `text-slate-900` — cioè
 * quasi nero — su una scheda verde scuro, `font-serif`, e le emoji «📧» e
 * «📞» al posto delle icone. Chi prenotava passava da una pagina verde,
 * marchiata, a una grigia di un altro prodotto, nel momento in cui si chiede
 * «è andata a buon fine?».
 *
 * E il **riferimento sbordava fuori dalla pagina** su un telefono:
 * venticinque caratteri senza spazi in un riquadro largo metà schermo.
 *
 * Ora è la stessa pagina di `/book`: stesso fondo, stessa famiglia
 * tipografica, stessi colori — e ogni numero sta dentro il suo riquadro.
 */

/** Il guscio della pagina, uguale a quello di `/book`. */
function Guscio({ isEmbed, children }: { isEmbed: boolean; children: React.ReactNode }) {
  if (isEmbed) return <div className="p-4">{children}</div>;
  return (
    <div className="relative z-0 min-h-screen overflow-hidden bg-background p-4 text-foreground">
      <div className="relative z-10 mx-auto max-w-2xl space-y-6 py-8">{children}</div>
    </div>
  );
}

/** Un dato della prenotazione: etichetta sopra, valore sotto. */
function Dato({ etichetta, valore, monospazio = false }: { etichetta: string; valore: string; monospazio?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="t-etichetta">{etichetta}</p>
      {/* `break-all` perché il riferimento è un codice di venticinque caratteri
          senza spazi: senza questo uscivano dalla pagina, non dal riquadro. */}
      <p className={monospazio ? "break-all font-mono text-sm" : "t-corpo font-semibold"}>{valore}</p>
    </div>
  );
}

function NonTrovata({ isEmbed }: { isEmbed: boolean }) {
  return (
    <Guscio isEmbed={isEmbed}>
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <p className="t-corpo">Questa prenotazione non si trova.</p>
          <p className="t-nota">
            Il link potrebbe essere incompleto. Se hai il numero del ristorante, una telefonata è la strada
            più breve.
          </p>
          {!isEmbed && (
            <Button asChild variant="accent">
              <Link href="/">Torna alla homepage</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </Guscio>
  );
}

export default async function ConfirmationPage(props: { searchParams?: { bookingId?: string; embed?: string } }) {
  const bookingId = props.searchParams?.bookingId;
  const isEmbed = props.searchParams?.embed === "1";

  if (!bookingId) return <NonTrovata isEmbed={isEmbed} />;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { guest: true, venue: true },
  });

  if (!booking) return <NonTrovata isEmbed={isEmbed} />;

  const isConfirmed = booking.status === "CONFIRMED";
  const venue = booking.venue;
  const social = [
    venue.instagramUrl && { url: venue.instagramUrl, icona: Instagram, nome: "Instagram" },
    venue.facebookUrl && { url: venue.facebookUrl, icona: Facebook, nome: "Facebook" },
    venue.googleBusinessUrl && { url: venue.googleBusinessUrl, icona: MapPin, nome: "Google Maps" },
  ].filter(Boolean) as Array<{ url: string; icona: typeof Instagram; nome: string }>;

  return (
    <Guscio isEmbed={isEmbed}>
      <Card>
        <CardContent className="space-y-6 py-10 text-center">
          <div className="flex justify-center">
            {isConfirmed ? (
              <CheckCircle2 className="h-16 w-16 text-sage-strong" aria-hidden="true" />
            ) : (
              <Clock className="h-16 w-16 text-accent-strong" aria-hidden="true" />
            )}
          </div>

          <div className="space-y-2">
            <h1 className="text-display text-3xl font-bold">
              {isConfirmed ? "La tua prenotazione è confermata" : "La tua richiesta è arrivata"}
            </h1>
            {/* Il ringraziamento c'è in **entrambi** i rami. Nella prima
                versione di questa riscrittura l'avevo lasciato solo nel ramo
                confermato, e i percorsi e2e l'hanno preso: chi manda una
                richiesta e aspetta una conferma è esattamente la persona a
                cui va detto grazie. */}
            <p className="text-muted-foreground">
              {isConfirmed
                ? `Grazie per aver scelto ${venue.name}`
                : `Grazie — ${venue.name} la conferma entro 24 ore`}
            </p>
          </div>

          {!isConfirmed && (
            <p className="t-corpo text-left">
              La tua richiesta verrà confermata via email entro <strong>24 ore</strong>. Se serve, ti
              chiamiamo al numero che hai lasciato.
            </p>
          )}

          <div className="riquadro space-y-4 p-5 text-left">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Dato etichetta={isConfirmed ? "Data" : "Data richiesta"} valore={formatDate(booking.startsAt)} />
              <Dato etichetta={isConfirmed ? "Ora" : "Ora richiesta"} valore={formatTime(booking.startsAt)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Dato etichetta="Persone" valore={String(booking.partySize)} />
              <Dato etichetta="Riferimento" valore={booking.reference} monospazio />
            </div>
            {booking.guest?.email && (
              <Dato
                etichetta={isConfirmed ? "Email di conferma" : "Email di contatto"}
                valore={booking.guest.email}
              />
            )}
          </div>

          {/* Il promemoria e il «ti chiamiamo» sono due cose diverse: la prima
              è informazione quieta, la seconda avvisa che potrebbe squillare
              il telefono. In tavolozza, con il crema sopra la tinta. */}
          <div
            className={
              isConfirmed
                ? "flex items-start gap-3 rounded-md border border-cream/25 p-4 text-left text-sm text-cream"
                : "flex items-start gap-3 rounded-md border border-accent/50 bg-accent/20 p-4 text-left text-sm text-cream"
            }
          >
            {isConfirmed ? (
              <>
                <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Riceverai un promemoria 24 ore prima della tua prenotazione.</span>
              </>
            ) : (
              <>
                <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Se abbiamo bisogno di contattarti, chiamiamo
                  {booking.guest?.phone ? ` al ${booking.guest.phone}` : " al numero che hai lasciato"}.
                </span>
              </>
            )}
          </div>

          {!isEmbed && (
            <Button asChild variant="accent" size="lg">
              <Link href="/">Torna alla homepage</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {!isEmbed && (venue.phone || venue.email || social.length > 0) && (
        <div className="space-y-3 text-center">
          <p className="t-nota">Hai domande? Contatta il ristorante</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
            {venue.phone && (
              <a href={`tel:${venue.phone}`} className="inline-flex items-center gap-2 hover:underline">
                <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                {venue.phone}
              </a>
            )}
            {venue.email && (
              <a href={`mailto:${venue.email}`} className="inline-flex items-center gap-2 break-all hover:underline">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                {venue.email}
              </a>
            )}
          </div>
          {social.length > 0 && (
            <div className="flex items-center justify-center gap-4">
              {social.map(({ url, icona: Icona, nome }) => (
                <a
                  key={nome}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={nome}
                  className="tocco-comodo text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icona className="h-5 w-5" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </Guscio>
  );
}
