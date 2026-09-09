"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Blocco, BloccoNota } from "@/components/ui/blocco";
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
  premioPunti,
  premioCosa,
  canManage,
}: {
  puntiPerEuro: number | null;
  valorePuntoCents: number | null;
  premioPunti: number | null;
  premioCosa: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [punti, setPunti] = useState(puntiPerEuro != null ? String(puntiPerEuro) : "");
  const [valore, setValore] = useState(valorePuntoCents != null ? String(valorePuntoCents / 100) : "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);
  const [premio, setPremio] = useState(premioPunti != null ? String(premioPunti) : "");
  const [cosa, setCosa] = useState(premioCosa ?? "");

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
        premioPunti: premio.trim() ? Number(premio) : null,
        premioCosa: cosa.trim() || null,
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

  /*
    Da chiuso si legge la decisione, non i due campi che la compongono: quanto
    restituisci. È il numero su cui un ristoratore giudica la raccolta, e
    finora per vederlo bisognava aprire il blocco e leggere la frase in fondo.
  */
  const riepilogo = attiva ? `restituisci il ${percentuale}%` : "spenta";

  return (
    <Blocco titolo="Raccolta punti" valore={riepilogo}>
      <BloccoNota>
        I punti si accumulano sui conti chiusi al tavolo e si usano come sconto sul conto successivo.
      </BloccoNota>
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
            <p className="t-nota">In euro, quando il cliente lo spende.</p>
          </div>
        </div>

        {attiva ? (
          <p className="riquadro bg-current/5 p-3 text-sm">
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
          <p className="flex items-start gap-2 t-nota">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Senza entrambi i numeri la raccolta punti resta spenta, e nessun cliente accumula niente. Sono due
            decisioni tue: quanto premi la fedeltà e quanto ti costa.
          </p>
        )}

        {/* Il traguardo. Uno sconto lineare è troppo piccolo per essere
            notato: «ti mancano 40 punti alla cena omaggio» è la frase che
            riporta le persone. Il premio lo decide il locale — non sappiamo
            cosa può permettersi di regalare. */}
        {attiva && (
          <div className="riquadro p-3">
            <p className="text-sm font-medium">Un traguardo, se vuoi</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Facoltativo. Senza, i punti restano solo uno sconto.
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[8rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="l-premio">Punti</Label>
                <Input
                  id="l-premio"
                  inputMode="numeric"
                  value={premio}
                  onChange={(e) => setPremio(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="Es. 200"
                  disabled={!canManage}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-cosa">Cosa si vince</Label>
                <Input
                  id="l-cosa"
                  value={cosa}
                  onChange={(e) => setCosa(e.target.value)}
                  placeholder="Es. una bottiglia della casa"
                  disabled={!canManage}
                />
              </div>
            </div>
            {premio.trim() && cosa.trim() && valoreCents > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Ci si arriva spendendo circa{" "}
                <strong className="tabular-nums">
                  {Math.round(Number(premio) / (puntiNum || 1))} €
                </strong>
                , e il premio ti costa quello che vale «{cosa.trim()}».
              </p>
            )}
          </div>
        )}

        {canManage && (
          <Button type="submit" variant="accent" disabled={salvando}>
            {salvando ? "Salvo…" : attiva ? "Salva" : "Salva e spegni la raccolta"}
          </Button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {salvato && !error && <p className="text-sm text-sage-strong">Salvato.</p>}
      </form>
    </Blocco>
  );
}
