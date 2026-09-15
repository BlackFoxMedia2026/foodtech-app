"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readApiError } from "@/lib/api-client";
import {
  EsitoSalvataggio,
  GruppoImpostazioni,
  RigaImpostazione,
  RigaLibera,
} from "@/components/settings/righe-impostazioni";

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
  overbookingPct,
  largePartyFrom,
  canManage,
}: {
  windowDays: number | null;
  cutoffMin: number | null;
  overbookingPct: number | null;
  largePartyFrom: number;
  canManage: boolean;
}) {
  const router = useRouter();
  const [giorni, setGiorni] = useState(windowDays != null ? String(windowDays) : "");
  const [preavviso, setPreavviso] = useState(String(cutoffMin ?? 0));
  const [oltre, setOltre] = useState(overbookingPct != null ? String(overbookingPct) : "");
  const [gruppo, setGruppo] = useState(String(largePartyFrom));
  const [salvando, setSalvando] = useState(false);
  const [salvato, setSalvato] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const giorniNum = giorni.trim() === "" ? null : Number(giorni);
  const preavvisoNum = Number(preavviso);
  const oltreNum = oltre.trim() === "" ? 0 : Number(oltre);
  // Vuoto o assurdo torna al valore attuale: la soglia non ha un «nessun
  // limite» sensato — «da una persona in su parliamone» spegnerebbe il widget
  // senza dirlo.
  const gruppoNum = Number(gruppo) >= 2 ? Number(gruppo) : largePartyFrom;

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setError(null);
    setSalvato(false);
    const res = await fetch("/api/venue/booking-window", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        windowDays: giorniNum,
        cutoffMin: preavvisoNum,
        overbookingPct: oltreNum,
        largePartyFrom: gruppoNum,
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

  const quando = PREAVVISI.find((p) => p.valore === preavviso)?.etichetta ?? "Fino all'ultimo minuto";

  return (
    <form onSubmit={salva}>
      <GruppoImpostazioni
        titolo="Quando si prenota dal sito"
        descrizione="Vale solo per il widget e per il link pubblico. Al telefono e in sala continui ad accettare quello che vuoi, fino all'ultimo minuto."
        azione={
          canManage && (
            <>
              <EsitoSalvataggio salvato={salvato} errore={error} />
              <Button type="submit" variant="accent" size="sm" disabled={salvando}>
                {salvando ? "Salvo…" : "Salva"}
              </Button>
            </>
          )
        }
      >
        <RigaImpostazione
          nome="Con quanto anticipo al massimo"
          htmlFor="fin-giorni"
          descrizione="Vuoto vuol dire nessun limite. Chi lo mette di solito sceglie 60 o 90: oltre, i piani cambiano e le disdette aumentano."
        >
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
            className="w-32 text-right"
          />
          <span className="text-sm text-muted-foreground">giorni</span>
        </RigaImpostazione>

        <RigaImpostazione
          nome="Si chiude"
          htmlFor="fin-preavviso"
          descrizione="Il tempo che serve alla cucina per contare i coperti. Chi arriva dopo legge che può chiamare."
        >
          <Select
            value={preavviso}
            onValueChange={(v) => {
              setPreavviso(v);
              setSalvato(false);
            }}
            disabled={!canManage}
          >
            <SelectTrigger id="fin-preavviso" className="w-full sm:w-56">
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
        </RigaImpostazione>

        <RigaImpostazione
          nome="Quanto puoi accettare oltre la capienza"
          htmlFor="fin-oltre"
          descrizione="Una quota di prenotazioni non si presenta, e tenere i tavoli vuoti per prudenza costa serate. Su un turno da 90 coperti, il 10% vuol dire accettarne 99. Vale per tutti i canali, anche il telefono. In sala gli orari oltre la capienza dichiarata sono segnati con un puntino — accettare non vuol dire non saperlo."
        >
          <Input
            id="fin-oltre"
            inputMode="numeric"
            value={oltre}
            disabled={!canManage}
            onChange={(e) => {
              setOltre(e.target.value.replace(/[^0-9]/g, ""));
              setSalvato(false);
            }}
            placeholder="0"
            className="w-24 text-right"
          />
          <span className="text-sm text-muted-foreground">% dei coperti</span>
        </RigaImpostazione>

        <RigaImpostazione
          nome="Da quante persone si passa alla telefonata"
          htmlFor="fin-gruppo"
          descrizione="Sopra questo numero il modulo pubblico non fa compilare niente: dice di chiamare e mostra il tuo numero. Era fisso a dodici, che va bene per una trattoria e non per una sala che fa banchetti — il punto in cui una prenotazione diventa un'organizzazione lo sai tu."
        >
          <Input
            id="fin-gruppo"
            inputMode="numeric"
            value={gruppo}
            disabled={!canManage}
            onChange={(e) => {
              setGruppo(e.target.value.replace(/[^0-9]/g, ""));
              setSalvato(false);
            }}
            className="w-24 text-right"
          />
          <span className="text-sm text-muted-foreground">persone</span>
        </RigaImpostazione>

        {/*
          La frase che conta: non cosa abbiamo salvato, ma **cosa vedrà il
          cliente**. Resta in fondo al gruppo perché si legge dopo aver toccato
          i quattro campi, e si aggiorna mentre li si tocca.
        */}
        <RigaLibera>
          <p className="flex items-start gap-2 text-sm text-card-foreground/80">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" aria-hidden="true" />
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
              {oltreNum > 0 && ` Oltre la capienza si accetta fino al ${oltreNum}% in più, su ogni canale.`}
              {` Da ${gruppoNum + 1} persone in su il modulo manda a telefonare.`}
            </span>
          </p>
        </RigaLibera>
      </GruppoImpostazioni>
    </form>
  );
}
