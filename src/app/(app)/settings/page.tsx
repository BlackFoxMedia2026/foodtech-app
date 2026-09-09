import { headers } from "next/headers";
import Link from "next/link";
import { Palette, Wifi } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Blocco, BloccoNota } from "@/components/ui/blocco";
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
import { MieiDispositivi } from "@/components/settings/miei-dispositivi";

export const dynamic = "force-dynamic";

const ROLE_LABELS = {
  MANAGER: "Manager",
  RECEPTION: "Reception",
  WAITER: "Cameriere",
  MARKETING: "Marketing",
  READ_ONLY: "Sola lettura",
} as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { parte?: string };
}) {
  const ctx = await getActiveVenue();

  /**
   * Una parte per volta, scelta dall'indirizzo.
   *
   * Le quattro parti erano una sotto l'altra: 2.915 px, cioè tre schermate e
   * mezza di scorrimento per una pagina di configurazione. Adesso l'indice le
   * apre una per volta e la pagina sta in una schermata.
   *
   * La parte sta nell'indirizzo e non in uno stato del browser: funziona
   * senza JavaScript, si può mandare a un collega il link a una parte, e il
   * tasto indietro fa quello che ci si aspetta. È la stessa scelta delle
   * ancore di ieri, portata alle sue conseguenze.
   */
  const parteAttiva: ParteId =
    PARTI.find((p) => p.id === searchParams?.parte)?.id ?? PARTI[0].id;

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
    <div className="schermo animate-fade-in gap-3">
      <header className="fissa flex items-baseline gap-2">
        <h1 className="text-lg font-semibold leading-none">Impostazioni</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Configurazione</p>
      </header>

      {ctx.venue.onboardingStatus === "SKIPPED" && (
        <div className="fissa flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent/10 p-3">
          <p className="text-sm font-medium">Completa la personalizzazione del brand</p>
          <Button asChild variant="accent" size="sm">
            <Link href="/settings/brand">Completa ora</Link>
          </Button>
        </div>
      )}

      <Indice attiva={parteAttiva} />

      <Parte id="locale" attiva={parteAttiva}>
      {/* Il brand si configura in una pagina sua: qui è una riga che dice
          com'è adesso, non una scheda con un pulsante dentro. */}
      <Blocco
        titolo="Brand"
        icona={Palette}
        valore={ctx.venue.onboardingStatus === "COMPLETED" ? "personalizzato" : "da personalizzare"}
        azione={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/brand">Gestisci</Link>
          </Button>
        }
      />

      {/* Una colonna, non due.

          Le due colonne servivano quando ogni blocco era una scheda alta:
          affiancarle riempiva la pagina. Con i blocchi chiusi il Team aperto
          è alto quattro righe e «Locali del gruppo» una: la griglia lasciava
          quattrocento pixel di vuoto accanto a una riga sola. Le righe si
          impilano. */}
      <Blocco
        titolo="Locali del gruppo"
        valore={`${venues.length} ${venues.length === 1 ? "locale" : "locali"} · piano ${
          NOME_PIANO[ctx.org.plan] ?? ctx.org.plan
        }`}
      >
        <BloccoNota>{ctx.org.name}</BloccoNota>
        <div className="space-y-2">
          {venues.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-muted-foreground">
                  {[v.city, NOME_TIPO_LOCALE[v.kind] ?? v.kind].filter(Boolean).join(" · ")}
                </p>
              </div>
              {v.id === ctx.venueId && <Badge tone="gold">Attivo</Badge>}
            </div>
          ))}
        </div>
      </Blocco>

      <TeamSettings membri={team} inviti={inviti} canManage={can(ctx.role, "manage_venue")} />

      <ServiceOrganizationSettings
        initialMode={ctx.venue.serviceAssignmentMode}
        initialRooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
        tablesCount={tablesCount}
      />

      <Blocco
        titolo="Turni di servizio"
        valore={
          shifts.length === 0
            ? "nessun turno"
            : `${shifts.map((s) => s.name).join(" · ")} · ${shifts.reduce(
                (n, s) => n + s.capacity,
                0,
              )} coperti`
        }
      >
        <BloccoNota>
          La domenica come esempio: capienza e durata degli slot, turno per turno.
        </BloccoNota>
        <div className="grid gap-3 md:grid-cols-3">
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
        </div>
      </Blocco>
      </Parte>

      <Parte id="prenotazioni" attiva={parteAttiva}>
      <Blocco titolo="Widget di prenotazione" valore="codice da incollare sul sito">
        <BloccoNota>
          Incolla questo codice sul sito del locale per far prenotare i clienti in autonomia.
        </BloccoNota>
        <div className="space-y-3">
          <pre className="overflow-x-auto rounded-md border bg-secondary p-3 text-xs">{embedSnippet}</pre>
          <CopyButton value={embedSnippet} size="sm" variant="outline" />
        </div>
      </Blocco>

      <BookingWindowSettings
        windowDays={ctx.venue.bookingWindowDays}
        cutoffMin={ctx.venue.bookingCutoffMin}
        overbookingPct={ctx.venue.overbookingPct}
        largePartyFrom={ctx.venue.largePartyFrom}
        canManage={can(ctx.role, "manage_venue")}
      />
      </Parte>

      <Parte id="ospiti" attiva={parteAttiva}>
      {/* Lo scontrino medio era già scritto e importato qui, ma la pagina non
          lo mostrava: un campo modificabile che nessuno poteva raggiungere.
          Cioè esattamente la specie di funzione a metà che questo progetto ha
          il compito di non lasciare in giro. */}
      <AvgSpendSettings
        initialCents={ctx.venue.avgSpendCents}
        canManage={can(ctx.role, "manage_venue")}
      />

      <Blocco
        titolo="Portale Wi-Fi"
        icona={Wifi}
        valore={
          ctx.venue.wifiSetupAt ? `attivo su «${ctx.venue.wifiNetworkName}»` : "chiuso"
        }
        azione={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/wifi">{ctx.venue.wifiSetupAt ? "Gestisci" : "Configura"}</Link>
          </Button>
        }
      />

      <ReviewLinksSettings initial={reviewLinks} canManage={can(ctx.role, "manage_venue")} />

      <LoyaltySettings
        puntiPerEuro={ctx.venue.loyaltyPointsPerEuro}
        valorePuntoCents={ctx.venue.loyaltyPointValueCents}
        premioPunti={ctx.venue.loyaltyRewardPoints}
        premioCosa={ctx.venue.loyaltyRewardLabel}
        canManage={can(ctx.role, "manage_venue")}
      />
      </Parte>

      <Parte id="sistema" attiva={parteAttiva}>
      {/* Sta in «Sistema» e non in «Il locale» perché riguarda il proprio
          accesso, non il ristorante: è la stessa parte dove si legge lo stato
          delle integrazioni e dei lavori. */}
      <MieiDispositivi />

      <Blocco
        titolo="Integrazioni"
        valore={`Brevo · ${process.env.BREVO_API_KEY ? "configurato" : "non configurato"}`}
      >
        <BloccoNota>Stato del provider email marketing.</BloccoNota>
        <div className="space-y-2">
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
        </div>
      </Blocco>

      {/* Questo blocco nasce aperto quando c'è qualcosa che non è riuscito:
          un invio fallito nascosto dietro un'intestazione è la cosa che si
          scopre tardi. */}
      <Blocco
        titolo="Invii in corso"
        valore={
          queueHealth.nonRiusciti > 0
            ? `${queueHealth.nonRiusciti} non ${queueHealth.nonRiusciti === 1 ? "riuscito" : "riusciti"}`
            : queueHealth.inAttesa + queueHealth.inCorso > 0
              ? `${queueHealth.inAttesa + queueHealth.inCorso} in coda`
              : "tutto consegnato"
        }
        aperto={queueHealth.nonRiusciti > 0}
      >
        <BloccoNota>
          Messaggi agli ospiti e campagne non partono dentro la richiesta del browser: vengono messi in coda e
          consegnati entro un minuto. Qui si vede cosa è in attesa e cosa non è riuscito.
        </BloccoNota>
        <QueuePanel health={queueHealth} />
      </Blocco>

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

