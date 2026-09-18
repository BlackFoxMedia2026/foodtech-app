import { headers } from "next/headers";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
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
import { statoTelefonoBrowser } from "@/server/telefono-browser";
import { elencaApiToken } from "@/server/api-token";
import { MieiDispositivi } from "@/components/settings/miei-dispositivi";
import { AccessoTeam } from "@/components/settings/accesso-team";
import { Centralino } from "@/components/settings/centralino";
import { BarraImpostazioniMobile } from "@/components/settings/navigazione-impostazioni";
import {
  ParteChiesta,
  SezioneImpostazioni,
} from "@/components/settings/sezione-impostazioni";
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
 * Impostazioni: **una pagina sola, che si legge scorrendo**.
 *
 * Due cose sono cambiate il 15 settembre, e la seconda è la conseguenza della
 * prima.
 *
 * **1. Le quattro parti non sono più quattro pagine.** Erano link con
 * `?parte=`, e si vedeva un quarto delle impostazioni per volta: per sapere
 * dove stava una cosa bisognava visitarle tutte e quattro, e la fila di
 * pillole crema — in un prodotto dove una fila di pillole crema è un filtro
 * dappertutto — si leggeva come un filtro. Adesso sono **ancore** della stessa
 * pagina, e vivono nella barra in alto al posto delle voci del gestionale:
 * entrare in Impostazioni è un cambio d'area, non una schermata in più dentro
 * la stessa area.
 *
 * **2. Niente più blocchi da aprire.** Ogni configurazione era un `<details>`
 * che dichiarava il suo valore da chiuso. Risolveva il problema di tredici
 * schede alte uguali, ma ne lasciava uno: per sapere *cosa si può
 * configurare* bisognava aprire tredici volte. Adesso le impostazioni sono
 * righe — nome a sinistra, valore o controllo a destra — dentro gruppi
 * separati da un titolo, e si vedono tutte scorrendo.
 *
 * **Questa è l'unica pagina del prodotto che scorre**, ed è voluto: la regola
 * `.schermo` («una schermata operativa si guarda, non si scorre», vedi
 * `globals.css`) nasce per chi ha una persona davanti. Qui non c'è nessuno
 * davanti: c'è un ristoratore a locale chiuso che legge come è configurato il
 * suo locale.
 *
 * Quelle che stavano nei blocchi stanno nelle righe, e le tre che hanno una
 * pagina tutta loro — brand, portale Wi-Fi, pagamenti — restano dove sono, con
 * la riga qui che ne dichiara lo stato.
 *
 * **Una si era persa davvero.** Questo commento diceva «non si è persa nessuna
 * impostazione» e non era vero: `team-settings.tsx` è stato cancellato senza
 * rimpiazzo, e per due giorni non c'è stato modo di invitare un collega o di
 * togliere l'accesso a qualcuno — le rotte `/api/team/*` rispondevano e
 * nessuna schermata le chiamava. È tornata in «Sistema» come «Chi ha accesso»
 * (`components/settings/accesso-team.tsx`). Una riscrittura che sposta tutto
 * perde qualcosa in silenzio: l'unica cosa che l'ha detto è stato un test
 * end-to-end rosso.
 */
