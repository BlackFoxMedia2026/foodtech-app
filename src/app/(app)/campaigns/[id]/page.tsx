import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, MailOpen, MousePointerClick, Pencil, Send, Users } from "lucide-react";
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
import { AnteprimaEmail, Cronologia, LinkCliccati, Percorso, SaluteInvio } from "@/components/campaigns/risultati-visivi";
import { AndamentoCampagna } from "@/components/campaigns/andamento-campagna";
import { statoCampagna } from "@/lib/campaign-status";
import { andamentoCampagna, risultatiCampagna, type RisultatiCampagna } from "@/server/dem/statistiche";
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

/* I tassi si leggono su chi ha ricevuto; se il fornitore non manda gli esiti
   di consegna, sulle inviate — e la nota della tessera dice quale delle due. */
function baseTassi(r: RisultatiCampagna) {
  return r.consegnate > 0 ? r.consegnate : r.inviate;
}
function percento(parte: number, base: number) {
  return base > 0 ? Math.round((parte / base) * 1000) / 10 : undefined;
}
function quota(parte: number, base: number) {
  const v = percento(parte, base);
  return v === undefined ? "—" : `${v.toLocaleString("it-IT")}%`;
}

/**
 * Il dettaglio di una campagna.
 *
 * Revisione dell'11 novembre 2026: la pagina era «troppo caotica» — otto
 * numeri tutti alla stessa voce, un grafico che ne ripeteva tre, le note in
 * mezzo. Ora si legge dall'alto in basso come una risposta:
 *
 * 1. **quattro tessere** (inviate, aperture, click, prenotazioni), le stesse
 *    della Panoramica del locale;
 * 2. **il percorso** (imbuto) accanto all'**arrivo** (esiti di consegna);
 * 3. **nel tempo**: aperture e click giorno per giorno;
 * 4. **l'email** com'è arrivata e **a chi** è andata;
 * 5. la **cronologia** come linea del tempo, e le note in fondo.
 *
 * Una bozza, che non ha numeri, apre direttamente su email e pubblico.
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
  const andamento = r ? await andamentoCampagna(ctx.venueId, campaign.id) : [];

  const filtri = [
    ...(segment.inactiveDays !== undefined ? [`Inattivi da ${segment.inactiveDays} giorni`] : []),
    ...(segment.loyaltyTier ? [`Livello ${LOYALTY_LABELS[segment.loyaltyTier]}`] : []),
    ...(segment.minTotalVisits !== undefined ? [`Almeno ${segment.minTotalVisits} visite`] : []),
    ...(segment.tags ?? []).map((t) => `Tag: ${t}`),
  ];

  const emailEPubblico = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>L&apos;email</CardTitle>
        </CardHeader>
        <CardContent>
          <AnteprimaEmail oggetto={campaign.subject ?? ""} corpo={campaign.body || ""} />
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent-strong" aria-hidden="true" /> A chi va
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {campaign.status === "DRAFT" && (
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-3xl tabular-nums text-foreground">{NUM.format(matchingGuests.length)}</span>
                <span className="text-base text-muted-foreground">clienti oggi nel segmento</span>
              </p>
            )}
            <ul className="flex flex-wrap gap-2">
              {filtri.length === 0 ? (
                <li className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground">Tutti i clienti</li>
              ) : (
                filtri.map((f) => (
                  <li key={f} className="rounded-full border border-border/70 bg-card-sunken/60 px-3 py-1 text-sm text-foreground">
                    {f}
                  </li>
                ))
              )}
            </ul>
            <p className="text-sm text-muted-foreground">Solo clienti con consenso marketing attivo ed email valida.</p>
          </CardContent>
        </Card>
        {r && r.linkPiuCliccati.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Link più cliccati</CardTitle>
            </CardHeader>
            <CardContent>
              <LinkCliccati link={r.linkPiuCliccati} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

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

        {!r && emailEPubblico}

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
            {/* ----------------------------------------- i quattro numeri */}
            <FasciaTessere colonne={4}>
              <TesseraKpi
                icona={Send}
                etichetta={r.inviate === 1 ? "Inviata" : "Inviate"}
                valore={NUM.format(r.inviate)}
                nota={r.consegnate > 0 ? `${NUM.format(r.consegnate)} consegnate` : "esiti di consegna non arrivati"}
              />
              <TesseraKpi
                icona={MailOpen}
                etichetta="Aperture"
                valore={quota(r.aperte, baseTassi(r))}
                barra={percento(r.aperte, baseTassi(r))}
                nota={`${NUM.format(r.aperte)} su ${NUM.format(baseTassi(r))} ${r.consegnate > 0 ? "consegnate" : "inviate"}`}
              />
              <TesseraKpi
                icona={MousePointerClick}
                etichetta="Click"
                valore={quota(r.click, baseTassi(r))}
                barra={percento(r.click, baseTassi(r))}
                nota={`${NUM.format(r.click)} ${r.click === 1 ? "persona ha" : "persone hanno"} cliccato`}
              />
              <TesseraKpi
                icona={CalendarCheck}
                etichetta={["Prenotazione", "Prenotazioni"]}
                valore={resa.bookings}
                nota={
                  resa.bookings === 0
                    ? `nessuna dal link, entro ${FINESTRA_ATTRIBUZIONE_GIORNI} giorni`
                    : `${resa.covers} coperti${resa.revenueCents != null ? ` · ${EURO.format(resa.revenueCents / 100)} stimati` : ""}`
                }
              />
            </FasciaTessere>

            {/* -------------------------------------- percorso e arrivo */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
              <Card>
                <CardHeader>
                  <CardTitle>Il percorso</CardTitle>
                  <CardDescription>Dall&apos;invio alla prenotazione: ogni barra sulla stessa base, le email inviate.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Percorso r={r} prenotazioni={resa.bookings} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>L&apos;arrivo</CardTitle>
                  <CardDescription>Aggiornato man mano che gli esiti arrivano.</CardDescription>
                </CardHeader>
                <CardContent>
                  <SaluteInvio r={r} />
                </CardContent>
              </Card>
            </div>

            {andamento.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Nel tempo</CardTitle>
                  <CardDescription>La prima apertura e il primo click di ogni persona, giorno per giorno dall&apos;invio.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AndamentoCampagna giorni={andamento} />
                </CardContent>
              </Card>
            )}

            {emailEPubblico}

            {r.tappe.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Cronologia</CardTitle>
                </CardHeader>
                <CardContent>
                  <Cronologia tappe={r.tappe} />
                </CardContent>
              </Card>
            )}

            {/* Le note d'onestà stanno in fondo, insieme e piccole: in mezzo
                ai numeri li coprivano. Quello che dicono non cambia. */}
            <footer className="space-y-1.5 px-1 pb-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                Le aperture sono una stima: alcuni programmi di posta le contano da soli, altri non le segnalano
                affatto. Servono per confrontare una campagna con l&apos;altra, non come conteggio esatto di chi ha letto.
              </p>
              <p>
                Le prenotazioni sono quelle nate dal link di questa email entro {FINESTRA_ATTRIBUZIONE_GIORNI} giorni
                dall&apos;invio, senza le disdette e chi non si è presentato: una prenotazione disdetta è arrivata
                dalla campagna ma non ha portato nessuno a tavola.
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
}
