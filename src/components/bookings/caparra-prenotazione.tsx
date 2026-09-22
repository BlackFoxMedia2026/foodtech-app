"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeEuro, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { readApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";

/**
 * La caparra di questa prenotazione: chiederla, e restituirla.
 *
 * ## Perché un link e non un addebito
 *
 * Perché la carta non ce l'abbiamo: chi prenota al telefono non detta il numero
 * a una voce. Il link si copia e si manda — per SMS, per WhatsApp, o si legge
 * al telefono — e il cliente paga sulla pagina di chi incassa.
 *
 * ## Perché lo stato è scritto a parole
 *
 * Perché «chiesta» e «pagata» cambiano cosa fa la sala: una prenotazione con
 * la caparra chiesta e non pagata è un tavolo tenuto con il denaro che non è
 * arrivato, e chi guarda l'agenda deve saperlo **senza** aprire Stripe.
 */

type Stato = "NONE" | "REQUESTED" | "HELD" | "CAPTURED" | "REFUNDED" | "FAILED";

const ETICHETTE: Record<Stato, { testo: string; tono: "neutral" | "warning" | "success" | "info" }> = {
  NONE: { testo: "nessuna caparra", tono: "neutral" },
  REQUESTED: { testo: "chiesta, non pagata", tono: "warning" },
  HELD: { testo: "trattenuta", tono: "info" },
  CAPTURED: { testo: "pagata", tono: "success" },
  REFUNDED: { testo: "restituita", tono: "neutral" },
  FAILED: { testo: "non riuscita", tono: "warning" },
};

export function CaparraPrenotazione({
  bookingId,
  stato,
  importoCents,
  valuta,
  prevista,
  puoChiedere,
  puoRimborsare,
}: {
  bookingId: string;
  stato: Stato;
  importoCents: number;
  valuta: string;
  /** Quanto chiederebbe la regola del locale, se la chiede. */
  prevista: number | null;
  puoChiedere: boolean;
  puoRimborsare: boolean;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [mandato, setMandato] = useState<string | null>(null);

  async function manda(azione: "chiedi" | "rimborsa") {
    setInCorso(true);
    setErrore(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/caparra`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ azione }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non ci siamo riusciti."));
      if (azione === "chiedi") {
        const dati = (await res.json()) as { url: string; mandato: string | null };
        setLink(dati.url);
        setMandato(dati.mandato);
      }
      router.refresh();
    } catch (err: unknown) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(false);
    }
  }

  const etichetta = ETICHETTE[stato];

  return (
    <div className="riquadro space-y-2 border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BadgeEuro className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Caparra</span>
          <Badge tone={etichetta.tono}>{etichetta.testo}</Badge>
          {importoCents > 0 && (
            <span className="text-sm text-muted-foreground">
              {formatCurrency(importoCents, valuta)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {puoChiedere && stato !== "CAPTURED" && prevista !== null && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={inCorso}
              onClick={() => void manda("chiedi")}
              className="tocco-comodo"
            >
              {stato === "REQUESTED" ? "Rifai il link" : "Chiedi la caparra"}
            </Button>
          )}
          {puoRimborsare && stato === "CAPTURED" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={inCorso}
              onClick={() => void manda("rimborsa")}
              className="tocco-comodo"
            >
              <RotateCcw className="h-4 w-4" /> Restituisci
            </Button>
          )}
        </div>
      </div>

      {/* Quanto chiederebbe la regola: si dice **prima** di premere, o il
          pulsante è una scommessa su una cifra che nessuno ha visto. */}
      {stato === "NONE" && prevista !== null && (
        <p className="text-xs text-muted-foreground">
          La regola del locale chiede {formatCurrency(prevista, valuta)} per questa prenotazione.
        </p>
      )}
      {stato === "NONE" && prevista === null && (
        <p className="text-xs text-muted-foreground">
          Per questa prenotazione la regola del locale non prevede una caparra.
        </p>
      )}

      {link && (
        <div className="space-y-1">
          {/* «Mandato» e «da mandare» sono due cose che la sala fa in modo
              diverso: dire la prima quando vale la seconda lascia un cliente
              ad aspettare un messaggio che nessuno ha spedito. */}
          <p className="text-xs text-muted-foreground">
            {mandato
              ? `Mandato al cliente via ${mandato}. Il link resta valido finché non paga: se lo riapre, non paga due volte.`
              : "Il link da mandare al cliente: copialo e mandaglielo. Resta valido finché non paga."}
          </p>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-xs">{link}</p>
            <CopyButton value={link} size="sm" variant="outline" />
          </div>
        </div>
      )}

      {errore && <p className="text-sm text-destructive">{errore}</p>}
    </div>
  );
}
