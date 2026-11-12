import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, MailCheck, MailOpen, MousePointerClick, Pencil, Users } from "lucide-react";
import { getActiveVenue } from "@/lib/tenant";
import {
  FINESTRA_ATTRIBUZIONE_GIORNI,
  getCampaign,
  getCampaignAttribution,
  getCampaignSendProgress,
  resolveSegment,
  type SegmentFilterType,
} from "@/server/campaigns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FasciaTessere, TesseraKpi } from "@/components/ui/tessera-kpi";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignSendStatus } from "@/components/campaigns/campaign-send-status";
import { AnnullaCampagna } from "@/components/campaigns/annulla-campagna";
import {
  AnteprimaEmail,
  Consegna,
  LinkCliccati,
  PiuAttivi,
  PrenotazioniArrivate,
  Tassi,
} from "@/components/campaigns/risultati-visivi";
import { AndamentoCampagna } from "@/components/campaigns/andamento-campagna";
import { statoCampagna } from "@/lib/campaign-status";
import {
  andamentoCampagna,
  mediaDelLocale,
  piuAttivi,
  prenotazioniDellaCampagna,
  risultatiCampagna,
} from "@/server/dem/statistiche";
import { superAdminCorrente } from "@/lib/super-admin";
import { PannelloBlocco } from "@/components/costi/pannello-blocco";
import { dettaglioCosti } from "@/server/costi/dettaglio";

export const dynamic = "force-dynamic";

const LOYALTY_LABELS: Record<string, string> = {
  NEW: "Nuovo",
  REGULAR: "Abituale",
  VIP: "VIP",
  AMBASSADOR: "Ambassador",
};

const NUM = new Intl.NumberFormat("it-IT");
const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const QUANDO = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function pct(parte: number, base: number) {
  return base > 0 ? Math.round((parte / base) * 1000) / 10 : null;
}

/**
 * Il report di una campagna.
 *
 * Terza revisione dell'11 novembre 2026, sul modello dei report di Mailchimp
 * e Klaviyo: le sezioni una sotto l'altra, ognuna una domanda.
 *
 * 1. **Testata**: oggetto, quando è partita, a chi — come un messaggio.
 * 2. **Quattro numeri**: consegnate, aperte, click, prenotazioni.
 * 3. **I tassi contro la media del locale** (le barre «list average»).
 * 4. **Le prime 48 ore**, ora per ora.
 * 5. **Link più cliccati** e **chi ha interagito di più**, affiancati e
 *    della stessa altezza.
 * 6. **Le prenotazioni arrivate**, una per riga (gli «ordini» di Klaviyo).
 * 7. **La consegna**, e in fondo **l'email** com'è arrivata.
 *
 * I tassi si leggono su chi ha ricevuto, come fa Mailchimp: i rimbalzi non
 * potevano aprire. Se il fornitore non manda le consegne, sulle inviate, e
 * la riga sotto il numero dice quale delle due.
 *
 * Una bozza, che non ha numeri, mostra testata, email e invio.
 */
