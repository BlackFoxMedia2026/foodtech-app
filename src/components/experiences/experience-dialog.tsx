"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-client";
import type { ExperienceView } from "@/server/experiences";

/** Da `2026-09-12T20:30:00.000Z` a quello che vuole un campo data-e-ora. */
function perInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Creare o modificare un'esperienza.
 *
 * Il pulsante «Nuova esperienza» esisteva e non faceva niente: questo è ciò
 * che avrebbe dovuto aprire. I campi sono quelli che una serata a tema ha
 * davvero — titolo, quando, quanti posti, quanto costa — più il link a dove i
 * biglietti si vendono, perché **da qui non si vendono**.
 */
export function ExperienceDialog({
  open,
  onOpenChange,
  experience,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Assente quando si crea. */
  experience?: ExperienceView;
}) {
  const router = useRouter();
  const modifica = !!experience;

  const [title, setTitle] = useState(experience?.title ?? "");
  const [description, setDescription] = useState(experience?.description ?? "");
  const [startsAt, setStartsAt] = useState(experience ? perInput(new Date(experience.startsAt)) : "");
  const [endsAt, setEndsAt] = useState(experience ? perInput(new Date(experience.endsAt)) : "");
  const [capacity, setCapacity] = useState(String(experience?.capacity ?? 40));
  const [prezzo, setPrezzo] = useState(experience ? String(experience.priceCents / 100) : "0");
  const [ticketUrl, setTicketUrl] = useState(experience?.ticketUrl ?? "");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function salva() {
    setInCorso(true);
    setError(null);

    const res = await fetch(modifica ? `/api/experiences/${experience!.id}` : "/api/experiences", {
      method: modifica ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description: description.trim() || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        capacity: Number(capacity),
        priceCents: Math.round(Number(prezzo.replace(",", ".")) * 100),
        ticketUrl: ticketUrl.trim() || null,
      }),
    });

    setInCorso(false);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti a salvare. Controlla i campi."));
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modifica ? "Modifica esperienza" : "Nuova esperienza"}</DialogTitle>
          <DialogDescription>
            Nasce come bozza: la pubblichi quando è pronta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="exp-title">Titolo</Label>
            <Input
              id="exp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es. Cena con il produttore"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp-inizio">Inizio</Label>
              <Input
                id="exp-inizio"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => {
                  setStartsAt(e.target.value);
                  // La fine, se è vuota, si propone tre ore dopo: è la durata
                  // di una cena, e riscriverla ogni volta è tempo perso.
                  if (!endsAt && e.target.value) {
                    const fine = new Date(new Date(e.target.value).getTime() + 3 * 3_600_000);
                    setEndsAt(perInput(fine));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-fine">Fine</Label>
              <Input id="exp-fine" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp-posti">Posti</Label>
              <Input
                id="exp-posti"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-prezzo">Prezzo a persona (€)</Label>
              <Input id="exp-prezzo" inputMode="decimal" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-descrizione">Descrizione</Label>
            <Textarea
              id="exp-descrizione"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cosa succede quella sera"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="exp-biglietti">Link per i biglietti</Label>
            <Input
              id="exp-biglietti"
              value={ticketUrl}
              onChange={(e) => setTicketUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="text-xs text-tertiary-foreground">
              I biglietti non si vendono da Tavolo: metti il link a dove si comprano davvero, e comparirà sulla
              scheda dell&apos;esperienza.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button variant="accent" onClick={salva} disabled={inCorso || !title.trim() || !startsAt || !endsAt}>
            {inCorso ? "Salvo…" : modifica ? "Salva" : "Crea come bozza"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
