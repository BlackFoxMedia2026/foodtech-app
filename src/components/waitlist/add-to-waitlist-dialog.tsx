"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * Chi mette qualcuno in lista lo fa in piedi, con una persona davanti che
 * aspetta. Nome e numero di persone bastano: tutto il resto è opzionale e sta
 * sotto. Il campo del nome parte già a fuoco.
 */
export function AddToWaitlistDialog({
  open,
  onOpenChange,
  rooms,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: { id: string; name: string }[];
  onAdded: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState("");
  const [expectedWaitMin, setExpectedWaitMin] = useState(20);
  const [preferredRoomId, setPreferredRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setGuestName("");
    setPartySize(2);
    setPhone("");
    setExpectedWaitMin(20);
    setPreferredRoomId("");
    setNotes("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        guestName,
        partySize,
        phone: phone || null,
        expectedWaitMin,
        preferredRoomId: preferredRoomId || null,
        notes: notes || null,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad aggiungere la persona in lista. Riprova."));
      return;
    }

    reset();
    onOpenChange(false);
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi in lista d&apos;attesa</DialogTitle>
          <DialogDescription>
            Tavolo tiene il turno e ti avvisa appena si libera un tavolo che può accoglierli.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="wl-name">Nome</Label>
              <Input
                id="wl-name"
                autoFocus
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Come li chiamiamo"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wl-party">Persone</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Una persona in meno"
                  onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Input
                  id="wl-party"
                  type="number"
                  min={1}
                  max={50}
                  className="w-16 text-center"
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Una persona in più"
                  onClick={() => setPartySize((n) => Math.min(50, n + 1))}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wl-phone">Telefono (per avvisarli)</Label>
              <Input
                id="wl-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+39 …"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wl-wait">Attesa stimata</Label>
              <div className="flex flex-wrap gap-1">
                {[10, 20, 30, 45, 60].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setExpectedWaitMin(min)}
                    aria-pressed={expectedWaitMin === min}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm transition-colors",
                      expectedWaitMin === min
                        ? "bg-cream text-clay-ink"
                        : "bg-current/10 text-muted-foreground hover:bg-current/15",
                    )}
                  >
                    {min}′
                  </button>
                ))}
              </div>
            </div>
          </div>

          {rooms.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="wl-room">Preferenza di sala (opzionale)</Label>
              <select
                id="wl-room"
                value={preferredRoomId}
                onChange={(e) => setPreferredRoomId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Nessuna preferenza</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="wl-notes">Note (opzionale)</Label>
            <Textarea
              id="wl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergie, passeggino, preferenze…"
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" variant="accent" disabled={submitting || guestName.trim().length === 0}>
              {submitting ? "Aggiungo…" : "Aggiungi in lista"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
