"use client";

import { useEffect, useRef, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { createPortal } from "react-dom";
import type { Table, TablePreset, TableShape } from "@prisma/client";
import { Check, CheckCircle2, Circle, Minus, Plus, RectangleHorizontal, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { pxToMeters, metersToPx } from "@/lib/room-layout";
import { dimensioneDisegnata } from "@/lib/tavolo-geometria";

const SHAPE_OPTIONS: { value: TableShape; label: string; icon: typeof Circle }[] = [
  { value: "ROUND", label: "Rotondo", icon: Circle },
  { value: "SQUARE", label: "Quadrato", icon: Square },
  { value: "RECT", label: "Rettangolare", icon: RectangleHorizontal },
];

const MIN_SEATS = 1;
const MAX_SEATS = 40;

type FieldErrors = Partial<Record<"label" | "seats" | "nomePredefinito", string>>;

/**
 * Creare un tavolo e **modificarlo**: lo stesso modulo.
 *
 * Erano due cose e una sola esisteva: si poteva aggiungere un tavolo, non
 * correggerne il nome o i posti — un «T12» battuto male restava T12, e l'unica
 * strada era cancellarlo e rifarlo, cioè perdere le prenotazioni che ci stavano
 * sopra. Il modulo è identico nei due casi: tre campi, gli stessi controlli,
 * lo stesso messaggio quando il nome è già preso. Duplicarlo avrebbe voluto dire
 * due posti in cui ricordarsi che i posti stanno fra 1 e 40.
 *
 * Quello che **non** si tocca qui è la posizione sulla pianta: quella si
 * trascina, e si trascina dentro il costruttore della sala.
 */
export function TableDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  tavolo = null,
  onSalvato,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  /** Il tavolo da modificare. Nullo: se ne sta creando uno nuovo. */
  tavolo?: { id: string; label: string; seats: number; shape: TableShape } | null;
  onSalvato: (table: Table) => void;
}) {
  const modifica = tavolo !== null;
  const [label, setLabel] = useState(tavolo?.label ?? "");
  const [seats, setSeats] = useState(tavolo?.seats ?? 2);
  const [shape, setShape] = useState<TableShape>(tavolo?.shape ?? "SQUARE");
  const [larghezzaCm, setLarghezzaCm] = useState("");
  const [altezzaCm, setAltezzaCm] = useState("");
  const [salvaPredefinito, setSalvaPredefinito] = useState(false);
  const [nomePredefinito, setNomePredefinito] = useState("");
  const [predefiniti, setPredefiniti] = useState<TablePreset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showToast, setShowToast] = useState(false);
  const [lastCreatedLabel, setLastCreatedLabel] = useState("");
  const labelFieldRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setLabel(tavolo?.label ?? "");
    setSeats(tavolo?.seats ?? 2);
    setShape(tavolo?.shape ?? "SQUARE");
    setLarghezzaCm("");
    setAltezzaCm("");
    setSalvaPredefinito(false);
    setNomePredefinito("");
    setFormError(null);
    setFieldErrors({});
  }

  // Riaprendo su un tavolo diverso il modulo deve dire **quel** tavolo: senza
  // questo si riaprirebbe con il nome di quello aperto la volta prima.
  useEffect(() => {
    if (!open) return;
    setLabel(tavolo?.label ?? "");
    setSeats(tavolo?.seats ?? 2);
    setShape(tavolo?.shape ?? "SQUARE");
    setLarghezzaCm("");
    setAltezzaCm("");
    setSalvaPredefinito(false);
    setNomePredefinito("");
    setFormError(null);
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tavolo?.id]);

  // I predefiniti valgono per tutto il locale: si caricano all'apertura, non
  // a ogni tasto — chi li gestisce da qui non ne crea decine in una sessione.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await fetch("/api/table-presets");
        if (!res.ok) return;
        setPredefiniti((await res.json()) as TablePreset[]);
      } catch (err) {
        console.error("Caricamento tavoli predefiniti non riuscito:", err);
      }
    })();
  }, [open]);

  function applicaPredefinito(p: TablePreset) {
    setShape(p.shape);
    setSeats(p.seats);
    setLarghezzaCm(String(Math.round(pxToMeters(p.width) * 100)));
    setAltezzaCm(String(Math.round(pxToMeters(p.height) * 100)));
  }

  async function eliminaPredefinito(p: TablePreset) {
    try {
      const res = await fetch(`/api/table-presets/${p.id}`, { method: "DELETE" });
      if (!res.ok) return;
      setPredefiniti((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      console.error("Eliminazione tavolo predefinito non riuscita:", err);
    }
  }

  const misuraAuto = dimensioneDisegnata({ shape, seats });

  function clampSeats(next: number) {
    if (!Number.isFinite(next)) return MIN_SEATS;
    return Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(next)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const trimmed = label.trim();
    const nomePredefinitoTrim = nomePredefinito.trim();
    const errors: FieldErrors = {};
    if (!trimmed) errors.label = "Inserisci un nome per il tavolo.";
    if (!seats || seats < MIN_SEATS) errors.seats = "Inserisci almeno 1 posto.";
    if (salvaPredefinito && !nomePredefinitoTrim) errors.nomePredefinito = "Dai un nome al predefinito.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    // Un campo lasciato vuoto resta «usa la misura standard della forma»:
    // solo chi scrive un numero sta davvero scegliendo una misura diversa.
    const larghezzaPx = larghezzaCm.trim() ? metersToPx(Number(larghezzaCm) / 100) : null;
    const altezzaPx = altezzaCm.trim() ? metersToPx(Number(altezzaCm) / 100) : null;

    let res: Response;
    try {
      res = modifica
        ? await fetch(`/api/tables/${tavolo.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ label: trimmed, seats, shape, width: larghezzaPx, height: altezzaPx }),
          })
        : await fetch("/api/tables", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              label: trimmed,
              seats,
              shape,
              roomId,
              posX: 80,
              posY: 80,
              width: larghezzaPx,
              height: altezzaPx,
            }),
          });
    } catch (err) {
      console.error("Salvataggio tavolo non riuscito:", err);
      setSubmitting(false);
      setFormError("Controlla la connessione e riprova: il tavolo non è stato salvato.");
      return;
    }
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      // Il vincolo è `[venueId, label]` nel database: la PATCH lo viola come
      // la POST, e qui deve leggersi allo stesso modo.
      if (body?.code === "DUPLICATE_LABEL" || body?.error?.includes?.("Unique constraint")) {
        setFieldErrors({ label: "Esiste già un tavolo con questo nome." });
      } else {
        setFormError(
          await readApiError(
            res,
            modifica ? "Impossibile salvare il tavolo. Riprova." : "Impossibile creare il tavolo. Riprova.",
          ),
        );
      }
      return;
    }

    const salvato = (await res.json()) as Table;

    // Il predefinito è una comodità in più: se il tavolo è già salvato, un suo
    // intoppo (un nome già usato) non deve far perdere il tavolo appena creato.
    if (salvaPredefinito) {
      try {
        const presetRes = await fetch("/api/table-presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: nomePredefinitoTrim,
            shape,
            seats,
            width: larghezzaPx ?? misuraAuto.w,
            height: altezzaPx ?? misuraAuto.h,
          }),
        });
        if (presetRes.ok) {
          const nuovoPredefinito = (await presetRes.json()) as TablePreset;
          setPredefiniti((prev) => [...prev, nuovoPredefinito]);
        } else {
          console.error("Salvataggio tavolo predefinito non riuscito:", await presetRes.text());
        }
      } catch (err) {
        console.error("Salvataggio tavolo predefinito non riuscito:", err);
      }
    }

    onSalvato(salvato);
    onOpenChange(false);
    resetForm();
    setLastCreatedLabel(salvato.label);
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 3500);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent
          className="max-w-[560px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            labelFieldRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{modifica ? `Tavolo ${tavolo.label}` : "Nuovo tavolo"}</DialogTitle>
            <DialogDescription>
              {modifica ? `Nome, posti e forma. La posizione si sposta dalla piantina.` : `Aggiungi un nuovo tavolo alla ${roomName}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="table-label">Nome tavolo</Label>
              <Input
                id="table-label"
                ref={labelFieldRef}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Es. T20"
                aria-invalid={!!fieldErrors.label}
                aria-describedby={fieldErrors.label ? "table-label-error" : undefined}
              />
              {fieldErrors.label && (
                <p id="table-label-error" className="text-xs text-destructive">
                  {fieldErrors.label}
                </p>
              )}
            </div>

            {predefiniti.length > 0 && (
              <div className="space-y-1.5">
                <Label>Tavolo predefinito</Label>
                <div className="flex flex-wrap gap-2">
                  {predefiniti.map((p) => (
                    <div
                      key={p.id}
                      className="group flex items-center gap-1 rounded-full border border-border bg-background/40 pl-3 pr-1 py-1 text-xs"
                    >
                      <button type="button" onClick={() => applicaPredefinito(p)} className="font-medium hover:text-accent-strong">
                        {p.label}
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminaPredefinito(p)}
                        aria-label={`Elimina predefinito ${p.label}`}
                        className="rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Scegline uno per riempire posti, forma e misura come l&apos;hai salvato.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="table-seats">Numero di posti</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setSeats((s) => clampSeats(s - 1))}
                  disabled={seats <= MIN_SEATS}
                  aria-label="Diminuisci posti"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="table-seats"
                  type="number"
                  inputMode="numeric"
                  min={MIN_SEATS}
                  max={MAX_SEATS}
                  value={seats}
                  onChange={(e) => setSeats(clampSeats(Number(e.target.value)))}
                  className="h-9 w-16 text-center"
                  aria-invalid={!!fieldErrors.seats}
                  aria-describedby={fieldErrors.seats ? "table-seats-error" : undefined}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setSeats((s) => clampSeats(s + 1))}
                  disabled={seats >= MAX_SEATS}
                  aria-label="Aumenta posti"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {fieldErrors.seats && (
                <p id="table-seats-error" className="text-xs text-destructive">
                  {fieldErrors.seats}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Forma</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setShape(opt.value)}
                    aria-pressed={shape === opt.value}
                    className={cn(
                      "relative flex flex-col items-center gap-1.5 rounded-md border px-3 py-3 text-xs font-medium transition-colors",
                      shape === opt.value
                        ? "border-surface-brown-light bg-surface-brown/15 text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    <opt.icon className="h-5 w-5" />
                    {opt.label}
                    {shape === opt.value && <Check className="absolute right-1.5 top-1.5 h-3 w-3 text-accent-strong" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Misura (cm)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={String(Math.round(pxToMeters(misuraAuto.w) * 100))}
                  value={larghezzaCm}
                  onChange={(e) => setLarghezzaCm(e.target.value)}
                  className="h-9"
                  aria-label="Larghezza in centimetri"
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder={String(Math.round(pxToMeters(misuraAuto.h) * 100))}
                  value={altezzaCm}
                  onChange={(e) => setAltezzaCm(e.target.value)}
                  className="h-9"
                  aria-label="Altezza in centimetri"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Vuoto: la misura standard per {seats} posti ({Math.round(pxToMeters(misuraAuto.w) * 100)}×
                {Math.round(pxToMeters(misuraAuto.h) * 100)} cm).
              </p>
            </div>

            <div className="space-y-1.5 border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={salvaPredefinito}
                  onChange={(e) => setSalvaPredefinito(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Salva questa misura come tavolo predefinito
              </label>
              {salvaPredefinito && (
                <div className="space-y-1">
                  <Input
                    value={nomePredefinito}
                    onChange={(e) => setNomePredefinito(e.target.value)}
                    placeholder="Es. Quadrato bar"
                    aria-invalid={!!fieldErrors.nomePredefinito}
                  />
                  {fieldErrors.nomePredefinito && (
                    <p className="text-xs text-destructive">{fieldErrors.nomePredefinito}</p>
                  )}
                </div>
              )}
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter className="border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={submitting}>
                {submitting ? "Salvo…" : modifica ? "Salva tavolo" : "Crea tavolo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {showToast &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 riquadro bg-card px-4 py-3 text-sm text-card-foreground shadow-2xl animate-fade-in"
          >
            <CheckCircle2 className="h-4 w-4 text-accent-strong" />
            Tavolo {lastCreatedLabel} {modifica ? "salvato" : "creato"}.
          </div>,
          document.body,
        )}
    </>
  );
}