/*
  «BEACH_CLUB» e «piano GROWTH» erano costanti del database mostrate a un
  ristoratore. Sono le stesse chiavi dello schema, tradotte in una parola che
  si legge: se domani lo schema ne aggiunge una, il `??` la mostra grezza
  invece di far sparire l'informazione.
*/
const NOME_TIPO_LOCALE: Record<string, string> = {
  RESTAURANT: "Ristorante",
  BEACH_CLUB: "Beach club",
  BAR: "Bar",
  HOTEL_RESTAURANT: "Ristorante d'albergo",
  PRIVATE_CLUB: "Club privato",
};

const NOME_PIANO: Record<string, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  ENTERPRISE: "Enterprise",
};

function Indice({ attiva }: { attiva: ParteId }) {
  return (
    // Sul telefono le quattro pillole andavano a capo su due righe: cento
    // pixel di intestazione in una schermata che non scorre. Qui scorrono in
    // orizzontale, e da `sm` tornano a disporsi su più righe.
    <nav
      aria-label="Parti delle impostazioni"
      className="fissa -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
    >
      {PARTI.map((p) => {
        const scelta = p.id === attiva;
        return (
          <Link
            key={p.id}
            href={`/settings?parte=${p.id}`}
            aria-current={scelta ? "page" : undefined}
            className={
              scelta
                ? "min-h-[40px] shrink-0 rounded-full border border-cream bg-cream px-3 py-2 text-sm font-medium text-clay-ink"
                : "min-h-[40px] shrink-0 rounded-full border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-cream hover:text-foreground"
            }
          >
            {p.titolo}
          </Link>
        );
      })}
    </nav>
  );
}

type ParteId = (typeof PARTI)[number]["id"];

function Parte({
  id,
  attiva,
  children,
}: {
  id: ParteId;
  attiva: ParteId;
  children: React.ReactNode;
}) {
  if (id !== attiva) return null;
  const parte = PARTI.find((p) => p.id === id)!;
  return (
    // La parte scelta prende l'altezza che avanza. Se il suo contenuto è più
    // alto — «Il locale» ha brand, locali, team, sale e turni — scorre lei,
    // non la pagina.
    // Blocchi chiusi sono righe, non schede: fra righe `space-y-4` diventa un
    // elenco che galleggia. Tre unità tengono i blocchi separati e la parte
    // leggibile in una schermata.
    <section id={id} className="fill-scroll space-y-3 pr-0.5" aria-label={parte.titolo}>
      {/* Il titolo della parte non si ripete: la pillola accesa qui sopra lo
          dice già, e in una schermata che non scorre cinquanta pixel di
          ripetizione sono cinquanta pixel di contenuto in meno. Resta la
          riga che aggiunge qualcosa — cosa c'è dentro questa parte — e il
          nome va all'assistente vocale, che la pillola non gliela legge. */}
      <p className="border-b border-border pb-2 text-xs text-muted-foreground">{parte.sottotitolo}</p>
      {children}
    </section>
  );
}
