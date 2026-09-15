"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { compileEmailDocument } from "@/lib/campaign-blocks-compiler";
import { fetchProviderStatus, sendTestEmail } from "@/lib/campaign-wizard-api";
import { useWizardDispatch, useWizardState } from "./wizard-context";

export function Step6PreviewTest() {
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

  /* Il documento intero, impostazioni comprese: l'anteprima compilava solo i
     blocchi coi valori predefiniti, quindi larghezza, carattere e colore del
     foglio scelti nell'editor non si vedevano qui — e quello che si controlla
     prima di premere «Invia» dev'essere l'email che parte. */
  const html = compileEmailDocument(
    { version: 2, settings: state.emailSettings, blocks: state.contentBlocks },
    state.brandPrimaryColor || undefined,
  );

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
        <h2 className="text-display text-2xl">Anteprima e test</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controlla come apparirà l&apos;email prima di inviarla.
        </p>
      </div>

      {/* L'email a sinistra grande quanto può essere, i campi a destra: è
          l'anteprima la cosa che si guarda in questo passo. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                viewport === "desktop"
                  ? "border-accent-strong bg-accent-strong/10 text-accent-strong"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                viewport === "mobile"
                  ? "border-accent-strong bg-accent-strong/10 text-accent-strong"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              <Smartphone className="h-3.5 w-3.5" /> Mobile
            </button>
          </div>
          <div className="recessed flex justify-center rounded-xl bg-background/50 p-4 md:p-6">
            <iframe
              title="Anteprima email"
              srcDoc={html}
              className="rounded bg-white"
              style={{ width: viewport === "desktop" ? 600 : 375, height: "min(70vh, 760px)", maxWidth: "100%" }}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Oggetto email</Label>
            <Input
              id="subject"
              value={state.subject}
              onChange={(e) => dispatch({ type: "SET_SUBJECT", subject: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="previewText">Testo di anteprima</Label>
            <Input
              id="previewText"
              value={state.previewText}
              onChange={(e) => dispatch({ type: "SET_PREVIEW_TEXT", previewText: e.target.value })}
              placeholder="La riga che il client email mostra sotto l'oggetto"
            />
          </div>

          <div className="riquadro comodo space-y-1 bg-secondary/30">
            <p className="t-etichetta">Mittente</p>
            <p className="text-sm">{state.senderName}</p>
            <p className="text-xs text-muted-foreground">{state.senderEmail}</p>
          </div>

          <div className="riquadro comodo bg-secondary/30">
            <p className="t-etichetta">Destinatari</p>
            <p className="text-display text-2xl tabular-nums">{state.segmentPreview?.finalRecipients ?? "—"}</p>
          </div>

          <div className="riquadro comodo space-y-2">
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
            {testError && <p className="text-xs text-destructive-soft">{testError}</p>}
            {testSuccess && <p className="text-xs text-sage-strong">Email di test inviata.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
