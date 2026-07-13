"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SegmentFilterType } from "@/server/campaigns";
import { fetchSegmentPreview } from "@/lib/campaign-wizard-api";
import { useWizardDispatch, useWizardState } from "./wizard-context";

const PRESETS: { label: string; segment: SegmentFilterType }[] = [
  { label: "Tutti con consenso marketing", segment: {} },
  { label: "Clienti nuovi", segment: { loyaltyTier: "NEW" } },
  { label: "Clienti ricorrenti", segment: { minTotalVisits: 2 } },
  { label: "Clienti VIP", segment: { loyaltyTier: "VIP" } },
  { label: "Inattivi da 30gg", segment: { inactiveDays: 30 } },
  { label: "Inattivi da 60gg", segment: { inactiveDays: 60 } },
  { label: "Inattivi da 90gg", segment: { inactiveDays: 90 } },
  { label: "Alto spendenti", segment: { minTotalSpend: 150 } },
  { label: "Con no-show", segment: { minNoShowCount: 1 } },
  { label: "Compleanno nel mese", segment: { birthdayThisMonth: true } },
  { label: "Senza prenotazione futura", segment: { noFutureBooking: true } },
  { label: "Con prenotazione cancellata", segment: { hadCancelledBooking: true } },
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

  function updateSegment(patch: Partial<SegmentFilterType>) {
    dispatch({ type: "SET_SEGMENT", segment: { ...state.segment, ...patch } });
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const preview = await fetchSegmentPreview(state.segment);
        dispatch({ type: "SET_SEGMENT_PREVIEW", preview });
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
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => dispatch({ type: "SET_SEGMENT", segment: preset.segment })}
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary"
            >
              {preset.label}
            </button>
          ))}
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
            <p className="text-sm font-medium">Compleanno questo mese</p>
          </div>
          <Switch
            checked={!!state.segment.birthdayThisMonth}
            onCheckedChange={(checked) => updateSegment({ birthdayThisMonth: checked || undefined })}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Ha avuto una prenotazione cancellata</p>
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
