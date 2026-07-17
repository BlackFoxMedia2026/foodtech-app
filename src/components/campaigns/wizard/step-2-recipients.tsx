"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SegmentFilterType } from "@/server/campaigns";
import { fetchSegmentPreview } from "@/lib/campaign-wizard-api";
import { useWizardDispatch, useWizardState } from "./wizard-context";

// Volutamente ridotti al minimo per non confondere un utente non tecnico.
// Nessun preset "tutti con consenso marketing": il consenso è già applicato
// sempre e comunque a ogni filtro (vedi testo sotto), non è una scelta di
// segmento. I compleanni sono gestiti da un'automazione dedicata a parte,
// non da questo wizard. I segmenti rimossi da qui restano comunque
// impostabili tramite i filtri dettagliati più sotto (es. no-show,
// prenotazione futura/cancellata, clienti ricorrenti, altre soglie di
// giorni di inattività).
const PRESETS: { label: string; segment: SegmentFilterType }[] = [
  { label: "Clienti nuovi", segment: { loyaltyTier: "NEW" } },
  { label: "Clienti VIP", segment: { loyaltyTier: "VIP" } },
  { label: "Inattivi da 60gg", segment: { inactiveDays: 60 } },
  { label: "Alto spendenti", segment: { minTotalSpend: 150 } },
];

const UNAVAILABLE_FILTERS = [
  "Fascia oraria specifica (pranzo/cena)",
  "Giorno della settimana",
  "Canale di acquisizione (sito, Google, Instagram, walk-in)",
  "Lingua del cliente",
];

type FutureBookingValue = "any" | "has" | "none";

function futureBookingValue(segment: SegmentFilterType): FutureBookingValue {
  if (segment.hasFutureBooking) return "has";
  if (segment.noFutureBooking) return "none";
  return "any";
}

export function Step2Recipients() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const [tagsInput, setTagsInput] = useState((state.segment.tags ?? []).join(", "));
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  function updateSegment(patch: Partial<SegmentFilterType>) {
    dispatch({ type: "SET_SEGMENT", segment: { ...state.segment, ...patch } });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const preview = await fetchSegmentPreview(state.segment);
        // Scarta la risposta se nel frattempo è partita una richiesta più recente
        // (es. rete lenta/instabile): l'ultima innescata deve vincere, non l'ultima arrivata.
        if (requestId === requestIdRef.current) {
          dispatch({ type: "SET_SEGMENT_PREVIEW", preview });
        }
      } catch {
        // il breakdown è un ausilio, non blocca il wizard se la preview fallisce
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(state.segment)]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-display text-lg">Chi deve ricevere questa campagna?</h2>
        <p className="text-sm text-muted-foreground">
          Verranno inclusi solo clienti con consenso marketing attivo ed email valida, indipendentemente dai filtri sotto.
        </p>
      </div>

      <div>
        <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">Segmenti rapidi</Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            // Confronto diretto con lo stato corrente: il pulsante resta "attivo"
            // solo finché i filtri coincidono esattamente col preset, non è un
            // semplice "ultimo cliccato" — se poi tocchi un filtro dettagliato
            // sotto, l'evidenziazione sparisce di conseguenza (corretto, riflette
            // lo stato reale).
            const isActive = JSON.stringify(state.segment) === JSON.stringify(preset.segment);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => dispatch({ type: "SET_SEGMENT", segment: preset.segment })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  isActive ? "border-accent bg-accent/10 font-medium text-accent" : "border-border hover:bg-secondary",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tags">Tag (separati da virgola)</Label>
          <Input
            id="tags"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            onBlur={() =>
              updateSegment({
                tags: tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            placeholder="es. celiaco, terrazza"
          />
        </div>

        <div className="space-y-2">
          <Label>Livello fedeltà</Label>
          <Select
            value={state.segment.loyaltyTier ?? "ANY"}
            onValueChange={(v) => updateSegment({ loyaltyTier: v === "ANY" ? undefined : (v as SegmentFilterType["loyaltyTier"]) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANY">Qualsiasi</SelectItem>
              <SelectItem value="NEW">Nuovo</SelectItem>
              <SelectItem value="REGULAR">Regolare</SelectItem>
              <SelectItem value="VIP">VIP</SelectItem>
              <SelectItem value="AMBASSADOR">Ambassador</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minTotalVisits">Visite minime</Label>
          <Input
            id="minTotalVisits"
            type="number"
            min={0}
            value={state.segment.minTotalVisits ?? ""}
            onChange={(e) => updateSegment({ minTotalVisits: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inactiveDays">Inattivo da almeno (giorni)</Label>
          <Input
            id="inactiveDays"
            type="number"
            min={0}
            value={state.segment.inactiveDays ?? ""}
            onChange={(e) => updateSegment({ inactiveDays: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="minTotalSpend">Spesa totale minima (€)</Label>
          <Input
            id="minTotalSpend"
            type="number"
            min={0}
            value={state.segment.minTotalSpend ?? ""}
            onChange={(e) => updateSegment({ minTotalSpend: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="minNoShowCount">No-show minimi</Label>
          <Input
            id="minNoShowCount"
            type="number"
            min={0}
            value={state.segment.minNoShowCount ?? ""}
            onChange={(e) => updateSegment({ minNoShowCount: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>

        <div className="space-y-2">
          <Label>Prenotazione futura</Label>
          <Select
            value={futureBookingValue(state.segment)}
            onValueChange={(v: FutureBookingValue) =>
              updateSegment({
                hasFutureBooking: v === "has" ? true : undefined,
                noFutureBooking: v === "none" ? true : undefined,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Qualsiasi</SelectItem>
              <SelectItem value="has">Con prenotazione futura</SelectItem>
              <SelectItem value="none">Senza prenotazione futura</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Ha annullato una prenotazione in passato</p>
            <p className="text-xs text-muted-foreground">Il cliente ha prenotato ma poi cancellato almeno una volta.</p>
          </div>
          <Switch
            checked={!!state.segment.hadCancelledBooking}
            onCheckedChange={(checked) => updateSegment({ hadCancelledBooking: checked || undefined })}
          />
        </div>
      </div>

      <div className="rounded-md border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Prossimamente</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {UNAVAILABLE_FILTERS.map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-border bg-secondary/50 p-4">
        <p className="text-sm font-medium">Destinatari finali: {state.segmentPreview?.finalRecipients ?? "—"}</p>
        {state.segmentPreview && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <li>{state.segmentPreview.totalMatchingFilters} clienti corrispondono ai filtri</li>
            <li>{state.segmentPreview.excludedNoEmail} esclusi perché senza email valida</li>
            <li>{state.segmentPreview.excludedNoConsent} esclusi perché senza consenso marketing</li>
          </ul>
        )}
        {state.segmentPreview && state.segmentPreview.finalRecipients === 0 && (
          <p className="mt-2 text-xs text-amber-600">Nessun destinatario corrisponde a questi filtri.</p>
        )}
      </div>
    </div>
  );
}
