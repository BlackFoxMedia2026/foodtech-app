"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";

/**
 * Quando si può prenotare dal sito.
 *
 * Due limiti, e nessuno dei due è obbligatorio: un locale che non dichiara
 * niente continua ad accettare prenotazioni per qualunque giorno e fino
 * all'ultimo minuto, che è il comportamento di sempre.
 *
 * La frase sotto i campi è la parte importante: dice **cosa vedrà il cliente**,
 * non cosa abbiamo salvato. E ricorda l'unica cosa che rende accettabile un
 * limite: al telefono il locale accetta quello che vuole.
 */

const PREAVVISI = [
  { valore: "0", etichetta: "Fino all'ultimo minuto" },
  { valore: "30", etichetta: "Mezz'ora prima" },
  { valore: "60", etichetta: "Un'ora prima" },
  { valore: "120", etichetta: "Due ore prima" },
  { valore: "240", etichetta: "Quattro ore prima" },
  { valore: "1440", etichetta: "Il giorno prima" },
] as const;

export function BookingWindowSettings({
  windowDays,
  cutoffMin,
  canManage,
}: {
  windowDays: number | null;
  cutoffMin: number | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [giorni, setGiorni] = useState(windowDays != null ? String(windowDays) : "");
  const [preavviso, setPreavviso] = useState(String(cutoffMin ?? 0));
  const [salvando, setSalvando] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const giorniNum = giorni.trim() === "" ? null : Number(giorni);
  const preavvisoNum = Number(preavviso);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    setSalvato(false);
    const res = await fetch("/api/venue/booking-window", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ windowDays: giorniNum, cutoffMin: preavvisoNum }),
    });
    setSalvando(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare. Riprova."));
      return;
    }
    setSalvato(true);
    router.refresh();
  }

  const quando = PREAVVISI.find((p) => p.valore === preavviso)?.etichetta ?? "Fino all'ultimo minuto";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-accent" aria-hidden="true" /> Quando si prenota dal sito
        </CardTitle>
        <CardDescription>
          Vale solo per il widget e per il link pubblico. Al telefono e in sala continui ad accettare quello
          che vuoi, fino all&apos;ultimo minuto.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={salva} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fin-giorni">Con quanto anticipo al massimo</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fin-giorni"
                  inputMode="numeric"
                  value={giorni}
                  disabled={!canManage}
                  onChange={(e) => {
                    setGiorni(e.target.value.replace(/[^0-9]/g, ""));
                    setSalvato(false);
                  }}
                  placeholder="nessun limite"
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">giorni</span>
              </div>
              <p className="text-xs text-tertiary-foreground">
                Vuoto vuol dire nessun limite. Chi lo mette di solito sceglie 60 o 90: oltre, i piani cambiano
                e le disdette aumentano.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fin-preavviso">Si chiude</Label>
              <Select
                value={preavviso}
                onValueChange={(v) => {
                  setPreavviso(v);
                  setSalvato(false);
                }}
                disabled={!canManage}
              >
                <SelectTrigger id="fin-preavviso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PREAVVISI.map((p) => (
                    <SelectItem key={p.valore} value={p.valore}>
                      {p.etichetta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-tertiary-foreground">
                Il tempo che serve alla cucina per contare i coperti. Chi arriva dopo legge che può chiamare.
              </p>
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              Dal sito si prenota{" "}
              {giorniNum == null
                ? "per qualunque giorno"
                : giorniNum === 1
                  ? "solo per domani"
                  : `fino a ${giorniNum} giorni prima`}
              ,{" "}
              {preavvisoNum === 0
                ? "e resta aperto fino all'ultimo minuto"
                : `e si chiude ${quando.toLowerCase()}`}
              . Fuori da questa finestra il cliente legge che può chiamare, non che è tutto pieno.
            </span>
          </p>

          {canManage && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="accent" size="sm" disabled={salvando}>
                {salvando ? "Salvo…" : "Salva"}
              </Button>
              {salvato && <span className="text-sm text-sage">Salvato.</span>}
              {error && <span className="text-sm text-destructive">{error}</span>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
