import { AlertTriangle, CalendarClock, Clock, Info, MapPin, Repeat, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { GuestProfile, GuestTag } from "@/server/guest-intelligence";

const TONO: Record<GuestTag["tone"], string> = {
  neutral: "bg-current/10 text-muted-foreground",
  good: "bg-sage/25 text-foreground",
  warning: "bg-accent/20 text-foreground",
};

/**
 * Il profilo dell'ospite, calcolato dalle prenotazioni.
 *
 * Prima al suo posto c'erano cinque numeri presi da colonne che nessuno
 * aggiornava. Qui ogni valore viene dai fatti, e quando un dato non è
 * calcolabile — il valore in euro senza incassi collegati — la casella dice
 * cosa manca invece di riempirsi.
 */
export function GuestProfilePanel({
  profile,
  currency,
}: {
  profile: GuestProfile;
  currency: string;
}) {
  const p = profile;

  return (
    <div className="space-y-4">
      {p.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <span
              key={t.key}
              title={t.why}
              className={cn("rounded-full px-2.5 py-1 text-xs", TONO[t.tone])}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Relazione</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato etichetta="Visite" valore={String(p.visits)} icona={Users} />
          <Dato
            etichetta="Prima visita"
            valore={p.firstVisitAt ? formatDate(new Date(p.firstVisitAt)) : "—"}
            icona={CalendarClock}
          />
          <Dato
            etichetta="Ultima visita"
            valore={p.lastVisitAt ? formatDate(new Date(p.lastVisitAt)) : "—"}
            nota={p.daysSinceLastVisit != null ? `${p.daysSinceLastVisit} giorni fa` : undefined}
            icona={CalendarClock}
          />
          <Dato
            etichetta="Frequenza"
            valore={p.avgDaysBetweenVisits != null ? `ogni ~${p.avgDaysBetweenVisits} gg` : "—"}
            nota={p.avgDaysBetweenVisits == null && p.visits < 2 ? "serve più di una visita" : undefined}
            icona={Repeat}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Come prenota</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato
            etichetta="Coperti medi"
            valore={p.avgPartySize != null ? String(p.avgPartySize) : "—"}
            icona={Users}
          />
          <Dato
            etichetta="Anticipo"
            valore={p.avgLeadTimeDays != null ? `${p.avgLeadTimeDays} gg` : "—"}
            nota="fra prenotazione e visita"
            icona={Clock}
          />
          <Dato
            etichetta="Disdette"
            valore={`${Math.round(p.cancellationRate * 100)}%`}
            nota={`${p.cancellations} su ${p.totalBookings}`}
            allarme={p.cancellationRate >= 0.3 && p.totalBookings >= 3}
          />
          {/* Non un punteggio di affidabilità: i fatti, con la data. «2 su 11,
              l'ultima il 4 agosto» dice a chi legge se è un cliente da
              richiamare o una cosa vecchia — un 18% da solo non lo dice. */}
          <Dato
            etichetta="Assenze"
            valore={`${Math.round(p.noShowRate * 100)}%`}
            nota={
              p.noShows > 0 && p.lastNoShowAt
                ? `${p.noShows} su ${p.totalBookings} · l'ultima il ${formatDate(new Date(p.lastNoShowAt))}`
                : `${p.noShows} su ${p.totalBookings}`
            }
            allarme={p.noShows >= 2}
          />
        </CardContent>
      </Card>

      {(p.preferredWeekday || p.preferredTimeBand || p.preferredRoom || p.preferredTable) && (
        <Card>
          <CardHeader>
            <CardTitle>Abitudini</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {p.preferredWeekday && (
              <Abitudine
                icona={CalendarClock}
                testo={`Viene di ${p.preferredWeekday.label}`}
                quota={p.preferredWeekday.share}
              />
            )}
            {p.preferredTimeBand && (
              <Abitudine
                icona={Clock}
                testo={`Preferisce ${p.preferredTimeBand.band === "cena" ? "la cena" : "il pranzo"}`}
                quota={p.preferredTimeBand.share}
              />
            )}
            {p.preferredRoom && (
              <Abitudine
                icona={MapPin}
                testo={`Si siede in ${p.preferredRoom.name}`}
                quota={p.preferredRoom.share}
              />
            )}
            {p.preferredTable && (
              <Abitudine
                icona={MapPin}
                testo={`Tavolo ${p.preferredTable.label}`}
                quota={p.preferredTable.share}
              />
            )}
            {p.occasions.length > 0 && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Occasioni: {p.occasions.map((o) => `${o.occasion.toLowerCase()} (${o.count})`).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Valore</CardTitle>
        </CardHeader>
        <CardContent>
          {p.estimatedValue ? (
            <div className="grid grid-cols-2 gap-4">
              <Dato
                etichetta="Stima totale"
                valore={formatCurrency(p.estimatedValue.totalCents, currency)}
              />
              <Dato
                etichetta="Stima per visita"
                valore={formatCurrency(p.estimatedValue.avgPerVisitCents, currency)}
              />
              <p className="col-span-2 flex items-start gap-2 text-xs text-tertiary-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Stima sui coperti, calcolata con la spesa media di{" "}
                {formatCurrency(p.estimatedValue.basedOnAvgSpendCents, currency)} dichiarata in
                Impostazioni. Diventerà un dato quando saranno collegati ordini o incassi.
              </p>
            </div>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Non c&apos;è ancora un valore da mostrare: servono gli incassi, oppure la spesa media per
              coperto dichiarata in Impostazioni per averne una stima. Meglio una casella vuota di una
              cifra inventata.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Dato({
  etichetta,
  valore,
  nota,
  icona: Icona,
  allarme = false,
}: {
  etichetta: string;
  valore: string;
  nota?: string;
  icona?: typeof Users;
  allarme?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        {Icona && <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {etichetta}
      </p>
      <p className={cn("mt-0.5 text-lg", allarme ? "text-accent" : "text-foreground")}>{valore}</p>
      {nota && <p className="text-xs text-tertiary-foreground">{nota}</p>}
    </div>
  );
}

function Abitudine({
  icona: Icona,
  testo,
  quota,
}: {
  icona: typeof Users;
  testo: string;
  quota: number;
}) {
  return (
    <p className="flex items-center gap-2">
      <Icona className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
      {testo}
      <span className="text-xs text-tertiary-foreground">
        {Math.round(quota * 100)}% delle visite
      </span>
    </p>
  );
}

/** La storia dell'ospite: solo eventi realmente avvenuti. */
export function GuestTimeline({
  events,
}: {
  events: { at: string; kind: string; title: string; detail: string | null; href?: string }[];
}) {
  const ICONA: Record<string, typeof Users> = {
    visit: Users,
    no_show: AlertTriangle,
    cancelled: AlertTriangle,
    booking_created: CalendarClock,
    waitlist: Clock,
    message: Sparkles,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Storia</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun evento registrato per questo ospite.</p>
        ) : (
          <ol className="space-y-3">
            {events.map((e, i) => {
              const Icona = ICONA[e.kind] ?? CalendarClock;
              return (
                <li key={`${e.at}-${i}`} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full",
                      e.kind === "no_show" || e.kind === "cancelled"
                        ? "bg-accent/20 text-accent"
                        : "bg-current/10 text-muted-foreground",
                    )}
                  >
                    <Icona className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-2 text-xs text-tertiary-foreground">
                        {formatDate(new Date(e.at))}
                      </span>
                    </p>
                    {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <p className="mt-4 flex items-start gap-2 text-xs text-tertiary-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Qui compaiono solo gli eventi che il sistema registra davvero: prenotazioni, visite, assenze,
          attese e messaggi. Ordini, pagamenti e recensioni si aggiungeranno quando esisteranno.
        </p>
      </CardContent>
    </Card>
  );
}
