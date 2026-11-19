import { headers } from "next/headers";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Facebook,
  Globe,
  Hotel,
  ImagePlus,
  Instagram,
  Mail,
  MapPin,
  Phone,
  Store,
  UtensilsCrossed,
  Waves,
  Wine,
} from "lucide-react";
import { CaricaImmagineBrand } from "@/components/settings/carica-immagine-brand";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ServiceOrganizationSettings } from "@/components/settings/service-organization-settings";
import { AvgSpendSettings } from "@/components/settings/avg-spend-settings";
import { LoyaltySettings } from "@/components/settings/loyalty-settings";
import { ReviewLinksSettings } from "@/components/settings/review-links-settings";
import { BookingWindowSettings } from "@/components/settings/booking-window-settings";
import { TurniServizioSettings } from "@/components/settings/turni-servizio-settings";
import { QueuePanel } from "@/components/settings/queue-panel";
import { jobQueueHealth } from "@/server/jobs/queue";
import { can } from "@/lib/tenant";
import { statoConsumo } from "@/server/dem/consumo";
import { statoInvio } from "@/server/dem/dominio";
import { reputazioneDi } from "@/server/dem/statistiche";
import { BarraConsumo } from "@/components/dem/barra-consumo";
import { invii } from "@/lib/dem-piani";
import { ETICHETTA_REPUTAZIONE } from "@/lib/dem-reputazione";
import { listRooms } from "@/server/rooms";
import { listFasceServizio } from "@/server/turni-servizio";
import { listReviewLinks } from "@/server/reviews";
import { listInviti, listTeam } from "@/server/team";
import { statoCentralino } from "@/server/licenza-centralino";
import { saluteVoice } from "@/server/voice/salute";
import { vistaIngresso } from "@/server/voice/ingresso";
import { vistaCalendario } from "@/server/calendario";
import { statoDueFattori } from "@/server/due-fattori";
import { MieiDispositivi } from "@/components/settings/miei-dispositivi";
import { DueFattori } from "@/components/settings/due-fattori";
import { AccessoTeam } from "@/components/settings/accesso-team";
import { Centralino } from "@/components/settings/centralino";
import { SezioneImpostazioni } from "@/components/settings/sezione-impostazioni";
import { CalendarioPrenotazioni } from "@/components/settings/calendario-prenotazioni";
import { SmsPromemoria } from "@/components/settings/sms-promemoria";
import { CaparraRegola } from "@/components/settings/caparra-regola";
import { channelAvailable } from "@/server/messaging/send";
import { AltreSezioniMobile } from "@/components/settings/navigazione-impostazioni";
import { IndiceImpostazioni } from "@/components/settings/indice-impostazioni";
import { PARTI, parteDa } from "@/lib/parti-impostazioni";
import {
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
  ValoreImpostazione,
  ValoreVuoto,
} from "@/components/settings/righe-impostazioni";

export const dynamic = "force-dynamic";

/** «1 ottobre»: la data del rinnovo si legge, non si decifra. */
const FORMATO_GIORNO = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
});

