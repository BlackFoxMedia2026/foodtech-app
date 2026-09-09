"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { jobLabel } from "@/lib/job-labels";

export type QueueHealth = {
  inAttesa: number;
  inCorso: number;
  nonRiusciti: number;
  ultimiErrori: {
    id: string;
    kind: string;
    lastError: string | null;
    finishedAt: Date | null;
    attempts: number;
  }[];
};

/**
 * Lo stato della coda, in chiaro.
 *
 * Serve a rispondere a una domanda che prima non aveva risposta: «perché
 * quell'ospite non ha ricevuto il promemoria?». Un lavoro che non è riuscito
 * resta qui, con il motivo scritto e un pulsante per riprovare — invece di
 * essere un silenzio da interpretare.
 */
export function QueuePanel({ health }: { health: QueueHealth }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  async function riprova(id: string) {
    setInCorso(id);
    setErrore(null);
    const res = await fetch(`/api/jobs/${id}/retry`, { method: "POST" });
    setInCorso(null);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti a rimettere in coda il lavoro."));
      return;
    }
    router.refresh();
  }

  const tranquillo = health.inAttesa === 0 && health.inCorso === 0 && health.nonRiusciti === 0;

  if (tranquillo) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun lavoro in attesa: messaggi e campagne sono stati consegnati tutti.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">In attesa:</span> {health.inAttesa}
        </span>
        <span>
          <span className="text-muted-foreground">In corso:</span> {health.inCorso}
        </span>
        <span className={health.nonRiusciti > 0 ? "text-destructive-soft" : undefined}>
          <span className="text-muted-foreground">Non riusciti:</span> {health.nonRiusciti}
        </span>
      </div>

      {health.ultimiErrori.length > 0 && (
        <ul className="divide-y divide-border riquadro">
          {health.ultimiErrori.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{jobLabel(job.kind)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {/* Il motivo arriva dal fornitore, quindi spesso è in inglese:
                      la cornice italiana almeno dice che cos'è quella riga. */}
                  Motivo: {job.lastError ?? "non registrato"} · {job.attempts}{" "}
                  {job.attempts === 1 ? "tentativo" : "tentativi"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={inCorso === job.id}
                onClick={() => riprova(job.id)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {inCorso === job.id ? "Un istante…" : "Riprova"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {health.nonRiusciti === 0 && (
        <p className="text-xs text-muted-foreground">
          I lavori in attesa partono da soli entro un minuto. Non serve fare niente.
        </p>
      )}
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
