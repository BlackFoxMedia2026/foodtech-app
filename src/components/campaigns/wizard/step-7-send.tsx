"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { hasUnsubscribeBlock } from "@/lib/campaign-blocks";
import {
  ErroreApi,
  fetchProviderStatus,
  fetchSegmentPreview,
  sendCampaignNow,
  scheduleCampaignAt,
} from "@/lib/campaign-wizard-api";
import {
  QuotaInsufficienteDialog,
  type QuotaMancante,
} from "@/components/dem/quota-insufficiente";
import { quotaDelPiano } from "./quota-piano";
import { useWizardDispatch, useWizardState } from "./wizard-context";

function ChecklistRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-sage-strong" /> : <X className="h-4 w-4 text-destructive" />}
      <span className={cn(!ok && "text-destructive-soft")}>{label}</span>
    </li>
  );
}

export function Step7Send() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaMancante, setQuotaMancante] = useState<QuotaMancante | null>(null);

  useEffect(() => {
    if (state.providerConfigured === null) {
      fetchProviderStatus()
        .then((r) => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: r.configured }))
        .catch(() => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: false }));
    }
    if (!state.segmentPreview) {
      fetchSegmentPreview(state.segment).then((preview) => dispatch({ type: "SET_SEGMENT_PREVIEW", preview }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUnsubscribe = hasUnsubscribeBlock(state.contentBlocks);
  const destinatari = state.segmentPreview?.finalRecipients ?? 0;
  const hasRecipients = destinatari > 0;
  const quota = quotaDelPiano(state);
  const providerConfigured = !!state.providerConfigured;
  const canSend = hasUnsubscribe && hasRecipients && providerConfigured && !!state.campaignId;

  /**
   * Gli invii finiti hanno una finestra, non una riga rossa: è una scelta da
   * fare — piano più grande o meno destinatari — e una riga d'errore non
   * offre né l'una né l'altra.
   */
  function mostraQuota(err: unknown): boolean {
    if (err instanceof ErroreApi && err.code === "dem_quota_insufficient" && err.detail) {
      setQuotaMancante(err.detail as QuotaMancante);
      return true;
    }
    return false;
  }

  async function handleSaveDraft() {
    router.push("/campaigns");
  }

  async function handleSendNow() {
    if (!state.campaignId) return;
    setBusy(true);
    setError(null);
    try {
      await sendCampaignNow(state.campaignId);
      router.push(`/campaigns/${state.campaignId}`);
    } catch (err) {
      if (!mostraQuota(err)) setError(err instanceof Error ? err.message : "Invio non riuscito");
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule() {
    if (!state.campaignId || !scheduledAt) return;
    setBusy(true);
    setError(null);
    try {
      await scheduleCampaignAt(state.campaignId, new Date(scheduledAt).toISOString());
      router.push(`/campaigns/${state.campaignId}`);
    } catch (err) {
      if (!mostraQuota(err)) {
        setError(err instanceof Error ? err.message : "Programmazione non riuscita");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-lg">Invia o programma</h2>
        <p className="text-sm text-muted-foreground">Controlla la checklist prima di procedere.</p>
      </div>

      <ul className="space-y-2 riquadro p-4">
        <ChecklistRow ok={hasUnsubscribe} label="Link di disiscrizione presente" />
        <ChecklistRow ok={hasRecipients} label={`Destinatari validi (${destinatari.toLocaleString("it-IT")})`} />
        <ChecklistRow ok label="Consenso marketing rispettato (sempre applicato)" />
        {/* Il nome del fornitore non compare: per chi usa Foodtech l'invio è
            di Foodtech, e sapere da chi passa non gli serve per decidere. */}
        <ChecklistRow ok={providerConfigured} label="Invio email attivo" />
        {quota && (
          <ChecklistRow
            ok={quota.disponibili >= destinatari}
            label={`Invii disponibili (${quota.disponibili.toLocaleString("it-IT")} nel piano, ${destinatari.toLocaleString("it-IT")} richiesti)`}
          />
        )}
        <ChecklistRow ok={state.testEmailSentThisSession} label="Email di test inviata (consigliato, non obbligatorio)" />
      </ul>

      {error && <p className="text-sm text-destructive-soft">{error}</p>}

      <QuotaInsufficienteDialog quota={quotaMancante} onClose={() => setQuotaMancante(null)} />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={handleSaveDraft}>
          Salva bozza ed esci
        </Button>
        <Button variant="accent" onClick={handleSendNow} disabled={!canSend || busy}>
          Invia ora
        </Button>
      </div>

      <div className="space-y-2 riquadro p-4">
        <Label htmlFor="scheduledAt">Programma invio</Label>
        <div className="flex gap-2">
          <Input id="scheduledAt" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          <Button variant="outline" onClick={handleSchedule} disabled={!canSend || busy || !scheduledAt}>
            Programma
          </Button>
        </div>
      </div>
    </div>
  );
}
