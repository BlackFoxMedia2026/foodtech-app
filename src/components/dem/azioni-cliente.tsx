"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-client";

/**
 * Fermare o riattivare gli invii di un cliente.
 *
 * Sospendere non cancella niente — campagne, contatti, modelli e statistiche
 * restano dove sono — e questo va detto sul pulsante, non in una nota a piè di
 * pagina: chi lo preme sta decidendo per un ristorante che non è il suo.
 */
export function AzioniCliente({ venueId, sospeso }: { venueId: string; sospeso: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function cambia(azione: "sospendi" | "riattiva") {
    setBusy(true);
    setErrore(null);
    const res = await fetch(`/api/admin/dem/${venueId}/invii`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione }),
    });
    setBusy(false);
    if (!res.ok) {
      setErrore(await readApiError(res, "Operazione non riuscita."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button
        variant={sospeso ? "accent" : "outline"}
        size="sm"
        disabled={busy}
        onClick={() => cambia(sospeso ? "riattiva" : "sospendi")}
      >
        {sospeso ? "Riattiva invii" : "Sospendi invii"}
      </Button>
      {errore && <p className="text-xs text-destructive-soft">{errore}</p>}
    </div>
  );
}
