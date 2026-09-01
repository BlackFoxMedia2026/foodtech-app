"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function FloorPlanDialog({
  open,
  onOpenChange,
  roomId,
  roomName,
  currentUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  roomName: string;
  currentUrl: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPreviewUrl(null);
    setPendingFile(null);
    setError(null);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSave() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", pendingFile);
    const res = await fetch(`/api/rooms/${roomId}/floor-plan`, { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      setError("Caricamento piantina non riuscito. Riprova.");
      return;
    }
    reset();
    onOpenChange(false);
    router.refresh();
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    const res = await fetch(`/api/rooms/${roomId}/floor-plan`, { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      setError("Impossibile rimuovere la piantina. Riprova.");
      return;
    }
    reset();
    onOpenChange(false);
    router.refresh();
  }

  const displayUrl = previewUrl ?? currentUrl;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-[560px]" aria-labelledby="floor-plan-title" aria-describedby="floor-plan-description">
        <DialogHeader>
          <DialogTitle id="floor-plan-title">Piantina della sala</DialogTitle>
          <DialogDescription id="floor-plan-description">
            Carica la piantina di questa sala per utilizzarla come riferimento nell&apos;editor dei tavoli.
          </DialogDescription>
          <p className="text-sm font-medium text-card-foreground">{roomName}</p>
        </DialogHeader>

        <div className="space-y-3">
          {displayUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={displayUrl}
              alt={`Piantina di ${roomName}`}
              className="max-h-64 w-full rounded-md border border-border object-contain"
            />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border py-10 text-sm text-muted-foreground hover:bg-secondary"
            >
              <UploadCloud className="h-6 w-6" />
              Trascina qui la piantina o seleziona un file
            </button>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <FileImage className="h-3.5 w-3.5" />
              {displayUrl ? "Sostituisci" : "Seleziona file"}
            </Button>
            {currentUrl && !pendingFile && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={removing}>
                {removing ? "Rimuovo…" : "Rimuovi"}
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
          <p className="text-xs text-muted-foreground">PNG, JPG o WEBP · massimo 10 MB.</p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="button" variant="accent" onClick={handleSave} disabled={!pendingFile || uploading}>
              {uploading ? "Salvataggio…" : "Salva piantina"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
