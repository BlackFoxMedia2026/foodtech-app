"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { compileBlocksToHtml } from "@/lib/campaign-blocks-compiler";
import { fetchProviderStatus, sendTestEmail } from "@/lib/campaign-wizard-api";
import { useWizardDispatch, useWizardState } from "./wizard-context";

export function Step5PreviewTest() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    fetchProviderStatus()
      .then((r) => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: r.configured }))
      .catch(() => dispatch({ type: "SET_PROVIDER_CONFIGURED", configured: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const html = compileBlocksToHtml(state.contentBlocks);

  async function handleSendTest() {
    if (!state.campaignId || !testEmail) return;
    setSending(true);
    setTestError(null);
    setTestSuccess(false);
    try {
      await sendTestEmail(state.campaignId, testEmail);
      dispatch({ type: "MARK_TEST_SENT" });
      setTestSuccess(true);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Invio non riuscito");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-lg">Anteprima e test</h2>
        <p className="text-sm text-muted-foreground">Controlla come apparirà l&apos;email prima di inviarla.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="subject">Oggetto email</Label>
          <Input id="subject" value={state.subject} onChange={(e) => dispatch({ type: "SET_SUBJECT", subject: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="previewText">Preview text</Label>
          <Input
            id="previewText"
            value={state.previewText}
            onChange={(e) => dispatch({ type: "SET_PREVIEW_TEXT", previewText: e.target.value })}
            placeholder="Testo di anteprima mostrato dal client email"
          />
        </div>
        <div className="space-y-1">
          <Label>Nome mittente</Label>
          <p className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">{state.senderName}</p>
        </div>
        <div className="space-y-1">
          <Label>Email mittente</Label>
          <p className="rounded-md border border-border bg-secondary/50 px-3 py-2 text-sm text-muted-foreground">{state.senderEmail}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Mittente configurato a livello di provider — la personalizzazione per singola campagna non è ancora disponibile.
      </p>

      <div className="rounded-md border border-border bg-secondary/50 p-3 text-sm">
        <p>Destinatari: {state.segmentPreview?.finalRecipients ?? "—"}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={cn("flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs", viewport === "desktop" ? "border-accent bg-accent/10" : "border-border")}
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={cn("flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs", viewport === "mobile" ? "border-accent bg-accent/10" : "border-border")}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile
          </button>
        </div>
        <div className="flex justify-center rounded-md border border-border bg-secondary/30 p-4">
          <iframe
            title="Anteprima email"
            srcDoc={html}
            className="rounded bg-white"
            style={{ width: viewport === "desktop" ? 600 : 375, height: 500 }}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-border p-4">
        <Label htmlFor="test-email">Invia email di test</Label>
        <div className="flex gap-2">
          <Input
            id="test-email"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="tuo@indirizzo.it"
          />
          <Button onClick={handleSendTest} disabled={sending || !testEmail || !state.campaignId}>
            {sending ? "Invio..." : "Invia test"}
          </Button>
        </div>
        {testError && <p className="text-xs text-rose-600">{testError}</p>}
        {testSuccess && <p className="text-xs text-emerald-600">Email di test inviata.</p>}
      </div>
    </div>
  );
}
