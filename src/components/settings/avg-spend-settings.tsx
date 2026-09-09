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
 * Lo scontrino medio per persona, dichiarato da chi lo conosce.
 *
 * Si chiama «scontrino medio» e non «spesa media per coperto» perché è il modo
 * in cui la chiamano i ristoratori: la parola giusta è quella che fa trovare
 * la cosa a chi la cerca.
 *
 * Un ristoratore sa quanto spende in media un cliente al suo tavolo. Il
 * software no — non finché non ci sono ordini o incassi collegati. Chiederla è
 * più onesto che dedurla da un campo che nessuno aggiorna, che è quello che
 * accadeva prima: la Panoramica mostrava «Incassi stimati» calcolati su valori
 * messi dal seed.
 */
export function AvgSpendSettings({
  initialCents,
  canManage,
}: {
  initialCents: number | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [valore, setValore] = useState(initialCents != null ? String(initialCents / 100) : "");
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvato, setSalvato] = useState(false);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    setSalvato(false);

    const numero = valore.trim() === "" ? null : Number(valore.replace(",", "."));
    const res = await fetch("/api/venue/avg-spend", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avgSpend: numero }),
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
    Il valore si legge da chiuso, e lo dice lo stato locale invece dei dati del
    server: appena salvato il riepilogo è già quello nuovo, senza aspettare il
    giro di `router.refresh()`.
  */
  const numero = Number(valore.replace(",", "."));
  const riepilogo =
    valore.trim() !== "" && Number.isFinite(numero) ? `${numero} € a persona` : "non impostato";

  return (
    <Blocco titolo="Scontrino medio per persona" valore={riepilogo}>
      <BloccoNota>
        Serve per stimare gli incassi in Panoramica e il valore di un cliente nella sua scheda.
      </BloccoNota>
      <form onSubmit={salva} method="post" className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="avg-spend">Euro a persona</Label>
            <Input
              id="avg-spend"
              inputMode="decimal"
              value={valore}
              onChange={(e) => setValore(e.target.value)}
              placeholder="Es. 55"
              disabled={!canManage}
              className="w-32"
            />
          </div>
          {canManage && (
            <Button type="submit" variant="accent" disabled={salvando}>
              {salvando ? "Salvo…" : "Salva"}
            </Button>
          )}
        </div>

        <p className="flex items-start gap-2 t-nota">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Lasciandolo vuoto, Tavolo non mostra nessuna stima invece di mostrarne una inventata.
          Quando saranno collegati ordini o incassi, il dato reale prenderà il posto della stima.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {salvato && !error && <p className="text-sm text-sage-strong">Salvato.</p>}
      </form>
    </Blocco>
  );
}
