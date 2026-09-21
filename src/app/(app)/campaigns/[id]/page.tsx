import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Pencil } from "lucide-react";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { CampaignResultsChart } from "@/components/campaigns/campaign-results-chart";
import { CampaignSendStatus } from "@/components/campaigns/campaign-send-status";
import { AnnullaCampagna } from "@/components/campaigns/annulla-campagna";
import { statoCampagna } from "@/lib/campaign-status";
import { RisultatiDem } from "@/components/campaigns/risultati-dem";
import { risultatiCampagna } from "@/server/dem/statistiche";
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

      <div className="fill-scroll space-y-6 pr-0.5">
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

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Segmento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {segment.tags && segment.tags.length > 0 && (
                <p>
                  <span className="text-muted-foreground">Tag:</span> {segment.tags.join(", ")}
                </p>
              )}
              {segment.loyaltyTier && (
                <p>
                  <span className="text-muted-foreground">Livello fedeltà:</span> {LOYALTY_LABELS[segment.loyaltyTier]}
                </p>
              )}
              {segment.minTotalVisits !== undefined && (
                <p>
                  <span className="text-muted-foreground">Visite minime:</span> {segment.minTotalVisits}
                </p>
              )}
              {segment.inactiveDays !== undefined && (
                <p>
                  <span className="text-muted-foreground">Inattivo da:</span> {segment.inactiveDays} giorni
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Solo clienti con consenso marketing attivo ed email valida vengono inclusi.
              </p>
              {campaign.status === "DRAFT" && (
                <p className="pt-2 text-sm font-medium">
                  {matchingGuests.length} clienti corrispondono al segmento oggi
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contenuto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Oggetto:</span> {campaign.subject}
              </p>
              <div
                className="rounded-md border bg-secondary/30 p-3 text-xs"
                dangerouslySetInnerHTML={{ __html: campaign.body || "" }}
              />
            </CardContent>
          </Card>
        </div>

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

        {risultati && risultati.inviate > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Risultati</CardTitle>
              <CardDescription>Aggiornati man mano che gli esiti arrivano.</CardDescription>
            </CardHeader>
            <CardContent>
              <RisultatiDem r={risultati} />
            </CardContent>
          </Card>
        )}

        {(campaign.status === "SENT" || campaign.status === "SCHEDULED") && (
          <Card>
            <CardHeader>
              <CardTitle>Prenotazioni generate</CardTitle>
            </CardHeader>
            <CardContent>
              <CampaignResultsChart
                sentCount={campaign.sentCount}
                openedCount={campaign.openedCount}
                bookings={resa.bookings}
                covers={resa.covers}
                revenueCents={resa.revenueCents}
                fuoriFinestra={resa.fuoriFinestra}
                giorniFinestra={FINESTRA_ATTRIBUZIONE_GIORNI}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
