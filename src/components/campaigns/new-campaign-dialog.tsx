"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function NewCampaignDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const tagsRaw = (fd.get("tags") as string) || "";
    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const loyaltyTier = (fd.get("loyaltyTier") as string) || "";
    const minTotalVisits = (fd.get("minTotalVisits") as string) || "";
    const inactiveDays = (fd.get("inactiveDays") as string) || "";

    const payload = {
      name: fd.get("name"),
      subject: fd.get("subject"),
      body: fd.get("body"),
      segment: {
        ...(tags.length > 0 && { tags }),
        ...(loyaltyTier && loyaltyTier !== "ANY" && { loyaltyTier }),
        ...(minTotalVisits && { minTotalVisits: Number(minTotalVisits) }),
        ...(inactiveDays && { inactiveDays: Number(inactiveDays) }),
      },
    };

    const res = await fetch("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("Impossibile creare la campagna. Verifica i dati.");
      return;
    }
    const created = await res.json();
    router.push(`/campaigns/${created.id}`);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus className="h-4 w-4" /> Nuova campagna
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova campagna email</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome campagna</Label>
            <Input id="name" name="name" required placeholder="Es. Recupero clienti dormienti" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Oggetto email</Label>
            <Input id="subject" name="subject" required placeholder="Es. Ti aspettiamo per una serata dedicata" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Corpo email (HTML)</Label>
            <Textarea id="body" name="body" required rows={6} placeholder="<p>Ciao {{FIRSTNAME}}, ...</p>" />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Segmento</p>
            <p className="text-xs text-muted-foreground">
              Solo clienti con consenso marketing attivo ed email valida verranno inclusi, indipendentemente dai
              filtri sotto.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tags">Tag (separati da virgola)</Label>
              <Input id="tags" name="tags" placeholder="Es. VIP, Alto spendente" />
            </div>
            <div className="space-y-1.5">
              <Label>Livello fedeltà</Label>
              <Select name="loyaltyTier" defaultValue="ANY">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Qualsiasi</SelectItem>
                  <SelectItem value="NEW">Nuovo</SelectItem>
                  <SelectItem value="REGULAR">Abituale</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="AMBASSADOR">Ambassador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minTotalVisits">Visite minime</Label>
              <Input id="minTotalVisits" name="minTotalVisits" type="number" min={0} placeholder="Es. 3" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inactiveDays">Inattivo da almeno (giorni)</Label>
              <Input id="inactiveDays" name="inactiveDays" type="number" min={0} placeholder="Es. 60" />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" variant="gold" disabled={submitting}>
              {submitting ? "Creazione…" : "Crea campagna"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
