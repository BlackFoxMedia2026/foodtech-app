import { headers } from "next/headers";
import Link from "next/link";
import { Palette, Wifi } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CopyButton } from "@/components/ui/copy-button";
import { ServiceOrganizationSettings } from "@/components/settings/service-organization-settings";
import { AvgSpendSettings } from "@/components/settings/avg-spend-settings";
import { LoyaltySettings } from "@/components/settings/loyalty-settings";
import { ReviewLinksSettings } from "@/components/settings/review-links-settings";
import { TeamSettings } from "@/components/settings/team-settings";
import { BookingWindowSettings } from "@/components/settings/booking-window-settings";
import { QueuePanel } from "@/components/settings/queue-panel";
import { jobQueueHealth } from "@/server/jobs/queue";
import { can } from "@/lib/tenant";
import { listRooms } from "@/server/rooms";
import { listReviewLinks } from "@/server/reviews";
import { listInviti, listTeam } from "@/server/team";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABELS = {
  MANAGER: "Manager",
  RECEPTION: "Reception",
  WAITER: "Cameriere",
  MARKETING: "Marketing",
  READ_ONLY: "Sola lettura",
} as const;

export default async function SettingsPage() {
  const ctx = await getActiveVenue();

  // L'indirizzo pubblico di questa installazione serve due volte: nel codice
  // da incollare sul sito del locale, e nei link d'invito al team.
  const hdrs = headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  const [venues, team, inviti, shifts, rooms, tablesCount, queueHealth, reviewLinks] = await Promise.all([
    db.venue.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    listTeam(ctx.venueId, ctx.userId),
    // Gli inviti aperti col link già composto: serve l'indirizzo pubblico di
    // questa installazione, che solo il server conosce.
    can(ctx.role, "manage_venue") ? listInviti(ctx.venueId, baseUrl) : Promise.resolve([]),
    db.shift.findMany({
      where: { venueId: ctx.venueId, weekday: 0 },
      orderBy: { startMinute: "asc" },
    }),
    listRooms(ctx.venueId),
    db.table.count({ where: { venueId: ctx.venueId, active: true } }),
    jobQueueHealth(ctx.venueId),
    listReviewLinks(ctx.venueId),
  ]);

  const embedSrc = `${baseUrl}/book?venue=${ctx.venueId}&embed=1`;
  const embedSnippet = `<iframe src="${embedSrc}" width="480" height="820" style="border:0;max-width:100%" title="Prenota un tavolo"></iframe>`;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Configurazione</p>
        <h1 className="text-display text-3xl">Impostazioni</h1>
      </header>

      {ctx.venue.onboardingStatus === "SKIPPED" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 p-4">
          <p className="text-sm font-medium">Completa la personalizzazione del brand</p>
          <Button asChild variant="accent" size="sm">
            <Link href="/settings/brand">Completa ora</Link>
          </Button>
        </div>
      )}

      <Indice />

      <Parte id="locale">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-accent" /> Brand
            </CardTitle>
            <CardDescription>Logo, colori e informazioni pubbliche del tuo ristorante.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/brand">Gestisci brand</Link>
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Locali del gruppo</CardTitle>
            <CardDescription>{ctx.org.name} · piano {ctx.org.plan}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {venues.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div>
                  <p className="font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.city ?? ""} · {v.kind}</p>
                </div>
                {v.id === ctx.venueId && <Badge tone="gold">Attivo</Badge>}
              </div>
            ))}
          </CardContent>
        </Card>

        <TeamSettings membri={team} inviti={inviti} canManage={can(ctx.role, "manage_venue")} />
      </div>

      <Card>
        <CardContent className="p-5">
          <ServiceOrganizationSettings
            initialMode={ctx.venue.serviceAssignmentMode}
            initialRooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
            tablesCount={tablesCount}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Turni di servizio (domenica esempio)</CardTitle>
          <CardDescription>Gestisci capienza e durata slot per ogni turno</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {shifts.map((s) => (
            <div key={s.id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {String(Math.floor(s.startMinute / 60)).padStart(2, "0")}:00 –{" "}
                {String(Math.floor(s.endMinute / 60)).padStart(2, "0")}:00
              </p>
              <p className="mt-2 text-xs">Capienza: {s.capacity} · Slot: {s.slotMinutes}&apos;</p>
            </div>
          ))}
        </CardContent>
      </Card>
      </Parte>

      <Parte id="prenotazioni">
      <Card>
        <CardHeader>
          <CardTitle>Widget di prenotazione</CardTitle>
          <CardDescription>
            Incolla questo codice sul sito del locale per far prenotare i clienti in autonomia
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-md border bg-secondary p-3 text-xs">{embedSnippet}</pre>
          <CopyButton value={embedSnippet} size="sm" variant="outline" />
        </CardContent>
      </Card>

      <BookingWindowSettings
        windowDays={ctx.venue.bookingWindowDays}
        cutoffMin={ctx.venue.bookingCutoffMin}
        overbookingPct={ctx.venue.overbookingPct}
        canManage={can(ctx.role, "manage_venue")}
      />
      </Parte>

      <Parte id="ospiti">
      {/* Lo scontrino medio era già scritto e importato qui, ma la pagina non
          lo mostrava: un campo modificabile che nessuno poteva raggiungere.
          Cioè esattamente la specie di funzione a metà che questo progetto ha
          il compito di non lasciare in giro. */}
      <AvgSpendSettings
        initialCents={ctx.venue.avgSpendCents}
        canManage={can(ctx.role, "manage_venue")}
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-accent" /> Portale Wi-Fi
            </CardTitle>
            <CardDescription>
              {ctx.venue.wifiSetupAt
                ? `Attivo sulla rete «${ctx.venue.wifiNetworkName}». Chi si collega lascia un contatto.`
                : "Chiuso: chi si collega lascia un contatto e riceve la password della rete."}
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/wifi">{ctx.venue.wifiSetupAt ? "Gestisci" : "Configura"}</Link>
          </Button>
        </CardHeader>
      </Card>

      <ReviewLinksSettings initial={reviewLinks} canManage={can(ctx.role, "manage_venue")} />

      <LoyaltySettings
        puntiPerEuro={ctx.venue.loyaltyPointsPerEuro}
        valorePuntoCents={ctx.venue.loyaltyPointValueCents}
        premioPunti={ctx.venue.loyaltyRewardPoints}
        premioCosa={ctx.venue.loyaltyRewardLabel}
        canManage={can(ctx.role, "manage_venue")}
      />
      </Parte>

      <Parte id="sistema">
      <Card>
        <CardHeader>
          <CardTitle>Integrazioni</CardTitle>
          <CardDescription>Stato del provider email marketing</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">Brevo</p>
              <p className="text-xs text-muted-foreground">Invio campagne email e transazionali</p>
            </div>
            <Badge tone={process.env.BREVO_API_KEY ? "success" : "warning"}>
              {process.env.BREVO_API_KEY ? "Configurato" : "Non configurato"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Verifica basata sulla presenza della chiave API. Non verifica la validità del dominio mittente.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invii in corso</CardTitle>
          <CardDescription>
            Messaggi agli ospiti e campagne non partono dentro la richiesta del browser: vengono messi in coda e
            consegnati entro un minuto. Qui si vede cosa è in attesa e cosa non è riuscito.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QueuePanel health={queueHealth} />
        </CardContent>
      </Card>

      </Parte>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Le quattro parti, e l'indice                                              */
/* -------------------------------------------------------------------------- */

/**
 * Impostazioni era **una colonna di tredici schede** in fila, tutte con la
 * stessa importanza e nessun ordine leggibile: chi cercava la finestra di
 * prenotazione scorreva finché non la vedeva, e chi non sapeva che esistesse
 * non la trovava.
 *
 * Ora sono quattro parti con un indice in cima, come il menu pubblico. Il
 * criterio del raggruppamento è **di chi è la decisione**: il locale (chi
 * siamo, chi lavora, com'è fatta la sala), le prenotazioni (le regole con cui
 * si accettano), gli ospiti (cosa si fa con chi è venuto), il sistema (le
 * cose che riguardano il funzionamento, non il ristorante).
 *
 * L'indice sono ancore, non schede: funziona senza JavaScript, si può
 * condividere un link a una parte, e il tasto indietro fa quello che ci si
 * aspetta.
 */
const PARTI = [
  { id: "locale", titolo: "Il locale", sottotitolo: "Chi siamo, chi lavora, com'è fatta la sala" },
  { id: "prenotazioni", titolo: "Prenotazioni", sottotitolo: "Le regole con cui si accettano" },
  { id: "ospiti", titolo: "Ospiti", sottotitolo: "Cosa si fa con chi è venuto" },
  { id: "sistema", titolo: "Sistema", sottotitolo: "Invii, integrazioni, stato dei lavori" },
] as const;

function Indice() {
  return (
    <nav aria-label="Parti delle impostazioni" className="flex flex-wrap gap-2">
      {PARTI.map((p) => (
        <a
          key={p.id}
          href={`#${p.id}`}
          className="min-h-[40px] rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-cream hover:text-foreground"
        >
          {p.titolo}
        </a>
      ))}
    </nav>
  );
}

function Parte({ id, children }: { id: (typeof PARTI)[number]["id"]; children: React.ReactNode }) {
  const parte = PARTI.find((p) => p.id === id)!;
  return (
    // `scroll-mt` tiene il titolo sotto la barra fissa quando si arriva
    // dall'indice: senza, la prima riga della sezione finisce nascosta.
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="border-b border-border pb-2">
        <h2 className="text-display text-xl">{parte.titolo}</h2>
        <p className="text-xs text-muted-foreground">{parte.sottotitolo}</p>
      </div>
      {children}
    </section>
  );
}
