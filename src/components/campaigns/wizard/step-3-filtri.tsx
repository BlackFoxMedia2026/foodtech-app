"use client";

import { useState, type ReactNode } from "react";
import { CalendarClock, Activity, UserRound, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SegmentFilterType } from "@/server/campaigns";
import { filtriAttivi, segmentoAttivo, segmentoById } from "@/lib/campaign-segments";
import { useWizardDispatch, useWizardState } from "./wizard-context";
import { useSegmentPreview } from "./use-segment-preview";
import { RiepilogoPubblico } from "./riepilogo-pubblico";
import { quotaDelPiano } from "./quota-piano";

/*
 * I filtri che non esistono non stanno in pagina.
 *
 * Qui c'era un riquadro «Prossimamente» con sei voci — spesa del cliente,
 * coperti medi, fascia oraria, giorno della settimana, canale di acquisizione,
 * lingua — che occupava spazio per dire che sei cose non si possono fare.
 * Chi sceglie i destinatari non ha bisogno dell'elenco di ciò che manca:
 * lo legge come un prodotto a metà. Quando quei dati ci saranno, i filtri
 * compariranno qui insieme agli altri.
 */

type FutureBookingValue = "any" | "has" | "none";

function futureBookingValue(segment: SegmentFilterType): FutureBookingValue {
  if (segment.hasFutureBooking) return "has";
  if (segment.noFutureBooking) return "none";
  return "any";
}

/**
 * Otto caselle tutte uguali in una griglia sono otto caselle che nessuno
 * legge: si scorre fino a trovare la parola giusta. Raggruppate per cosa
 * descrivono — chi è il cliente, come si comporta, cosa ha prenotato — la
 * stessa lista si guarda per titoli, e la maggior parte si salta a colpo
 * d'occhio.
 */
function Sezione({
  titolo,
  descrizione,
  icon: Icon,
  children,
}: {
  titolo: string;
  descrizione: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="riquadro comodo space-y-5 bg-card/30">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="t-titolo-sezione">{titolo}</h3>
          <p className="t-nota">{descrizione}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function Step3Filtri() {
  const state = useWizardState();
  const dispatch = useWizardDispatch();
  const preview = useSegmentPreview();
  const [tagsInput, setTagsInput] = useState((state.segment.tags ?? []).join(", "));

  function updateSegment(patch: Partial<SegmentFilterType>) {
    dispatch({ type: "SET_SEGMENT", segment: { ...state.segment, ...patch } });
  }

  const attivo = segmentoAttivo(state.segment);

  return (
    <div className="space-y-7">
      <div className="max-w-2xl">
        <h2 className="text-display text-2xl md:text-3xl">Affina il tuo pubblico</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          I filtri sono facoltativi. Usa solo quelli che ti servono.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
        <div className="space-y-5">
          <Sezione
            titolo="Profilo e fidelizzazione"
            descrizione="Chi è il cliente sulla sua scheda."
            icon={UserRound}
          >
            <div className="grid gap-5 sm:grid-cols-2">
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
                <p className="t-nota">Basta che il cliente abbia uno dei tag elencati.</p>
              </div>

              <div className="space-y-2">
                <Label>Livello fedeltà</Label>
                <Select
                  value={state.segment.loyaltyTier ?? "ANY"}
                  onValueChange={(v) =>
                    updateSegment({ loyaltyTier: v === "ANY" ? undefined : (v as SegmentFilterType["loyaltyTier"]) })
                  }
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
                <p className="t-nota">È lo stesso livello del segmento «Clienti VIP».</p>
              </div>
            </div>
          </Sezione>

          <Sezione
            titolo="Comportamento cliente"
            descrizione="Quante volte è venuto, quando, e quante volte non si è presentato."
            icon={Activity}
          >
            {/* Tre per riga appena c'è spazio: le tre soglie numeriche si
                leggono in fila, e l'interruttore resta l'unica cosa larga. */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                <Label htmlFor="minNoShowCount">No-show minimi</Label>
                <Input
                  id="minNoShowCount"
                  type="number"
                  min={0}
                  value={state.segment.minNoShowCount ?? ""}
                  onChange={(e) => updateSegment({ minNoShowCount: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>

              <div className="flex items-center justify-between gap-4 riquadro comodo bg-secondary/25 sm:col-span-2 lg:col-span-3">
                <div>
                  <p className="text-sm font-medium">Ha annullato una prenotazione in passato</p>
                  <p className="text-xs text-muted-foreground">
                    Il cliente ha prenotato ma poi cancellato almeno una volta.
                  </p>
                </div>
                <Switch
                  checked={!!state.segment.hadCancelledBooking}
                  onCheckedChange={(checked) => updateSegment({ hadCancelledBooking: checked || undefined })}
                />
              </div>
            </div>
          </Sezione>

          <Sezione
            titolo="Prenotazioni"
            descrizione="Cosa ha già in agenda da qui in avanti."
            icon={CalendarClock}
          >
            <div className="grid gap-5 sm:grid-cols-2">
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
                <p className="t-nota">Utile per non riscrivere a chi ha già un tavolo prenotato.</p>
              </div>
            </div>
          </Sezione>
        </div>

        <RiepilogoPubblico
          preset={segmentoById(attivo)}
          filtri={filtriAttivi(state.segment, attivo)}
          preview={preview}
          quota={quotaDelPiano(state)}
          titoloSegmento="Segmento iniziale"
          titoloNumero="Destinatari finali"
        />
      </div>
    </div>
  );
}
