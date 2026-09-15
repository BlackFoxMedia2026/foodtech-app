"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";
import { jobLabel } from "@/lib/job-labels";
import { RigaImpostazione, RigaLibera } from "@/components/settings/righe-impostazioni";

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

  return (
    <>
      <RigaImpostazione
        nome="Stato della coda"
        descrizione={
          tranquillo
            ? "Nessun lavoro in attesa: messaggi e campagne sono stati consegnati tutti."
            : "I lavori in attesa partono da soli entro un minuto. Non serve fare niente."
        }
      >
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm tabular-nums">
          <span>
            <span className="text-muted-foreground">In attesa </span>
            {health.inAttesa}
          </span>
          <span>
            <span className="text-muted-foreground">In corso </span>
            {health.inCorso}
          </span>
          <span className={health.nonRiusciti > 0 ? "text-destructive-soft" : undefined}>
            <span className="text-muted-foreground">Non riusciti </span>
            {health.nonRiusciti}
          </span>
        </span>
      </RigaImpostazione>

      {/* Un invio fallito non sta dietro un'intestazione da aprire: è la cosa
          che si scopre tardi, e con la pagina che scorre sta in chiaro con il
          motivo accanto. */}
      {health.ultimiErrori.map((job) => (
        <RigaImpostazione
          key={job.id}
          nome={jobLabel(job.kind)}
          descrizione={
            /* Il motivo arriva dal fornitore, quindi spesso è in inglese: la
               cornice italiana almeno dice che cos'è quella riga. */
            `Motivo: ${job.lastError ?? "non registrato"} · ${job.attempts} ${
              job.attempts === 1 ? "tentativo" : "tentativi"
            }`
          }
        >
          <Button
            variant="outline"
            size="sm"
            disabled={inCorso === job.id}
            onClick={() => riprova(job.id)}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {inCorso === job.id ? "Un istante…" : "Riprova"}
          </Button>
        </RigaImpostazione>
      ))}

      {errore && (
        <RigaLibera>
          <p className="text-sm text-destructive-soft">{errore}</p>
        </RigaLibera>
      )}
    </>
  );
}
