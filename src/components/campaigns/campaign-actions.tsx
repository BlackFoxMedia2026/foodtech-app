"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";

/**
 * Invia o programma.
 *
 * Non c'è nessuna finestra di sistema a chiedere «sei sicuro?»: la conferma
 * sta nel pulsante, che dice a quante persone si sta scrivendo. Un invio a
 * clienti veri non si annulla, quindi il numero va letto **prima** di
 * premere, non dentro un avviso che si chiude d'istinto.
 *
 * Il pulsante non aspetta la fine dell'invio: l'invio è un lavoro in coda, e
 * la pagina passa a mostrarne l'avanzamento.
 */
export function CampaignActions({ campaignId, recipients }: { campaignId: string; recipients: number }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");
  const [confermaInvio, setConfermaInvio] = useState(false);

  async function chiama(url: string, body?: unknown) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(url, {
      method: "POST",
      ...(body !== undefined && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    setSubmitting(false);
    setConfermaInvio(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad avviare l'invio."));
      return;
    }
    router.refresh();
  }

  const destinatari = `${recipients} ${recipients === 1 ? "cliente" : "clienti"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {confermaInvio ? (
          <>
            <Button
              variant="accent"
              disabled={submitting || recipients === 0}
              onClick={() => chiama(`/api/campaigns/${campaignId}/send`)}
            >
              Confermo: scrivi a {destinatari}
            </Button>
            <Button variant="ghost" disabled={submitting} onClick={() => setConfermaInvio(false)}>
              Annulla
            </Button>
          </>
        ) : (
          <Button variant="accent" disabled={submitting || recipients === 0} onClick={() => setConfermaInvio(true)}>
            Invia ora a {destinatari}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="datetime-local"
          aria-label="Data e ora dell'invio programmato"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="w-56"
        />
        <Button
          variant="outline"
          disabled={submitting || !scheduledAt || recipients === 0}
          onClick={() => chiama(`/api/campaigns/${campaignId}/schedule`, { at: new Date(scheduledAt).toISOString() })}
        >
          Programma
        </Button>
      </div>

      {recipients === 0 && (
        <p className="text-sm text-muted-foreground">
          Con questi criteri non c&apos;è nessun cliente con email e consenso: cambia il segmento prima di inviare.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