export default async function SettingsPage() {
  const ctx = await getActiveVenue();

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
    telefonoSip,
    chiaviCollegamento,
    salute,
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
    statoTelefonoBrowser(ctx.venueId),
    elencaApiToken(ctx.venueId),
    saluteVoice(ctx.venueId),
  ]);

  /* `manage_venue`, la stessa capacità che chiedono le rotte `/api/team/*`:
     se qui fosse più permissiva, l'interfaccia mostrerebbe comandi che il
     server rifiuta. Chi non l'ha vede chi ha accesso e non lo cambia —
     l'elenco è un'informazione, cambiarlo è un permesso. */
  const puoGestireTeam = can(ctx.role, "manage_venue");

  // «Collegato» qui significa una cosa sola: che Stripe accetta incassi. Un
  // account creato e non verificato esiste e rifiuta ogni pagamento, quindi
  // dirlo collegato sarebbe una bugia che si scopre al primo cliente.
  const stripePronto = ctx.venue.stripeChargesEnabled;
  const brandDaFinire = ctx.venue.onboardingStatus !== "COMPLETED";

  const v = ctx.venue;
  const embedSrc = `${baseUrl}/book?venue=${ctx.venueId}&embed=1`;
  const embedSnippet = `<iframe src="${embedSrc}" width="480" height="820" style="border:0;max-width:100%" title="Prenota un tavolo"></iframe>`;

  const contatti = [v.phone, v.email, v.address].filter(Boolean) as string[];
  const social = [
    v.websiteUrl && "sito",
    v.instagramUrl && "Instagram",
    v.facebookUrl && "Facebook",
    v.googleBusinessUrl && "Google",
  ].filter(Boolean) as string[];
  const colori = [v.brandAccent, v.brandSecondaryColor].filter(
    Boolean,
  ) as string[];

  return (
    /*
      `pb-[30vh]`: l'ultima sezione deve poter salire fino alla fascia alta
      della schermata, altrimenti «Sistema» non diventerebbe mai la voce
      accesa — l'osservatore guarda lì, e il fondo della pagina si fermerebbe
      prima. Un terzo di schermo di vuoto in fondo fa funzionare la barra fino
      all'ultima riga anche quando l'ultima sezione è corta.
    */
    <div className="animate-cambio-area pb-[30vh]">
      <div className="mx-auto w-full max-w-[1500px]">
        {/*
          Il nome della pagina lo dice già la testata, accanto al marchio del
          locale: qui resta la riga che aggiunge qualcosa, cioè di cosa si sta
          parlando.
        */}
        <p className="max-w-3xl text-sm text-muted-foreground">
          Come è configurato il locale e come si comporta il gestionale. Le
          modifiche valgono da subito.
        </p>

        {/*
          L'avviso del brand incompleto era una fascia larga quanto lo schermo,
          in cima a tutto: la prima cosa che si vedeva entrando nelle
          Impostazioni era un compito da fare, tutti i giorni, anche a chi era
          entrato per cambiare un turno. Adesso è un avviso della sua misura, e
          sta accanto alla cosa che riguarda.
        */}
        {brandDaFinire && can(ctx.role, "manage_venue") && (
          <Link
            href="/settings/brand"
            className="mt-4 inline-flex max-w-full items-center gap-3 rounded-full border border-accent/40 bg-accent/10 py-2 pl-4 pr-3 text-sm transition-colors hover:bg-accent/15"
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-accent-strong"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="font-medium">
                Configurazione del brand incompleta
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                {" "}
                — logo, colori e identità visiva
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-accent-strong"
              aria-hidden="true"
            />
          </Link>
        )}

        <BarraImpostazioniMobile />

        <div className="mt-8 space-y-14 md:mt-10 md:space-y-20">
          {/* ------------------------------------------------------------- */}
          <SezioneImpostazioni id="locale">
            <GruppoImpostazioni
              titolo="Brand"
              descrizione="Come si presenta il locale al cliente: sul modulo di prenotazione, sul portale Wi-Fi, nelle email."
              azione={
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/brand">Gestisci</Link>
                </Button>
              }
            >
              <RigaImpostazione
                nome="Logo del locale"
                descrizione="Compare in cima al modulo pubblico e nelle email agli ospiti."
              >
                {v.brandLogoUrl ? (
                  <img
                    src={v.brandLogoUrl}
                    alt=""
                    className="h-10 w-10 rounded-md border border-border object-contain"
                  />
                ) : (
                  <ValoreVuoto>non caricato</ValoreVuoto>
                )}
              </RigaImpostazione>

              <RigaImpostazione
                nome="Nome pubblico"
                descrizione="Il nome che legge il cliente."
              >
                <ValoreImpostazione>{v.name}</ValoreImpostazione>
              </RigaImpostazione>

              <RigaImpostazione nome="Colori del brand">
                {colori.length > 0 ? (
                  <span className="flex items-center gap-2">
                    {colori.map((c) => (
                      <span
                        key={c}
                        title={c}
                        className="h-5 w-5 rounded-full border border-border"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <ValoreImpostazione mono>
                      {colori.join(" · ")}
                    </ValoreImpostazione>
                  </span>
                ) : (
                  <ValoreVuoto>non scelti</ValoreVuoto>
                )}
              </RigaImpostazione>

              <RigaImpostazione nome="Immagine di copertina">
                {v.coverImage ? (
                  <img
                    src={v.coverImage}
                    alt=""
                    className="h-10 w-24 rounded-md border border-border object-cover"
                  />
                ) : (
                  <ValoreVuoto>non caricata</ValoreVuoto>
                )}
              </RigaImpostazione>

              <RigaImpostazione
                nome="Contatti pubblici"
                descrizione="Telefono, email e indirizzo mostrati a chi prenota."
              >
                {contatti.length > 0 ? (
                  <ValoreImpostazione>
                    {contatti.join(" · ")}
                  </ValoreImpostazione>
                ) : (
                  <ValoreVuoto />
                )}
              </RigaImpostazione>

              <RigaImpostazione nome="Presenza online">
                {social.length > 0 ? (
                  <ValoreImpostazione>{social.join(" · ")}</ValoreImpostazione>
                ) : (
                  <ValoreVuoto>nessun collegamento</ValoreVuoto>
                )}
              </RigaImpostazione>
            </GruppoImpostazioni>

            <GruppoImpostazioni
              titolo="Locali del gruppo"
              descrizione={ctx.org.name}
            >
              {venues.map((locale) => (
                <RigaImpostazione
                  key={locale.id}
                  nome={locale.name}
                  descrizione={[
                    locale.city,
                    NOME_TIPO_LOCALE[locale.kind] ?? locale.kind,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  {locale.id === ctx.venueId ? (
                    <Badge tone="gold">Attivo</Badge>
                  ) : (
                    <ValoreVuoto>secondario</ValoreVuoto>
                  )}
                </RigaImpostazione>
              ))}

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

          {/* ------------------------------------------------------------- */}
          <SezioneImpostazioni id="prenotazioni">
            <BookingWindowSettings
              windowDays={ctx.venue.bookingWindowDays}
              cutoffMin={ctx.venue.bookingCutoffMin}
              overbookingPct={ctx.venue.overbookingPct}
              largePartyFrom={ctx.venue.largePartyFrom}
              canManage={can(ctx.role, "manage_venue")}
            />

            <GruppoImpostazioni
              titolo="Widget di prenotazione"
              descrizione="Il codice da incollare sul sito del locale per far prenotare i clienti in autonomia."
              azione={
                <CopyButton value={embedSnippet} size="sm" variant="outline" />
              }
            >
              <RigaLibera>
                <pre className="overflow-x-auto rounded-md border border-border bg-black/20 p-3 text-xs">
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

          {/* ------------------------------------------------------------- */}
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
          </SezioneImpostazioni>

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
                {invioDem.replyTo ? (
                  <ValoreImpostazione>{invioDem.replyTo}</ValoreImpostazione>
                ) : (
                  <ValoreVuoto>l&apos;email del locale</ValoreVuoto>
                )}
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
                    {reputazioneDem.tassoSegnalazioni.toLocaleString("it-IT")}%
                  </ValoreImpostazione>
                </RigaImpostazione>
              )}
            </GruppoImpostazioni>
          </SezioneImpostazioni>

          {/* ------------------------------------------------------------- */}
          <SezioneImpostazioni id="sistema">
            {/* Sta qui e non in «Il locale» perché riguarda il proprio accesso,
                non il ristorante: è la stessa sezione dove si legge lo stato
                delle integrazioni e dei lavori. */}
            <MieiDispositivi />

            <AccessoTeam
              membri={membri}
              inviti={inviti}
              canManage={puoGestireTeam}
            />

            {/* Il telefono sta in Sistema accanto ai pagamenti: sono le due
                cose che si **collegano** al locale invece di configurarsi. */}
            <Centralino
              /* Collegare il centralino è `manage_phone`, non «chi gestisce
                 il team»: erano la stessa capacità per comodità, e le
                 credenziali SIP sono un numero da cui si telefona a spese del
                 locale. */
              canManage={can(ctx.role, "manage_phone")}
              venueId={ctx.venueId}
              sip={telefonoSip}
              collegamenti={chiaviCollegamento
                .filter((t) => !t.revocatoIl)
                .map((t) => ({ id: t.id, prefisso: t.prefisso }))}
              salute={{
                ultimaChiamata: salute.ultimaChiamata?.toISOString() ?? null,
                ultime24h: salute.ultime24h,
                collegamentoAttivo: salute.collegamentoAttivo,
                fornitore: salute.fornitore,
                nonSannoFare: salute.nonSannoFare,
              }}
              stato={{
                attivo: centralino.attivo,
                funzioni: centralino.funzioni,
                scadeIl: centralino.scadeIl?.toISOString() ?? null,
                attivatoIl: centralino.attivatoIl?.toISOString() ?? null,
                chiaveLeggibile: centralino.chiaveLeggibile,
                motivoSpento: centralino.motivoSpento,
              }}
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

            <GruppoImpostazioni
              titolo="Integrazioni"
              descrizione="I servizi esterni da cui dipende qualcosa che il locale usa."
            >
              <RigaImpostazione
                nome="Brevo"
                descrizione="Invio di campagne email e messaggi transazionali. La verifica guarda la presenza della chiave API, non la validità del dominio mittente."
              >
                <Badge tone={process.env.BREVO_API_KEY ? "success" : "warning"}>
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
        </div>
      </div>

      {/* In fondo: a questo punto tutte e quattro le sezioni si sono
          registrate, quindi c'è qualcosa a cui scendere. */}
      <ParteChiesta />
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

const NOME_PIANO: Record<string, string> = {
  STARTER: "Starter",
  GROWTH: "Growth",
  ENTERPRISE: "Enterprise",
};
