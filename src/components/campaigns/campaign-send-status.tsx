"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import type { CampaignSendProgress } from "@/server/campaigns";

/**
 * Che sta succedendo all'invio.
 *
 * Prima il clic su «invia» aspettava la fine di tutto e poi diceva «inviata».
 * Ora l'invio è un lavoro in coda, e questa è la finestra su quel lavoro: i
 * destinatari preparati sono contati davvero, non è una barra che avanza per
 * far compagnia. La pagina si aggiorna da sola ogni cinque secondi finché
 * l'invio è in corso, così non serve ricaricare per sapere com'è finita.
 */
export function CampaignSendStatus({
  campaignId,
  status,
  progress,
}: {
  campaignId: string;
  status: "SENDING" | "FAILED";
  progress: CampaignSendProgress | null;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "SENDING") return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [status, router]);

  async function riprova() {
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/campaigns/${campaignId}/retry`, { method: "POST" });
    setInCorso(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a rimettere in coda l'invio."));
      return;
    }
    router.refresh();
  }

  if (status === "SENDING") {
    const totale = progress?.totale ?? 0;
    const preparati = progress?.preparati ?? 0;
    const quota = totale > 0 ? Math.min(100, Math.round((preparati / totale) * 100)) : 0;

    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
          Invio in corso — {preparati} destinatari preparati su {totale}
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-current/20">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${quota}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Puoi chiudere questa pagina: il lavoro continua da solo e questa schermata si aggiorna da sé.
        </p>
        {progress?.ultimoErrore && (
          <p className="text-xs text-accent">
            Ultimo tentativo non riuscito ({progress.tentativi}): {progress.ultimoErrore}. Ci riproviamo.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <span>
          L&apos;invio non è andato a termine
          {progress?.ultimoErrore ? <>: {progress.ultimoErrore}</> : "."}
        </span>
      </p>
      <Button variant="outline" size="sm" onClick={riprova} disabled={inCorso}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {inCorso ? "Un istante…" : "Riprova l'invio"}
      </Button>
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
