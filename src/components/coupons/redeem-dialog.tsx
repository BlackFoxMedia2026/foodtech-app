"use client";

import { useState } from "react";
import { CheckCircle2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";

type Esito = { redemptionId: string; name: string; descrizione: string; restanti: number | null };

/**
 * Usare un coupon, al tavolo.
 *
 * Un campo, un pulsante, e una risposta in un secondo: vale o non vale, e
 * quanto sconta. Se non vale, il motivo è scritto — «scaduto», «già usato da
 * questo cliente» — perché il cameriere deve poterlo dire al cliente senza
 * chiamare nessuno.
 *
 * Dopo l'uso resta un **annulla** per qualche secondo: lo sbaglio più comune
 * non è la frode, è il tocco di troppo, e un coupon bruciato per errore è una
 * discussione al tavolo.
 */
export function RedeemCouponDialog({
  open,
  onOpenChange,
  bookingId,
  guestId,
  guestName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  guestId: string | null;
  guestName: string;
  onDone: () => void;
}) {
  const [code, setCode] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);

  async function usa() {
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/coupons/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, bookingId, guestId }),
    });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a usare il coupon."));
      return;
    }
    setEsito(await res.json());
    onDone();
  }

  async function annulla() {
    if (!esito) return;
    setInCorso(true);
    setError(null);
    const res = await fetch(`/api/coupons/redemptions/${esito.redemptionId}`, { method: "DELETE" });
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad annullare l'utilizzo."));
      return;
    }
    setEsito(null);
    setCode("");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Coupon di {guestName}</DialogTitle>
          <DialogDescription>
            {guestId
              ? "Scrivi il codice: diciamo subito se vale e quanto sconta."
              : "Questa prenotazione non ha un cliente collegato: i coupon con un limite per persona non si possono usare."}
          </DialogDescription>
        </DialogHeader>

        {esito ? (
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
              <span>
                <strong>{esito.name}</strong> — {esito.descrizione}. Segnato come usato.
                {esito.restanti != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    {esito.restanti === 0
                      ? "Era l'ultimo utilizzo disponibile."
                      : `Ne restano ${esito.restanti}.`}
                  </span>
                )}
              </span>
            </p>
            <Button variant="outline" size="sm" onClick={annulla} disabled={inCorso}>
              {inCorso ? "Un istante…" : "Annulla l'utilizzo"}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="codice-coupon">Codice</Label>
            <Input
              id="codice-coupon"
              value={code}
              autoFocus
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.trim()) void usa();
              }}
              placeholder="Es. BENVENUTO-4F7K"
              className="font-mono tracking-wider"
            />
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            {esito ? "Chiudi" : "Annulla"}
          </Button>
          {!esito && (
            <Button variant="accent" onClick={usa} disabled={inCorso || !code.trim()}>
              <Ticket className="h-4 w-4" aria-hidden="true" />
              {inCorso ? "Controllo…" : "Usa il coupon"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
