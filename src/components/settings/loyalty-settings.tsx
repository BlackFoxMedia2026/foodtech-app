"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";

/**
 * Le due regole della raccolta punti.
 *
 * Sono due numeri e nessuna terminologia: quanti punti dà un euro, e quanto
 * vale un punto quando si spende. Sotto c'è la frase che conta davvero — «un
 * conto da 60 € dà 60 punti, che valgono 3,00 €» — perché nessun ristoratore
 * ragiona in punti: ragiona in quanto gli costa.
 *
 * La percentuale accanto è la stessa cosa detta come la dice un commercialista,
 * ed è il numero su cui si decide se la raccolta ha senso.
 *
 * Le due regole valgono solo insieme. Metterne una sola vorrebbe dire far
 * accumulare punti che non si possono spendere, oppure lasciare a noi la
 * decisione su quanto vale un punto — che è denaro del locale, e non una cosa
 * che un software può decidere per conto suo.
 */
export function LoyaltySettings({
  puntiPerEuro,
  valorePuntoCents,
  canManage,
}: {
  puntiPerEuro: number | null;
  valorePuntoCents: number | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [punti, setPunti] = useState(puntiPerEuro != null ? String(puntiPerEuro) : "");
  const [valore, setValore] = useState(valorePuntoCents != null ? String(valorePuntoCents / 100) : "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  const puntiNum = Number(punti.replace(",", ".")) || 0;
  const valoreCents = Math.round((Number(valore.replace(",", ".")) || 0) * 100);
  const attiva = puntiNum > 0 && valoreCents > 0;

  // L'esempio è su 60 €: una cena per due, la cifra che un ristoratore
  // riconosce senza doverla convertire.
  const esempioPunti = puntiNum * 60;
  const esempioCents = esempioPunti * valoreCents;
  // Per ogni euro (100 centesimi) il cliente riceve `puntiNum` punti da
  // `valoreCents` l'uno: quei centesimi su cento **sono** la percentuale.
  // Dividere ancora per cento dava «restituisci lo 0,05%» dove il numero vero
  // era il 5%: due ordini di grandezza di differenza su una decisione di
  // prezzo.
  const percentuale = attiva ? puntiNum * valoreCents : 0;

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    setSalvato(false);

    const res = await fetch("/api/venue/loyalty", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        puntiPerEuro: puntiNum > 0 ? Math.round(puntiNum) : null,
        valorePuntoCents: valoreCents > 0 ? valoreCents : null,
      }),
    });
    setSalvando(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare. Riprova."));
      return;
    }
    setSalvato(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raccolta punti</CardTitle>
        <CardDescription>
          I punti si accumulano sui conti chiusi al tavolo e si usano come sconto sul conto successivo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={salva} method="post" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="l-punti">Punti per ogni euro speso</Label>
              <Input
                id="l-punti"
                inputMode="numeric"
                value={punti}
                onChange={(e) => setPunti(e.target.value)}
                placeholder="Es. 1"
                disabled={!canManage}
                className="w-28"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="l-valore">Quanto vale un punto</Label>
              <Input
                id="l-valore"
                inputMode="decimal"
                value={valore}
                onChange={(e) => setValore(e.target.value)}
                placeholder="Es. 0,05"
                disabled={!canManage}
                className="w-28"
              />
              <p className="text-xs text-tertiary-foreground">In euro, quando il cliente lo spende.</p>
            </div>
          </div>

          {attiva ? (
            <p className="rounded-md border border-border bg-current/5 p-3 text-sm">
              Un conto da 60 € dà{" "}
              <strong className="tabular-nums">
                {esempioPunti} {esempioPunti === 1 ? "punto" : "punti"}
              </strong>
              , che valgono{" "}
              <strong className="tabular-nums">
                {(esempioCents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
              </strong>{" "}
              sulla prossima cena. In pratica stai restituendo il{" "}
              <strong className="tabular-nums">
                {percentuale.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%
              </strong>{" "}
              di quello che incassi.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-xs text-tertiary-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Senza entrambi i numeri la raccolta punti resta spenta, e nessun cliente accumula niente. Sono due
              decisioni tue: quanto premi la fedeltà e quanto ti costa.
            </p>
          )}

          {canManage && (
            <Button type="submit" variant="accent" disabled={salvando}>
              {salvando ? "Salvo…" : attiva ? "Salva" : "Salva e spegni la raccolta"}
            </Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {salvato && !error && <p className="text-sm text-sage">Salvato.</p>}
        </form>
      </CardContent>
    </Card>
  );
}
