"use client";

import { useEffect, useState } from "react";
import { Gift, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import type { SaldoFedelta } from "@/server/loyalty";
import type { OrderView } from "@/server/orders";

/**
 * Gift card e punti, dentro il conto.
 *
 * Sono due gesti diversi e stanno in due riquadri diversi, perché rispondono a
 * due domande diverse: «ho un pezzo di carta con un codice» e «io sono un
 * cliente affezionato». Metterli in un unico campo «codice o punti»
 * risparmierebbe un pulsante e costerebbe un secondo di esitazione a ogni
 * tavolo.
 *
 * Il valore preimpostato è sempre **quello che serve per chiudere il conto**,
 * non il massimo disponibile: una gift card da 100 € su un conto da 38 € deve
 * proporre 38, perché il resto è del cliente e va lasciato sulla carta. Lo
 * stesso per i punti.
 */
export function BillPayments({
  conto,
  currency,
  onChanged,
}: {
  conto: OrderView;
  currency: string;
  onChanged: (aggiornato: OrderView) => void;
}) {
  const euro = (c: number) => formatCurrency(c, currency);
  const [apri, setApri] = useState<"gift" | "punti" | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={apri === "gift" ? "accent" : "outline"}
          size="sm"
          onClick={() => setApri(apri === "gift" ? null : "gift")}
        >
          <Gift className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Gift card
        </Button>
        {conto.guestId && (
          <Button
            type="button"
            variant={apri === "punti" ? "accent" : "outline"}
            size="sm"
            onClick={() => setApri(apri === "punti" ? null : "punti")}
          >
            <Sparkles className="mr-2 h-3.5 w-3.5" aria-hidden="true" /> Punti
          </Button>
        )}
      </div>

      {apri === "gift" && (
        <PannelloGiftCard
          conto={conto}
          euro={euro}
          onFatto={onChanged}
          onChiudi={() => setApri(null)}
        />
      )}
      {apri === "punti" && conto.guestId && (
        <PannelloPunti
          conto={conto}
          guestId={conto.guestId}
          euro={euro}
          onFatto={onChanged}
          onChiudi={() => setApri(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type Trovata = {
  code: string;
  residuoCents: number;
  initialCents: number;
  stato: string;
  motivo: string | null;
};

function PannelloGiftCard({
  conto,
  euro,
  onFatto,
  onChiudi,
}: {
  conto: OrderView;
  euro: (c: number) => string;
  onFatto: (o: OrderView) => void;
  onChiudi: () => void;
}) {
  const [code, setCode] = useState("");
  const [trovata, setTrovata] = useState<Trovata | null>(null);
  const [importo, setImporto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerca() {
    setInCorso(true);
    setError(null);
    setTrovata(null);
    const res = await fetch(`/api/gift-cards/lookup?code=${encodeURIComponent(code.trim())}`);
    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a leggere la gift card."));
      return;
    }
    const card: Trovata = await res.json();
    setTrovata(card);
    if (card.stato === "usabile") {
      // Si propone quello che serve per chiudere il conto, non tutto il
      // residuo: il resto è del cliente.
      const daScalare = Math.min(card.residuoCents, conto.pagamenti.daIncassareCents);
      setImporto((daScalare / 100).toFixed(2).replace(".", ","));
    }
  }

  async function scala() {
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/gift-cards/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: trovata!.code,
        amountCents: Math.round(Number(importo.replace(",", ".")) * 100),
        orderId: conto.id,
        bookingId: conto.bookingId,
      }),
    });
    if (!res.ok) {
      setInCorso(false);
      setError(await readApiError(res, "Non siamo riusciti a scalare la gift card."));
      return;
    }
    // Il conto si rilegge dal server: il totale da incassare lo decide lui.
    const aggiornato = await fetch(`/api/orders/${conto.id}`);
    setInCorso(false);
    if (aggiornato.ok) onFatto(await aggiornato.json());
    onChiudi();
  }

  return (
    <div className="space-y-2 riquadro p-3">
      <div className="space-y-1.5">
        <Label htmlFor="gc-code">Codice della gift card</Label>
        <div className="flex gap-2">
          <Input
            id="gc-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="REGALO-…"
            autoComplete="off"
            className="font-mono"
          />
          <Button type="button" variant="outline" onClick={cerca} disabled={inCorso || !code.trim()}>
            Cerca
          </Button>
        </div>
      </div>

      {trovata && trovata.stato !== "usabile" && (
        <p className="text-sm text-destructive">{trovata.motivo}</p>
      )}

      {trovata && trovata.stato === "usabile" && (
        <>
          <p className="text-sm">
            Su questa carta ci sono <strong className="tabular-nums">{euro(trovata.residuoCents)}</strong>
            {trovata.residuoCents < trovata.initialCents ? ` di ${euro(trovata.initialCents)}` : ""}.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="gc-importo">Quanto scalare</Label>
              <Input
                id="gc-importo"
                inputMode="decimal"
                value={importo}
                onChange={(e) => setImporto(e.target.value)}
                className="w-28"
              />
            </div>
            <Button type="button" variant="accent" onClick={scala} disabled={inCorso || !importo.trim()}>
              {inCorso ? "Un istante…" : "Scala dal conto"}
            </Button>
          </div>
          {trovata.residuoCents > conto.pagamenti.daIncassareCents && (
            <p className="text-xs text-tertiary-foreground">
              Scalando {euro(conto.pagamenti.daIncassareCents)} restano{" "}
              {euro(trovata.residuoCents - conto.pagamenti.daIncassareCents)} sulla carta, per un&apos;altra volta.
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PannelloPunti({
  conto,
  guestId,
  euro,
  onFatto,
  onChiudi,
}: {
  conto: OrderView;
  guestId: string;
  euro: (c: number) => string;
  onFatto: (o: OrderView) => void;
  onChiudi: () => void;
}) {
  const [saldo, setSaldo] = useState<SaldoFedelta | null>(null);
  const [punti, setPunti] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const res = await fetch(`/api/loyalty/balance?guestId=${encodeURIComponent(guestId)}`);
      if (annullato) return;
      if (!res.ok) {
        setError(await readApiError(res, "Non siamo riusciti a leggere i punti."));
        return;
      }
      const s: SaldoFedelta = await res.json();
      setSaldo(s);
      if (s.attiva && s.regole && s.punti > 0) {
        // Quanti punti servono per chiudere il conto, senza sforare il saldo:
        // arrotondati per difetto, perché non si può scontare più del conto.
        const serve = Math.floor(conto.pagamenti.daIncassareCents / s.regole.valorePuntoCents);
        setPunti(String(Math.max(0, Math.min(s.punti, serve))));
      }
    })();
    return () => {
      annullato = true;
    };
  }, [guestId, conto.pagamenti.daIncassareCents]);

  const puntiNum = Number(punti) || 0;
  const valoreCents = saldo?.regole ? puntiNum * saldo.regole.valorePuntoCents : 0;

  async function usa() {
    setInCorso(true);
    setError(null);
    const res = await fetch("/api/loyalty/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ guestId, punti: puntiNum, orderId: conto.id, bookingId: conto.bookingId }),
    });
    if (!res.ok) {
      setInCorso(false);
      setError(await readApiError(res, "Non siamo riusciti a usare i punti."));
      return;
    }
    const aggiornato = await fetch(`/api/orders/${conto.id}`);
    setInCorso(false);
    if (aggiornato.ok) onFatto(await aggiornato.json());
    onChiudi();
  }

  if (error && !saldo) return <p className="riquadro p-3 text-sm text-destructive">{error}</p>;
  if (!saldo) return <p className="riquadro p-3 text-sm text-muted-foreground">Leggo i punti…</p>;

  if (!saldo.attiva) {
    return (
      <p className="riquadro p-3 text-sm text-muted-foreground">
        La raccolta punti è spenta. Si accende dalle Impostazioni, dicendo quanti punti dà un euro e quanto vale un
        punto.
      </p>
    );
  }

  if (saldo.punti <= 0) {
    return (
      <p className="riquadro p-3 text-sm text-muted-foreground">
        Questo cliente non ha ancora punti. Ne accumula chiudendo questo conto.
      </p>
    );
  }

  return (
    <div className="space-y-2 riquadro p-3">
      <p className="text-sm">
        Ha <strong className="tabular-nums">{saldo.punti} punti</strong>, che valgono{" "}
        <strong className="tabular-nums">{euro(saldo.valoreCents ?? 0)}</strong>.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="pt-punti">Quanti usarne</Label>
          <Input
            id="pt-punti"
            inputMode="numeric"
            value={punti}
            onChange={(e) => setPunti(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-24"
          />
        </div>
        <Button
          type="button"
          variant="accent"
          onClick={usa}
          disabled={inCorso || puntiNum <= 0 || puntiNum > saldo.punti}
        >
          {inCorso ? "Un istante…" : `Sconta ${euro(valoreCents)}`}
        </Button>
      </div>
      {puntiNum > saldo.punti && (
        <p className="text-xs text-destructive">Ha solo {saldo.punti} punti.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
