"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Table, TableShape } from "@prisma/client";
import { Check, CheckCircle2, Circle, Minus, Plus, RectangleHorizontal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SHAPE_OPTIONS: { value: TableShape; label: string; icon: typeof Circle }[] = [
  { value: "ROUND", label: "Rotondo", icon: Circle },
  { value: "SQUARE", label: "Quadrato", icon: Square },
  { value: "RECT", label: "Rettangolare", icon: RectangleHorizontal },
];

const MIN_SEATS = 1;
const MAX_SEATS = 40;

type FieldErrors = Partial<Record<"label" | "seats", string>>;

export function NewTableDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  onCreated: (table: Table) => void;
}) {
  const [label, setLabel] = useState("");
  const [seats, setSeats] = useState(2);
  const [shape, setShape] = useState<TableShape>("SQUARE");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showToast, setShowToast] = useState(false);
  const [lastCreatedLabel, setLastCreatedLabel] = useState("");
  const labelFieldRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setLabel("");
    setSeats(2);
    setShape("SQUARE");
    setFormError(null);
    setFieldErrors({});
  }

  function clampSeats(next: number) {
    if (!Number.isFinite(next)) return MIN_SEATS;
    return Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(next)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const trimmed = label.trim();
    const errors: FieldErrors = {};
    if (!trimmed) errors.label = "Inserisci un nome per il tavolo.";
    if (!seats || seats < MIN_SEATS) errors.seats = "Inserisci almeno 1 posto.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: trimmed, seats, shape, roomId, posX: 80, posY: 80 }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.code === "DUPLICATE_LABEL") {
        setFieldErrors({ label: "Esiste già un tavolo con questo nome." });
      } else {
        setFormError("Impossibile creare il tavolo. Riprova.");
      }
      return;
    }

    const created = (await res.json()) as Table;
    onCreated(created);
    onOpenChange(false);
    resetForm();
    setLastCreatedLabel(created.label);
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
          aria-labelledby="new-table-title"
          aria-describedby="new-table-description"
        >
          <DialogHeader>
            <DialogTitle id="new-table-title">Nuovo tavolo</DialogTitle>
            <DialogDescription id="new-table-description">Aggiungi un nuovo tavolo alla {roomName}.</DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
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

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter className="border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button type="submit" variant="accent" disabled={submitting}>
                {submitting ? "Creo…" : "Crea tavolo"}
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
            className="fixed bottom-6 right-6 z-[100] flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-2xl animate-fade-in"
          >
            <CheckCircle2 className="h-4 w-4 text-accent-strong" />
            Tavolo {lastCreatedLabel} creato.
          </div>,
          document.body,
        )}
    </>
  );
}
