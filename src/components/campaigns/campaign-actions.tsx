"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CampaignActions({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");

  async function sendNow() {
    if (!confirm("Inviare subito questa campagna al segmento selezionato?")) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "campaign_already_sent" ? "Questa campagna è già stata inviata." : "Invio non riuscito.");
      return;
    }
    router.refresh();
  }

  async function schedule() {
    if (!scheduledAt) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/schedule`, {
      method: "POST",
      body: JSON.stringify({ at: scheduledAt }),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "campaign_already_sent" ? "Questa campagna è già stata inviata." : "Programmazione non riuscita.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="gold" disabled={submitting} onClick={sendNow}>
          Invia ora
        </Button>
        <Input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-56"
        />
        <Button variant="outline" disabled={submitting || !scheduledAt} onClick={schedule}>
          Programma
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