export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const ctx = await getActiveVenue();
  const campaign = await getCampaign(ctx.venueId, params.id);
  if (!campaign) notFound();

  const segment = (campaign.segment as SegmentFilterType | null) ?? {};
  const matchingGuests = campaign.status === "DRAFT" ? await resolveSegment(ctx.venueId, segment) : [];
  const stato = statoCampagna(campaign.status, campaign.scheduledAt);
  const inCoda = campaign.status === "SENDING" || campaign.status === "QUEUED" || campaign.status === "FAILED";
  // Finché non è uscita niente, si può ancora fermare: programmata o in coda.
  const annullabile = campaign.status === "SCHEDULED" || campaign.status === "QUEUED";
  const avanzamento = inCoda ? await getCampaignSendProgress(ctx.venueId, campaign.id) : null;

  /*
    Il riquadro del blocco economico.

    Due condizioni, e servono entrambe: la campagna è stata fermata dal freno,
    e chi guarda amministra la piattaforma. Il controllo su chi guarda è
    **server-side** — la pagina non rende nemmeno il markup — perché nascondere
    con il CSS un dato che il cliente non deve avere significa spedirglielo lo
    stesso.
  */
  const admin = await superAdminCorrente();
  const blocco =
    admin.ok && campaign.blockedReason && campaign.blockedAt
      ? {
          motivo: campaign.blockedReason,
          quando: campaign.blockedAt,
          dati: (campaign.blockedDetail as Record<string, unknown> | null) ?? {},
        }
      : null;
  const costi = blocco ? await dettaglioCosti(ctx.venueId) : null;
  const resa = await getCampaignAttribution(ctx.venueId, campaign.id);
  // I risultati dettagliati esistono solo per le campagne che abbiamo mandato
  // noi, destinatario per destinatario: su quelle consegnate a un fornitore
  // esterno non tornano indietro gli eventi, e inventarli sarebbe peggio.
  const risultati = campaign.sentCount > 0 ? await risultatiCampagna(ctx.venueId, campaign.id) : null;
  const r = risultati && risultati.inviate > 0 ? risultati : null;
  const [andamento, media, attivi, arrivate] = r
    ? await Promise.all([
        andamentoCampagna(ctx.venueId, campaign.id),
        mediaDelLocale(ctx.venueId, campaign.id),
        piuAttivi(ctx.venueId, campaign.id),
        prenotazioniDellaCampagna(ctx.venueId, campaign.id),
      ])
    : [null, null, [], []];

  const filtri = [
    ...(segment.inactiveDays !== undefined ? [`Inattivi da ${segment.inactiveDays} giorni`] : []),
    ...(segment.loyaltyTier ? [`Livello ${LOYALTY_LABELS[segment.loyaltyTier]}`] : []),
    ...(segment.minTotalVisits !== undefined ? [`Almeno ${segment.minTotalVisits} visite`] : []),
    ...(segment.tags ?? []).map((t) => `Tag: ${t}`),
  ];

  const partita = campaign.sendingStartedAt ?? campaign.sentAt ?? resa.sentAt;
  const base = r ? (r.consegnate > 0 ? r.consegnate : r.inviate) : 0;
  const nomeBase = r && r.consegnate > 0 ? "consegnate" : "inviate";

  return (
    <div className="schermo animate-fade-in gap-4">
      <header className="fissa flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="t-etichetta">Marketing / Campagne</p>
          <h1 className="text-display text-3xl">{campaign.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={stato.tone}>{stato.label}</Badge>
          {campaign.status === "DRAFT" && (
            <Button asChild variant="outline">
              <Link href={`/campaigns/${campaign.id}/edit`}>
                <Pencil className="h-4 w-4" /> Continua modifica
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="fill-scroll space-y-4 pr-0.5">
        {/* In cima a tutto: se la campagna è ferma, è la prima cosa da sapere. */}
        {blocco && costi && (
          <PannelloBlocco
            campaignId={campaign.id}
            venueId={ctx.venueId}
            blocco={blocco}
            budgetBaseCents={costi.budgetBaseCents}
            overrideBudgetCents={costi.overrideBudgetCents}
            budgetCents={costi.budgetCents}
            emailLimite={costi.emailLimite}
          />
        )}

        {/* ------------------------------------------------------ testata */}
        <Card>
          <CardContent className="space-y-3 pt-5">
            <div>
              <p className="t-etichetta">Oggetto</p>
              <p className="mt-1 text-display text-2xl leading-snug">{campaign.subject || "Senza oggetto"}</p>
              {campaign.previewText && <p className="mt-0.5 text-base text-muted-foreground">{campaign.previewText}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-base">
              {partita && campaign.status !== "DRAFT" && (
                <span className="text-foreground first-letter:uppercase">
                  {campaign.status === "SCHEDULED" ? "In partenza " : "Partita "}
                  {QUANDO.format(partita)}
                </span>
              )}
              {partita && campaign.status !== "DRAFT" && <span className="text-muted-foreground">·</span>}
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Users className="h-4 w-4 text-accent-strong" aria-hidden="true" />
                {r
                  ? `${NUM.format(r.inviate)} clienti`
                  : campaign.status === "DRAFT"
                    ? `${NUM.format(matchingGuests.length)} clienti oggi nel segmento`
                    : "a"}
              </span>
              {(filtri.length === 0 ? ["Tutti i clienti con consenso"] : filtri).map((f) => (
                <span key={f} className="rounded-full border border-border/70 bg-card-sunken/60 px-3 py-0.5 text-sm text-foreground">
                  {f}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {!r && <EmailCard />}

        {campaign.status === "DRAFT" && (
          <Card>
            <CardHeader>
              <CardTitle>Invio</CardTitle>
              <CardDescription>{matchingGuests.length} destinatari con email e consenso.</CardDescription>
            </CardHeader>
            <CardContent>
              <CampaignActions campaignId={campaign.id} recipients={matchingGuests.length} />
            </CardContent>
          </Card>
        )}

        {annullabile && (
          <Card>
            <CardHeader>
              <CardTitle>Prima che parta</CardTitle>
              <CardDescription>
                {campaign.scheduledAt
                  ? "La campagna è in calendario: da qui si ferma."
                  : "La campagna è in coda e non è ancora uscita: da qui si ferma."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnnullaCampagna campaignId={campaign.id} invii={campaign.reservedCount} />
            </CardContent>
          </Card>
        )}

        {inCoda && (
          <Card>
            <CardHeader>
              <CardTitle>Invio</CardTitle>
              {stato.hint && <CardDescription>{stato.hint}</CardDescription>}
            </CardHeader>
            <CardContent>
              <CampaignSendStatus
                campaignId={campaign.id}
                status={campaign.status === "FAILED" ? "FAILED" : "SENDING"}
                progress={avanzamento}
              />
            </CardContent>
          </Card>
        )}

        {r && (
          <>
            {/* -------------------------------------------- quattro numeri */}
            <FasciaTessere colonne={4}>
              <TesseraKpi
                icona={MailCheck}
                etichetta={["Consegnata", "Consegnate"]}
                valore={r.consegnate > 0 ? r.consegnate : r.inviate}
                nota={r.consegnate > 0 ? `su ${NUM.format(r.inviate)} inviate` : "inviate · consegne non tracciate"}
              />
              <TesseraKpi icona={MailOpen} etichetta={["Aperta", "Aperte"]} valore={r.aperte} nota={["persona diversa", "persone diverse"]} />
              <TesseraKpi icona={MousePointerClick} etichetta="Click" valore={r.click} nota={["persona sul link", "persone sul link"]} />
              <TesseraKpi
                icona={CalendarCheck}
                etichetta={["Prenotazione", "Prenotazioni"]}
                valore={resa.bookings}
                nota={
                  resa.bookings === 0
                    ? `nessuna entro ${FINESTRA_ATTRIBUZIONE_GIORNI} giorni`
                    : `${resa.covers} coperti${resa.revenueCents != null ? ` · ${EURO.format(resa.revenueCents / 100)}` : ""}`
                }
              />
            </FasciaTessere>

            {/* ------------------------------------------------------ tassi */}
            <Card>
              <CardHeader>
                <CardTitle>È andata bene?</CardTitle>
                <CardDescription>
                  {media
                    ? `Confrontata con la media delle altre ${media.campagne === 1 ? "campagna" : `${media.campagne} campagne`} del locale.`
                    : "Quando il locale avrà altre campagne, qui vedrai il confronto."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tassi
                  tassi={[
                    {
                      nome: "Tasso di apertura",
                      icona: "apertura",
                      valore: pct(r.aperte, base),
                      media: media?.apertura ?? null,
                      dettaglio: `${NUM.format(r.aperte)} su ${NUM.format(base)} ${nomeBase}`,
                    },
                    {
                      nome: "Tasso di click",
                      icona: "click",
                      valore: pct(r.click, base),
                      media: media?.click ?? null,
                      dettaglio: `${NUM.format(r.click)} su ${NUM.format(base)} ${nomeBase}`,
                    },
                    {
                      nome: "Tasso di prenotazione",
                      icona: "prenotazione",
                      valore: pct(resa.bookings, base),
                      media: null,
                      dettaglio: `${NUM.format(resa.bookings)} su ${NUM.format(base)} ${nomeBase}`,
                    },
                  ]}
                />
              </CardContent>
            </Card>

            {/* ------------------------------------------------ prime 48 ore */}
            {andamento && partita && (
              <Card>
                <CardHeader>
                  <CardTitle>Le prime ore</CardTitle>
                  <CardDescription>Quando le persone hanno aperto e cliccato, ora per ora dall&apos;invio.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AndamentoCampagna dati={andamento} inizio={partita.toISOString()} />
                </CardContent>
              </Card>
            )}

            {/* --------------------------------------- link e persone, pari */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Link più cliccati</CardTitle>
                  <CardDescription>Dove sono andati, dall&apos;email.</CardDescription>
                </CardHeader>
                <CardContent>
                  <LinkCliccati link={r.linkPiuCliccati} />
                </CardContent>
              </Card>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Chi ha interagito di più</CardTitle>
                  <CardDescription>Prima chi ha cliccato, poi chi ha aperto più volte.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PiuAttivi persone={attivi} />
                </CardContent>
              </Card>
            </div>

            {/* ------------------------------------------------ prenotazioni */}
            <Card>
              <CardHeader>
                <CardTitle>Le prenotazioni arrivate</CardTitle>
                <CardDescription>
                  {resa.bookings > 0
                    ? `${resa.bookings} ${resa.bookings === 1 ? "prenotazione" : "prenotazioni"} dal link, ${resa.covers} coperti${
                        resa.revenueCents != null ? ` · circa ${EURO.format(resa.revenueCents / 100)} sullo scontrino medio` : ""
                      }.`
                    : `Quelle nate dal link dell'email nei ${FINESTRA_ATTRIBUZIONE_GIORNI} giorni dopo l'invio.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PrenotazioniArrivate prenotazioni={arrivate} />
              </CardContent>
            </Card>

            {/* ---------------------------------------------------- consegna */}
            <Card>
              <CardHeader>
                <CardTitle>La consegna</CardTitle>
                <CardDescription>Gli esiti, aggiornati man mano che arrivano.</CardDescription>
              </CardHeader>
              <CardContent>
                <Consegna r={r} />
              </CardContent>
            </Card>

            <EmailCard />

            {/* Le note d'onestà stanno in fondo, insieme e piccole: in mezzo
                ai numeri li coprivano. Quello che dicono non cambia. */}
            <footer className="space-y-1.5 px-1 pb-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                Le aperture sono una stima: alcuni programmi di posta le contano da soli, altri non le segnalano
                affatto. Servono per confrontare una campagna con l&apos;altra, non come conteggio esatto di chi ha letto.
              </p>
              <p>
                Le prenotazioni sono quelle nate dal link di questa email entro {FINESTRA_ATTRIBUZIONE_GIORNI} giorni
                dall&apos;invio, senza le disdette e chi non si è presentato.
                {resa.fuoriFinestra > 0 && ` Altre ${resa.fuoriFinestra} sono arrivate dallo stesso link più tardi e non le contiamo.`}
                {resa.bookings > 0 && resa.revenueCents == null && " Imposta lo scontrino medio in Impostazioni per vedere quanto valgono."}
              </p>
            </footer>
          </>
        )}

        {!r && (campaign.status === "SENT" || campaign.status === "SCHEDULED") && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
                <p className="text-base font-medium text-foreground">Nessun invio ancora registrato.</p>
                <p className="mt-1 text-sm text-muted-foreground">I risultati appariranno qui una volta inviata la campagna.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  function EmailCard() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>L&apos;email</CardTitle>
          <CardDescription>Come l&apos;hanno ricevuta.</CardDescription>
        </CardHeader>
        <CardContent>
          <AnteprimaEmail
            mittente={ctx.venue.name}
            oggetto={campaign!.subject ?? ""}
            anteprima={campaign!.previewText}
            corpo={campaign!.body || ""}
          />
        </CardContent>
      </Card>
    );
  }
}