/**
 * Impostazioni: **un indice a schede, e una sezione per volta**.
 *
 * ## Come ci si è arrivati, perché è andata avanti e indietro
 *
 * 1. cinque pagine con `?parte=`: si vedeva un quinto delle impostazioni e si
 *    doveva **indovinare** in quale degli altri quattro stesse la cosa
 *    cercata;
 * 2. una pagina sola che scorre, con le sezioni come ancore. Si vedeva tutto,
 *    ma «tutto» erano **ottomila pixel**: otto schermate e mezzo di righe
 *    tutte uguali. «Uno scroll infinito», ed era vero — messi in ordine righe,
 *    schede e valori, la quantità è restata quella;
 * 3. adesso: **l'indice è fatto di schede**, una per sezione, e ogni scheda
 *    elenca i suoi gruppi. Si apre quella che serve.
 *
 * La differenza con il punto 1 — quello che non funzionava — è l'elenco dentro
 * la scheda. Il difetto di allora non era avere una sezione per volta: era non
 * sapere dove stessero le cose. Chi cerca i turni di servizio li **legge**
 * sull'indice, senza aprire niente.
 *
 * ## Cos'è andato via
 *
 * L'osservatore che accendeva la voce in barra mentre si scorreva, il contesto
 * che teneva insieme barra e pagina, la tregua dopo il clic perché la pillola
 * non lampeggiasse attraversando le sezioni in mezzo: ottanta righe di codice
 * che esistevano solo per far funzionare una pagina troppo alta. La voce
 * accesa adesso la dice l'indirizzo.
 *
 * ## Cosa **non** è cambiato
 *
 * Nessuna impostazione è stata spostata o togliata, e le tre che hanno una
 * pagina tutta loro — brand, portale Wi-Fi, pagamenti — restano dove sono, con
 * la riga qui che ne dichiara lo stato.
 *
 * **Una volta si era persa davvero.** Un commento qui diceva «non si è persa
 * nessuna impostazione» e non era vero: `team-settings.tsx` era stato
 * cancellato senza rimpiazzo, e per due giorni non c'è stato modo di invitare
 * un collega — le rotte `/api/team/*` rispondevano e nessuna schermata le
 * chiamava. L'unica cosa che l'ha detto è stato un test end-to-end rosso, e
 * per questo ogni riorganizzazione di questa pagina finisce con quella suite.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { sez?: string; parte?: string };
}) {
  const ctx = await getActiveVenue();

  /* `?parte=` è la forma vecchia, ed è ancora dentro link già mandati: si
     legge, non si rompe. */
  const attiva = parteDa(searchParams.sez ?? searchParams.parte);

  /*
    L'indice esce **prima** delle letture.

    Le quattordici interrogazioni qui sotto servono alle sezioni: turni, sale,
    coda dei lavori, quota DEM, chiavi del centralino. L'indice non ne usa
    nessuna, e farle comunque vorrebbe dire pagare tutte le impostazioni per
    mostrare cinque schede — su una pagina che adesso è la prima cosa che si
    apre entrando in Impostazioni.
  */
  if (!attiva) {
    return (
      <div className="animate-cambio-area mx-auto w-full max-w-6xl pb-16">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Come è configurato il locale e come si comporta il gestionale. Le
          modifiche valgono da subito.
        </p>

        {ctx.venue.onboardingStatus !== "COMPLETED" &&
          can(ctx.role, "manage_venue") && (
            /* Una lastra con la sua cupola oro e un comando vero, non una
               capsula sottile fra la frase e le schede: è l'unica cosa da
               fare su questa pagina, e deve sembrarlo. */
            <Link
              href="/settings/brand"
              className="vetro card-notch group mt-5 flex items-center gap-4 p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg md:p-5"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/20 text-accent-strong ring-1 ring-accent/40 md:h-12 md:w-12">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-foreground md:text-base">
                  Il brand non è completo
                </span>
                <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted-foreground md:text-sm">
                  Logo, colori e identità visiva: li vedono i clienti sul
                  modulo di prenotazione, sul portale Wi-Fi e nelle email.
                </span>
              </span>
              <span className="hidden h-10 shrink-0 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-[filter] group-hover:brightness-110 sm:inline-flex">
                Completa
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
              <ArrowRight
                className="h-5 w-5 shrink-0 text-accent-strong sm:hidden"
                aria-hidden="true"
              />
            </Link>
          )}

        <IndiceImpostazioni />
      </div>
    );
  }

  // L'indirizzo pubblico di questa installazione: serve al codice da
  // incollare sul sito del locale.
  const hdrs = headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto =
    hdrs.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${proto}://${host}`;

  const [
    venues,
    fasceServizio,
    rooms,
    tablesCount,
    queueHealth,
    reviewLinks,
    tavoliConQr,
    quotaDem,
    invioDem,
    reputazioneDem,
    membri,
    inviti,
    centralino,
    salute,
    ingresso,
    calendario,
    dueFattori,
  ] = await Promise.all([
    db.venue.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
    }),
    listFasceServizio(ctx.venueId),
    listRooms(ctx.venueId),
    db.table.count({ where: { venueId: ctx.venueId, active: true } }),
    jobQueueHealth(ctx.venueId),
    listReviewLinks(ctx.venueId),
    db.table.count({
      where: {
        venueId: ctx.venueId,
        payQrEnabled: true,
        payQrToken: { not: null },
      },
    }),
    statoConsumo(ctx.venueId),
    statoInvio(ctx.venueId),
    reputazioneDi(ctx.venueId),
    listTeam(ctx.venueId, ctx.userId),
    /* Gli inviti portano con sé il link da consegnare, e il link ha bisogno
       dell'indirizzo di questa installazione: lo stesso `baseUrl` del codice
       da incollare sul sito. */
    listInviti(ctx.venueId, baseUrl),
    statoCentralino(ctx.venueId),
    saluteVoice(ctx.venueId),
    vistaIngresso(ctx.venueId),
    vistaCalendario(ctx.venueId),
    statoDueFattori(ctx.userId),
  ]);

  /* `manage_venue`, la stessa capacità che chiedono le rotte `/api/team/*`:
     se qui fosse più permissiva, l'interfaccia mostrerebbe comandi che il
     server rifiuta. Chi non l'ha vede chi ha accesso e non lo cambia —
     l'elenco è un'informazione, cambiarlo è un permesso. */
  const puoGestireTeam = can(ctx.role, "manage_venue");

  /* Solo per la sezione Sistema, e solo due numeri: il catalogo intero si
     legge nella sua pagina. */
  const integrazioni =
    attiva === "sistema"
      ? await db.integrationInstallation
          .findMany({
            where: { venueId: ctx.venueId, NOT: { status: "NOT_INSTALLED" } },
            select: { status: true, healthStatus: true },
          })
          .then((righe) => ({
            installate: righe.length,
            daGuardare: righe.filter(
              (r) =>
                r.status === "ERROR" ||
                r.status === "REAUTH_REQUIRED" ||
                r.healthStatus === "DEGRADED" ||
                r.healthStatus === "ERROR",
            ).length,
          }))
      : { installate: 0, daGuardare: 0 };

  // «Collegato» qui significa una cosa sola: che Stripe accetta incassi. Un
  // account creato e non verificato esiste e rifiuta ogni pagamento, quindi
  // dirlo collegato sarebbe una bugia che si scopre al primo cliente.
  const stripePronto = ctx.venue.stripeChargesEnabled;

  const v = ctx.venue;
  const embedSrc = `${baseUrl}/book?venue=${ctx.venueId}&embed=1`;
  const embedSnippet = `<iframe src="${embedSrc}" width="480" height="820" style="border:0;max-width:100%" title="Prenota un tavolo"></iframe>`;

  const contattiConIcona = [
    v.phone && { icona: Phone, testo: v.phone },
    v.email && { icona: Mail, testo: v.email },
    v.address && { icona: MapPin, testo: v.address },
  ].filter(Boolean) as { icona: typeof Phone; testo: string }[];
  const socialConIcona = [
    v.websiteUrl && { icona: Globe, nome: "Sito", url: v.websiteUrl },
    v.instagramUrl && { icona: Instagram, nome: "Instagram", url: v.instagramUrl },
    v.facebookUrl && { icona: Facebook, nome: "Facebook", url: v.facebookUrl },
    v.googleBusinessUrl && { icona: MapPin, nome: "Google", url: v.googleBusinessUrl },
  ].filter(Boolean) as { icona: typeof Globe; nome: string; url: string }[];
  /* La stessa capacità che chiede `/api/venue/brand`: chi non l'ha vede il
     biglietto e non i pulsanti, che il server gli rifiuterebbe. */
  const puoGestireBrand = can(ctx.role, "manage_venue");
  const colori = [v.brandAccent, v.brandSecondaryColor].filter(
    Boolean,
  ) as string[];

  return (
    <div className="animate-cambio-area pb-16">
      {/*
        **Una colonna di lettura, non la larghezza dello schermo.**

        Era `max-w-[1500px]`: su un monitor da 27 pollici il nome
        dell'impostazione stava a sinistra e il suo valore a milletrecento
        pixel di distanza, con in mezzo il nulla. Quaranta righe così sono
        quaranta viaggi dell'occhio, ed è la ragione per cui questa pagina si
        leggeva come un registro invece che come un pannello.

        `max-w-4xl` (896 px) è la misura in cui nome e valore stanno in un
        colpo d'occhio. Le poche cose che hanno bisogno di più spazio — il
        codice del widget, l'editor dei turni — sono righe `larga` e usano
        tutta la colonna.
      */}
      {/*
        **Più larga, con una colonna di lato** (19 nov 2026). Era
        `max-w-4xl`, una colonna di lettura in mezzo allo schermo: giusta per
        tenere vicini nome e valore, ma su un monitor largo lasciava vuoti i
        due lati. Adesso la colonna dei gruppi resta di quella misura e il
        resto lo prende la colonna di lato di `SezioneImpostazioni` (nome
        della sezione, via di ritorno, sommario dei gruppi).
      */}
      <div className="mx-auto w-full max-w-7xl">
        {/* Una sezione per volta: niente spaziatura fra sezioni da tenere,
            e niente terzo di schermata vuoto in fondo — serviva alla barra
            per accendere l'ultima voce mentre si scorreva, e quella barra
            adesso non osserva più niente. */}
        <div className="mt-2 md:mt-4">
          {/* ------------------------------------------------------------- */}
          {attiva === "locale" && (
            <SezioneImpostazioni id="locale">
              <GruppoImpostazioni
                titolo="Brand"
                descrizione="Come si presenta il locale al cliente: sul modulo di prenotazione, sul portale Wi-Fi, nelle email."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/brand">Modifica il brand</Link>
                  </Button>
                }
              >
                {/*
                  **Il biglietto da visita, non sei righe** (19 nov 2026).
                  Logo, copertina, colori e contatti erano sei righe di testo
                  con «non caricato» a destra: per sapere come si presenta il
                  locale bisognava immaginarlo. Adesso si vede, nella stessa
                  composizione che trova il cliente — copertina, logo, nome —
                  e logo e copertina si caricano da qui, senza passare dal
                  modulo intero del brand.
                */}
                <div className="py-5">
                  <div className="relative">
                    <div
                      className="relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/30 via-accent/25 to-muted md:h-44"
                      style={
                        !v.coverImage && colori.length > 0
                          ? {
                              backgroundImage: `linear-gradient(135deg, ${colori[0]} 0%, ${colori[1] ?? colori[0]} 100%)`,
                            }
                          : undefined
                      }
                    >
                      {v.coverImage ? (
                        <img
                          src={v.coverImage}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-sm font-medium text-foreground/60">
                          <span className="inline-flex items-center gap-2">
                            <ImagePlus className="h-4 w-4" aria-hidden="true" />
                            Nessuna copertina
                          </span>
                        </span>
                      )}
                      {puoGestireBrand && (
                        <CaricaImmagineBrand
                          campo="coverImage"
                          valore={v.coverImage}
                          etichetta="copertina"
                          variante={v.coverImage ? "scuro" : "chiaro"}
                          className="absolute right-3 top-3 justify-end"
                        />
                      )}
                    </div>

                    {/* Il logo sporge dalla copertina come sul modulo
                        pubblico. Senza logo, l'iniziale del nome: un tondo
                        vuoto sembrerebbe un caricamento non riuscito. */}
                    <div className="absolute -bottom-9 left-4 grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg ring-4 ring-white/70 md:left-6 md:h-24 md:w-24">
                      {v.brandLogoUrl ? (
                        <img
                          src={v.brandLogoUrl}
                          alt={`Logo di ${v.name}`}
                          className="h-full w-full object-contain p-2"
                        />
                      ) : (
                        <span className="text-display text-3xl text-[#2c5545]">
                          {v.name.trim().charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sul telefono il nome prende la riga accanto al logo e
                      il pulsante scende sotto: affiancati, il nome andava a
                      capo una parola per riga. */}
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 basis-full pl-24 sm:basis-0 md:pl-36">
                      <p className="text-display text-xl leading-tight">
                        {v.name}
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                        {v.brandLogoUrl
                          ? "Il nome e il logo che legge il cliente."
                          : "Senza logo, sul modulo e nelle email compare l'iniziale."}
                      </p>
                    </div>
                    {puoGestireBrand && (
                      <CaricaImmagineBrand
                        campo="brandLogoUrl"
                        valore={v.brandLogoUrl}
                        etichetta="logo"
                        className="max-sm:mt-4"
                      />
                    )}
                  </div>

                  {/* Tre riquadri e non tre righe: con la colonna più larga
                      stanno affiancati, e ognuno si legge da solo. */}
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-foreground/[0.04] p-4">
                      <p className="t-etichetta">Contatti</p>
                      {contattiConIcona.length > 0 ? (
                        <ul className="mt-2.5 space-y-2 text-sm">
                          {contattiConIcona.map(({ icona: Icona, testo }) => (
                            <li key={testo} className="flex items-start gap-2">
                              <Icona className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="min-w-0 break-words">{testo}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2.5">
                          <ValoreVuoto>nessun contatto</ValoreVuoto>
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-foreground/[0.04] p-4">
                      <p className="t-etichetta">Online</p>
                      {socialConIcona.length > 0 ? (
                        <ul className="mt-2.5 flex flex-wrap gap-1.5">
                          {socialConIcona.map(({ icona: Icona, nome, url }) => (
                            <li key={nome}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium shadow-sm ring-1 ring-black/5 transition-colors hover:bg-white dark:bg-white/10 dark:ring-white/10"
                              >
                                <Icona className="h-3.5 w-3.5" aria-hidden="true" />
                                {nome}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2.5">
                          <ValoreVuoto>nessun collegamento</ValoreVuoto>
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-foreground/[0.04] p-4">
                      <p className="t-etichetta">Colori</p>
                      {colori.length > 0 ? (
                        <ul className="mt-2.5 flex flex-wrap gap-3">
                          {colori.map((c) => (
                            <li key={c} className="flex items-center gap-2">
                              <span
                                className="h-8 w-8 rounded-full shadow-sm ring-2 ring-white dark:ring-white/20"
                                style={{ backgroundColor: c }}
                              />
                              <span className="font-mono text-xs uppercase text-muted-foreground">
                                {c}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2.5">
                          <ValoreVuoto>non scelti</ValoreVuoto>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </GruppoImpostazioni>

              <GruppoImpostazioni
                titolo="Locali del gruppo"
                descrizione={ctx.org.name}
              >
                {/* A schede e non a righe: sono posti, ognuno col suo
                    segno, e affiancati si contano a colpo d'occhio. */}
                <RigaLibera>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {venues.map((locale) => {
                      const Segno = SEGNO_TIPO_LOCALE[locale.kind] ?? Store;
                      const attivo = locale.id === ctx.venueId;
                      return (
                        <li
                          key={locale.id}
                          className={
                            attivo
                              ? "flex items-center gap-3 rounded-2xl bg-primary/[0.07] p-4 ring-1 ring-primary/25"
                              : "flex items-center gap-3 rounded-2xl bg-foreground/[0.04] p-4"
                          }
                        >
                          <span className="vetro kpi-pastiglia grid h-11 w-11 shrink-0 place-items-center rounded-full">
                            <Segno className="h-5 w-5" stroke="url(#trattoVetro)" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold leading-snug">
                              {locale.name}
                            </span>
                            <span className="block text-[0.8125rem] text-muted-foreground">
                              {[locale.city, NOME_TIPO_LOCALE[locale.kind] ?? locale.kind]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {/* «Stai qui» e non «Attivo»: anche l'altro locale
                              è aperto, questo è quello che si sta guardando. */}
                          {attivo && <Badge tone="gold">Stai qui</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                </RigaLibera>

                <RigaImpostazione
                  nome="Piano di abbonamento"
                  descrizione="Vale per tutti i locali dell'organizzazione."
                >
                  <ValoreImpostazione>
                    {NOME_PIANO[ctx.org.plan] ?? ctx.org.plan}
                  </ValoreImpostazione>
                </RigaImpostazione>
              </GruppoImpostazioni>

              <ServiceOrganizationSettings
                initialMode={ctx.venue.serviceAssignmentMode}
                initialRooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
                tablesCount={tablesCount}
              />

              {/*
                I turni erano un elenco in sola lettura, e per giunta di un
                giorno solo — «la domenica come esempio» — con i minuti
                arrotondati a `:00`: un locale che apre alle 12:30 leggeva
                12:00 e non aveva nessun modo di correggerlo. Adesso si
                modificano da qui, un turno alla volta, con i giorni in cui si
                fa. Vedi `components/settings/turni-servizio-settings.tsx`.
            */}
              <TurniServizioSettings
                fasce={fasceServizio}
                canManage={can(ctx.role, "manage_venue")}
              />
            </SezioneImpostazioni>
          )}

          {/* ------------------------------------------------------------- */}
          {attiva === "prenotazioni" && (
            <SezioneImpostazioni id="prenotazioni">
              <BookingWindowSettings
                windowDays={ctx.venue.bookingWindowDays}
                cutoffMin={ctx.venue.bookingCutoffMin}
                overbookingPct={ctx.venue.overbookingPct}
                largePartyFrom={ctx.venue.largePartyFrom}
                canManage={can(ctx.role, "manage_venue")}
              />

              <CalendarioPrenotazioni
                percorsoIniziale={calendario.percorso}
                indirizzo={baseUrl}
                canManage={can(ctx.role, "manage_venue")}
              />

              {/* Sta fra le prenotazioni perche il messaggio che manda piu
                spesso e il promemoria: e quello che porta o non porta la gente
                al tavolo. */}
              {/* La caparra sta fra le prenotazioni perche e una regola sulle
                prenotazioni, non sui pagamenti: in Pagamenti c'e come si
                incassa, qui c'e **quando** si chiede. */}
              <CaparraRegola
                iniziale={{
                  attiva: ctx.venue.caparraAttiva,
                  daPersone: ctx.venue.caparraDaPersone,
                  perPersonaCents: ctx.venue.caparraPerPersonaCents,
                  fissaCents: ctx.venue.caparraFissaCents,
                  oreAnnulloGratis: ctx.venue.caparraOreAnnulloGratis,
                }}
                pagamentiPronti={!!ctx.venue.stripeAccountId && ctx.venue.stripeChargesEnabled}
                canManage={can(ctx.role, "manage_venue")}
              />

              <SmsPromemoria
                attivi={ctx.venue.smsAttivi}
                canaleDisponibile={channelAvailable("SMS")}
                canManage={can(ctx.role, "manage_venue")}
              />

              <GruppoImpostazioni
                titolo="Widget di prenotazione"
                descrizione="Il codice da incollare sul sito del locale per far prenotare i clienti in autonomia."
                azione={
                  <CopyButton
                    value={embedSnippet}
                    size="sm"
                    variant="outline"
                  />
                }
              >
                <RigaLibera>
                  {/* A capo, non in orizzontale: una barra di scorrimento dentro
                    una riga di impostazioni è un posto dove si finisce per
                    sbaglio girando la rotella, e il codice si copia col
                    pulsante — non si legge. */}
                  <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-black/20 p-3 text-xs leading-relaxed">
                    {embedSnippet}
                  </pre>
                </RigaLibera>
                <RigaImpostazione
                  nome="Indirizzo del modulo"
                  descrizione="Lo stesso modulo, da mandare per messaggio o da mettere in bio."
                >
                  <ValoreImpostazione className="break-all">{`${baseUrl}/book?venue=${ctx.venueId}`}</ValoreImpostazione>
                </RigaImpostazione>
              </GruppoImpostazioni>
            </SezioneImpostazioni>
          )}

          {/* ------------------------------------------------------------- */}
          {attiva === "ospiti" && (
            <SezioneImpostazioni id="ospiti">
              {/* Lo scontrino medio era già scritto e importato nella pagina, ma
                non si vedeva: un campo modificabile che nessuno poteva
                raggiungere. Cioè esattamente la specie di funzione a metà che
                questo progetto ha il compito di non lasciare in giro. */}
              <AvgSpendSettings
                initialCents={ctx.venue.avgSpendCents}
                canManage={can(ctx.role, "manage_venue")}
              />

              <ReviewLinksSettings
                initial={reviewLinks}
                canManage={can(ctx.role, "manage_venue")}
              />

              <LoyaltySettings
                puntiPerEuro={ctx.venue.loyaltyPointsPerEuro}
                valorePuntoCents={ctx.venue.loyaltyPointValueCents}
                premioPunti={ctx.venue.loyaltyRewardPoints}
                premioCosa={ctx.venue.loyaltyRewardLabel}
                canManage={can(ctx.role, "manage_venue")}
              />

              <GruppoImpostazioni
                titolo="Portale Wi-Fi"
                descrizione="La rete che si offre in sala, e i contatti che si raccolgono da chi si collega."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/wifi">
                      {ctx.venue.wifiSetupAt ? "Gestisci" : "Configura"}
                    </Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Stato del portale"
                  descrizione="Da acceso, chi si collega lascia un contatto e riceve la password."
                >
                  {/* Tre stati e non due: un portale **sospeso** ha tutta la sua
                    configurazione e una pagina spenta, e chiamarlo «chiuso»
                    come uno mai configurato manderebbe a rifare mezz'ora di
                    lavoro già fatta. */}
                  {ctx.venue.wifiSetupAt ? (
                    <ValoreImpostazione>
                      attivo su «{ctx.venue.wifiNetworkName}»
                    </ValoreImpostazione>
                  ) : ctx.venue.wifiNetworkName && ctx.venue.wifiPassword ? (
                    <ValoreImpostazione>
                      sospeso su «{ctx.venue.wifiNetworkName}»
                    </ValoreImpostazione>
                  ) : (
                    <ValoreVuoto>da configurare</ValoreVuoto>
                  )}
                </RigaImpostazione>
                <RigaImpostazione
                  nome="Coupon automatico"
                  descrizione="Lo sconto che parte da solo a chi si collega, se acceso."
                >
                  {ctx.venue.wifiAutoCouponEnabled ? (
                    <ValoreImpostazione mono>
                      {ctx.venue.wifiAutoCouponPercent}% · valido{" "}
                      {ctx.venue.wifiAutoCouponDays} giorni
                    </ValoreImpostazione>
                  ) : (
                    <ValoreVuoto>spento</ValoreVuoto>
                  )}
                </RigaImpostazione>
              </GruppoImpostazioni>

              {/*
                L'importazione sta fra gli **ospiti** e non nel sistema: quello
                che si porta dentro sono i clienti, e questa e la sezione dove
                si va a cercarli. Nel sistema ci finirebbe fra le chiavi e i
                registri, dove nessuno la troverebbe il giorno in cui arriva
                da un altro gestionale con un file in mano.
              */}
              <GruppoImpostazioni
                titolo="Porta dentro i tuoi clienti"
                descrizione="Il file esportato dal gestionale di prima: prima ti mostriamo cosa succederebbe, poi importi."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/importa">Importa</Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Da dove"
                  descrizione="CSV con clienti, prenotazioni o entrambi. Riconosciamo le colonne italiane e inglesi."
                >
                  <ValoreVuoto>un file per volta</ValoreVuoto>
                </RigaImpostazione>
              </GruppoImpostazioni>
            </SezioneImpostazioni>
          )}

          {/* ------------------------------------------------------------- */}
          {/*
            Marketing, e cosa ci sta e cosa no.

            Qui stanno le tre cose che si **decidono**: con quale piano si
            scrive ai clienti, da quale dominio esce la posta, e come sta
            andando. Gli strumenti — campagne, coupon, gift card, Wi-Fi, QR —
            restano nel menu Marketing in barra, perché quelli si aprono per
            fare qualcosa e questi si aprono per configurare qualcosa.

            Le tre righe dichiarano lo stato e portano alla pagina, come già
            fanno Brand, Wi-Fi e Pagamenti: il piano con la sua barra, il
            dominio con il mittente vero, la reputazione con il suo giudizio.
            Nessuna delle tre sta bene dentro una riga — sono pagine — ma tutte
            e tre devono potersi leggere **senza aprirle**.
          */}
          {attiva === "marketing" && (
            <SezioneImpostazioni id="marketing">
              <GruppoImpostazioni
                titolo="Piano DEM"
                descrizione="Quante email puoi inviare ogni mese, e quante ne hai usate."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/marketing/piano">Gestisci</Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Piano attuale"
                  descrizione={
                    quotaDem.pianoProgrammato
                      ? `Dal prossimo rinnovo: ${quotaDem.pianoProgrammato}.`
                      : "Gli invii si contano per destinatario, non per campagna."
                  }
                >
                  <ValoreImpostazione>{quotaDem.pianoNome}</ValoreImpostazione>
                </RigaImpostazione>

                <RigaImpostazione
                  nome="Invii di questo mese"
                  descrizione={`Rinnovo il ${FORMATO_GIORNO.format(quotaDem.rinnovoIl)}.`}
                >
                  <ValoreImpostazione mono>
                    {invii(quotaDem.usati)} / {invii(quotaDem.limite)}
                  </ValoreImpostazione>
                </RigaImpostazione>

                <RigaLibera>
                  <BarraConsumo
                    limite={quotaDem.limite}
                    usati={quotaDem.usati}
                    riservati={quotaDem.riservati}
                  />
                  <p className="mt-2 t-nota">
                    {invii(quotaDem.disponibili)} email ancora disponibili
                    {quotaDem.riservati > 0 &&
                      ` — ${invii(quotaDem.riservati)} già impegnate da campagne programmate`}
                    .
                  </p>
                </RigaLibera>
              </GruppoImpostazioni>

              <GruppoImpostazioni
                titolo="Dominio di invio"
                descrizione="Le newsletter partono da un indirizzo tuo: il sito e la posta aziendale non vengono toccati."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/marketing/invio">
                      {invioDem.configurato ? "Gestisci" : "Configura"}
                    </Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Mittente"
                  descrizione="Quello che i tuoi clienti vedono come indirizzo del mittente."
                >
                  {invioDem.mittente ? (
                    <ValoreImpostazione>{invioDem.mittente}</ValoreImpostazione>
                  ) : (
                    <ValoreVuoto>non configurato</ValoreVuoto>
                  )}
                </RigaImpostazione>

                <RigaImpostazione
                  nome="Risposte"
                  descrizione="Dove arriva chi risponde a una newsletter."
                >
                  {/* «L'email del locale» **è** la risposta, non la sua
                    assenza: è dove arriva chi risponde finché nessuno mette
                    un altro indirizzo. Col bollino tratteggiato sembrava una
                    cosa da fare. */}
                  <ValoreImpostazione>
                    {invioDem.replyTo ?? "l'email del locale"}
                  </ValoreImpostazione>
                </RigaImpostazione>

                <RigaImpostazione nome="Stato">
                  {/* Tre parole e non una sigla: «VERIFIED» non dice a nessuno
                    se può mandare una newsletter stasera. */}
                  <ValoreImpostazione>
                    {!invioDem.configurato
                      ? "Da configurare"
                      : invioDem.stato === "VERIFIED"
                        ? "Pronto per l'invio"
                        : invioDem.stato === "FAILED"
                          ? "Da controllare"
                          : "In attesa dei DNS"}
                  </ValoreImpostazione>
                </RigaImpostazione>
              </GruppoImpostazioni>

              <GruppoImpostazioni
                titolo="Reputazione"
                descrizione="Se le email arrivano davvero, e quante vengono segnalate."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/marketing/reputazione">Vedi</Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Giudizio"
                  descrizione={reputazioneDem.messaggio}
                >
                  <ValoreImpostazione>
                    {ETICHETTA_REPUTAZIONE[reputazioneDem.livello]}
                  </ValoreImpostazione>
                </RigaImpostazione>

                {/* Le percentuali compaiono solo quando hanno una base: sotto
                  i cinquanta invii un rimbalzo fa «20%», che ha la forma di un
                  disastro ed è un indirizzo scritto male. */}
                {reputazioneDem.tassoRimbalzi !== null && (
                  <RigaImpostazione
                    nome="Email non recapitate"
                    descrizione="Sugli invii degli ultimi trenta giorni."
                  >
                    <ValoreImpostazione mono>
                      {reputazioneDem.tassoRimbalzi.toLocaleString("it-IT")}%
                    </ValoreImpostazione>
                  </RigaImpostazione>
                )}

                {reputazioneDem.tassoSegnalazioni !== null && (
                  <RigaImpostazione nome="Segnalate come spam">
                    <ValoreImpostazione mono>
                      {reputazioneDem.tassoSegnalazioni.toLocaleString("it-IT")}
                      %
                    </ValoreImpostazione>
                  </RigaImpostazione>
                )}
              </GruppoImpostazioni>
            </SezioneImpostazioni>
          )}

          {/* ------------------------------------------------------------- */}
          {/* ------------------------------------------------------------- */}
          {attiva === "centralino" && (
            <SezioneImpostazioni id="centralino">
              {/*
                Il centralino ha una sezione sua, e prima stava dentro
                «Sistema» accanto ai pagamenti — le due cose che si
                *collegano* al locale invece di configurarsi.

                Era il criterio sbagliato: per un ristoratore il telefono non è
                un pezzo del funzionamento del gestionale, è **il suo
                telefono**. Cercarlo fra l'accesso, gli incassi e i lavori in
                coda vuol dire non trovarlo — e infatti non si trovava.
              */}
              <Centralino
                /* Collegare il centralino è `manage_phone`, non «chi gestisce
                   il team»: erano la stessa capacità per comodità, e le
                   credenziali SIP sono un numero da cui si telefona a spese
                   del locale. */
                canManage={can(ctx.role, "manage_phone")}
                ingresso={ingresso.ingresso}
                salute={{
                  ultimaChiamata: salute.ultimaChiamata?.toISOString() ?? null,
                  ultime24h: salute.ultime24h,
                  collegamentoAttivo: salute.collegamentoAttivo,
                  fornitore: salute.fornitore,
                  nonSannoFare: salute.nonSannoFare,
                }}
                risposte={
                  centralino.attivo
                    ? { quante: salute.risposteScritte }
                    : undefined
                }
                stato={{
                  attivo: centralino.attivo,
                  funzioni: centralino.funzioni,
                  scadeIl: centralino.scadeIl?.toISOString() ?? null,
                  attivatoIl: centralino.attivatoIl?.toISOString() ?? null,
                  chiaveLeggibile: centralino.chiaveLeggibile,
                  motivoSpento: centralino.motivoSpento,
                }}
              />
            </SezioneImpostazioni>
          )}

          {/* ------------------------------------------------------------- */}
          {attiva === "sistema" && (
            <SezioneImpostazioni id="sistema">
              {/* Sta qui e non in «Il locale» perché riguarda il proprio accesso,
                non il ristorante: è la stessa sezione dove si legge lo stato
                delle integrazioni e dei lavori. */}
              {/* Prima dei dispositivi: l'accesso in due passi è la difesa, i
                  dispositivi sono l'elenco di chi è entrato. */}
              <DueFattori
                attivo={dueFattori.attivo}
                codiciRimasti={dueFattori.codiciRimasti}
                segretoInChiaro={dueFattori.segretoInChiaro}
              />

              <MieiDispositivi />

              <AccessoTeam
                membri={membri}
                inviti={inviti}
                canManage={puoGestireTeam}
              />

              {/* Stripe è un'integrazione, e il valore dice la cosa che conta —
                se il locale può incassare — non se esiste un collegamento a
                metà. */}
              <GruppoImpostazioni
                titolo="Pagamenti"
                descrizione="Il conto Stripe del locale e il pagamento al tavolo col QR."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/pagamenti">
                      {stripePronto ? "Gestisci" : "Configura"}
                    </Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Conto Stripe"
                  descrizione="Finché non accetta incassi, il pagamento al tavolo manda le persone contro un errore."
                >
                  {stripePronto ? (
                    <Badge tone="success">Collegato</Badge>
                  ) : (
                    <Badge tone="warning">Non collegato</Badge>
                  )}
                </RigaImpostazione>
                <RigaImpostazione
                  nome="Tavoli col QR attivo"
                  descrizione="Quanti tavoli hanno un codice da inquadrare per pagare."
                >
                  {tavoliConQr > 0 ? (
                    <ValoreImpostazione mono>{tavoliConQr}</ValoreImpostazione>
                  ) : (
                    <ValoreVuoto>nessuno</ValoreVuoto>
                  )}
                </RigaImpostazione>
              </GruppoImpostazioni>

              {/* Le integrazioni **del locale**: cassa, portali, marketing,
                  ciascuna installata qui e con le sue credenziali. Il
                  catalogo e la gestione stanno nella loro pagina; qui la riga
                  dice solo se c'è qualcosa da guardare. */}
              <GruppoImpostazioni
                titolo="Integrazioni"
                descrizione="Cassa, pagamenti, portali di prenotazione e marketing collegati a questo locale."
                azione={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings/integrations">Apri</Link>
                  </Button>
                }
              >
                <RigaImpostazione
                  nome="Installate"
                  descrizione="Ogni locale installa le sue: le credenziali di uno non valgono per un altro, nemmeno nello stesso gruppo."
                >
                  {integrazioni.installate > 0 ? (
                    <ValoreImpostazione mono>{integrazioni.installate}</ValoreImpostazione>
                  ) : (
                    <ValoreVuoto>nessuna</ValoreVuoto>
                  )}
                </RigaImpostazione>
                {integrazioni.daGuardare > 0 && (
                  <RigaImpostazione nome="Richiedono attenzione">
                    <Badge tone="warning">{integrazioni.daGuardare}</Badge>
                  </RigaImpostazione>
                )}
              </GruppoImpostazioni>

              {/* Non sono integrazioni del locale: sono i fornitori con cui
                  Foodtech stesso lavora, uguali per tutti. Si chiamavano
                  «Integrazioni» prima che le integrazioni esistessero. */}
              <GruppoImpostazioni
                titolo="Servizi della piattaforma"
                descrizione="I fornitori con cui Foodtech lavora per tutti i locali."
              >
                <RigaImpostazione
                  nome="Brevo"
                  descrizione="Invio di campagne email e messaggi transazionali. La verifica guarda la presenza della chiave API, non la validità del dominio mittente."
                >
                  <Badge
                    tone={process.env.BREVO_API_KEY ? "success" : "warning"}
                  >
                    {process.env.BREVO_API_KEY
                      ? "Configurato"
                      : "Non configurato"}
                  </Badge>
                </RigaImpostazione>
              </GruppoImpostazioni>

              <GruppoImpostazioni
                titolo="Invii in corso"
                descrizione="Messaggi agli ospiti e campagne non partono dentro la richiesta del browser: vengono messi in coda e consegnati entro un minuto. Qui si vede cosa è in attesa e cosa non è riuscito."
              >
                <QueuePanel health={queueHealth} />
              </GruppoImpostazioni>
            </SezioneImpostazioni>
          )}
        </div>

        <AltreSezioniMobile attiva={attiva} />
      </div>
    </div>
  );
}

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

const SEGNO_TIPO_LOCALE: Record<
  string,
  React.ComponentType<{ className?: string; stroke?: string }>
> = {
  RESTAURANT: UtensilsCrossed,
  BEACH_CLUB: Waves,
  BAR: Wine,
  HOTEL_RESTAURANT: Hotel,
  PRIVATE_CLUB: Crown,
};

const NOME_PIANO: Record<string, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  ENTERPRISE: "Enterprise",
};
