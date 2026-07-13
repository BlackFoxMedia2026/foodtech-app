"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { hasUnsubscribeBlock } from "@/lib/campaign-blocks";
import { fetchProviderStatus, fetchSegmentPreview, sendCampaignNow, scheduleCampaignAt } from "@/lib/campaign-wizard-api";
import { useWizardDispatch, useWizardState } from "./wizard-context";

function ChecklistRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-500" />}
      <span className={cn(!ok && "text-rose-600")}>{label}</span>
    </li>
  );
}

export function Step6Send() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const router = useRouter();
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const hasRecipients = (state.segmentPreview?.finalRecipients ?? 0) > 0;
  const providerConfigured = !!state.providerConfigured;
  const canSend = hasUnsubscribe && hasRecipients && providerConfigured && !!state.campaignId;

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
      setError(err instanceof Error ? err.message : "Invio non riuscito");
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
      setError(err instanceof Error ? err.message : "Programmazione non riuscita");
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

      <ul className="space-y-2 rounded-md border border-border p-4">
        <ChecklistRow ok={hasUnsubscribe} label="Link di disiscrizione presente" />
        <ChecklistRow ok={hasRecipients} label={`Destinatari validi (${state.segmentPreview?.finalRecipients ?? 0})`} />
        <ChecklistRow ok label="Consenso marketing rispettato (sempre applicato)" />
        <ChecklistRow ok={providerConfigured} label="Brevo configurato" />
        <ChecklistRow ok={state.testEmailSentThisSession} label="Email di test inviata (consigliato, non obbligatorio)" />
      </ul>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={handleSaveDraft}>
          Salva bozza ed esci
        </Button>
        <Button variant="gold" onClick={handleSendNow} disabled={!canSend || busy}>
          Invia ora
        </Button>
      </div>

      <div className="space-y-2 rounded-md border border-border p-4">
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
