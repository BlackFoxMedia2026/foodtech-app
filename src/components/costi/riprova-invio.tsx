"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Riprova l'accodamento di una campagna bloccata.
 *
 * Esiste come pulsante separato e **non** come conseguenza automatica
 * dell'override, ed è una scelta: autorizzare un superamento e far partire una
 * campagna sono due decisioni diverse. Chi alza il tetto potrebbe volerlo fare
 * per un'altra campagna, o volerne parlare prima con il cliente; far partire
 * ottantamila email come effetto collaterale di un clic su «Autorizza» è
 * esattamente il tipo di sorpresa che questo pannello serve a evitare.
 *
 * Usa la rotta d'invio che esiste già: il freno viene rivalutato da capo, con
 * i numeri di adesso. Se il tetto nuovo non basta, la campagna si blocca di
 * nuovo e il riquadro si riscrive con i numeri aggiornati.
 */
export function RiprovaInvio({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function riprova() {
    setInCorso(true);
    setErrore(null);
    try {
      const risposta = await fetch(`/api/campaigns/${campaignId}/send`, { method: "POST" });
      if (!risposta.ok) {
        const corpo = await risposta.json().catch(() => ({}));
        setErrore(corpo?.message ?? "L'invio è ancora bloccato.");
        router.refresh();
        return;
      }
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" size="sm" onClick={riprova} disabled={inCorso}>
        {inCorso ? "Riprovo…" : "Riprova accodamento"}
      </Button>
      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
