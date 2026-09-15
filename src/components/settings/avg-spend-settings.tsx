"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import {
  EsitoSalvataggio,
  GruppoImpostazioni,
  RigaImpostazione,
} from "@/components/settings/righe-impostazioni";

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

  return (
    <GruppoImpostazioni
      titolo="Valore di un cliente"
      descrizione="Quanto lascia in media una persona a tavola. Serve a stimare gli incassi in Panoramica e il valore di un cliente nella sua scheda."
    >
      <form onSubmit={salva} method="post">
        <RigaImpostazione
          nome="Scontrino medio per persona"
          htmlFor="avg-spend"
          descrizione="Lasciandolo vuoto, Tavolo non mostra nessuna stima invece di mostrarne una inventata. Quando saranno collegati ordini o incassi, il dato reale prenderà il posto della stima."
        >
          <div className="flex items-center gap-2">
            <Input
              id="avg-spend"
              inputMode="decimal"
              value={valore}
              onChange={(e) => {
                setValore(e.target.value);
                setSalvato(false);
              }}
              placeholder="Es. 55"
              disabled={!canManage}
              className="w-24 text-right"
            />
            <span className="text-sm text-muted-foreground">€</span>
          </div>
          {canManage && (
            <Button type="submit" variant="outline" size="sm" disabled={salvando}>
              {salvando ? "Salvo…" : "Salva"}
            </Button>
          )}
          <EsitoSalvataggio salvato={salvato} errore={error} />
        </RigaImpostazione>
      </form>
    </GruppoImpostazioni>
  );
}
