"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, QrCode as QrCodeIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createQrCode, deleteQrCode, updateQrCode, type QrCodeInput } from "@/lib/qr-codes-api";
import { QrCodePreview } from "./qr-code-preview";

type Category = NonNullable<QrCodeInput["category"]>;

const CATEGORY_LABELS: Record<Category, string> = {
  MENU: "Menu",
  BOOKING: "Prenotazione",
  EVENT: "Evento",
  REVIEW: "Recensione",
  CAMPAIGN: "Campagna",
  SOCIAL: "Social",
  OTHER: "Altro",
};

export interface QrCodeItem {
  id: string;
  name: string;
  description: string | null;
  destinationUrl: string;
  category: Category;
  isActive: boolean;
  scansCount: number;
  createdAtLabel: string;
}

function CreateQrCodeDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("OTHER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDestinationUrl("");
    setDescription("");
    setCategory("OTHER");
    setError(null);
  }

  async function handleSubmit() {
    if (!name.trim() || !destinationUrl.trim()) {
      setError("Nome e URL sono obbligatori.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createQrCode({
        name: name.trim(),
        destinationUrl: destinationUrl.trim(),
        description: description.trim() || undefined,
        category,
      });
      setOpen(false);
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error && err.message === "URL non valido" ? "L'URL inserito non è valido." : "Creazione non riuscita.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="gold">
          <Plus className="h-4 w-4" /> Nuovo QR code
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuovo QR code</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qr-name">Nome QR code</Label>
            <Input id="qr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Menu digitale" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-url">URL di destinazione</Label>
            <Input
              id="qr-url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="es. iltuolocale.it/menu"
            />
            <p className="text-xs text-muted-foreground">Se manca, aggiungiamo automaticamente &quot;https://&quot;.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-description">Descrizione (opzionale)</Label>
            <Textarea id="qr-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button variant="gold" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creazione..." : "Crea QR code"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrCodeCard({ item, onChanged }: { item: QrCodeItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      await updateQrCode(item.id, { isActive: !item.isActive });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Eliminare il QR code "${item.name}"?`)) return;
    setBusy(true);
    try {
      await deleteQrCode(item.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{item.name}</p>
            <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Attivo" : "Disattivo"}</Badge>
          </div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[item.category]}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <QrCodePreview name={item.name} value={item.destinationUrl} size={140} />
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
        <p className="truncate text-xs text-muted-foreground" title={item.destinationUrl}>
          {item.destinationUrl}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.scansCount} scansioni · Creato {item.createdAtLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={item.destinationUrl} variant="outline" size="sm">
            Copia URL
          </CopyButton>
          <Button type="button" variant="outline" size="sm" onClick={toggleActive} disabled={busy}>
            {item.isActive ? "Disattiva" : "Attiva"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={busy}>
            <Trash2 className="h-3.5 w-3.5" /> Elimina
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function QrCodeManager({ items }: { items: QrCodeItem[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Marketing</p>
          <h1 className="text-display text-3xl">QR Code</h1>
          <p className="text-sm text-muted-foreground">
            Crea QR code collegati a menu, prenotazioni, eventi o campagne.
          </p>
        </div>
        <CreateQrCodeDialog onCreated={refresh} />
      </header>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center">
          <QrCodeIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nessun QR code creato</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea il tuo primo QR code per collegare menu, prenotazioni o campagne.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <QrCodeCard key={item.id} item={item} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
