"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";

/**
 * Ferma una campagna prima che parta.
 *
 * La conferma è il secondo clic sullo stesso posto, come per l'invio: una
 * finestra di sistema si chiude d'istinto, un pulsante che cambia parola
 * costringe a leggere cosa si sta per fare. E quello che si sta per fare qui
 * è reversibile solo in parte — la campagna resta, i destinatari preparati no
 * — quindi la frase lo dice.
 */
export function AnnullaCampagna({ campaignId, invii }: { campaignId: string; invii: number }) {
  const router = useRouter();
  const [conferma, setConferma] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function annulla() {
    setBusy(true);
    setErrore(null);
    const res = await fetch(`/api/campaigns/${campaignId}/cancel`, { method: "POST" });
    setBusy(false);
    setConferma(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Non siamo riusciti ad annullare la campagna."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {conferma ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" disabled={busy} onClick={annulla}>
            Confermo: non inviarla
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConferma(false)}>
            Lascia programmata
          </Button>
        </div>
      ) : (
        <Button variant="outline" disabled={busy} onClick={() => setConferma(true)}>
          Annulla invio
        </Button>
      )}
      <p className="t-nota">
        {invii > 0
          ? `Gli ${invii.toLocaleString("it-IT")} invii impegnati tornano disponibili. La campagna resta in elenco.`
          : "La campagna resta in elenco e si può riutilizzare."}
      </p>
      {errore && <p className="text-sm text-destructive-soft">{errore}</p>}
    </div>
  );
}
