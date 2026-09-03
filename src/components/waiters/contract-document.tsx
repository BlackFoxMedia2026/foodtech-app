"use client";

import { useRef, useState } from "react";
import { Download, Eye, FileText, Image as ImageIcon, MoreHorizontal, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ContractDocumentInfo = {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
};

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatKind(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "image/jpeg") return "JPG";
  if (mimeType === "image/png") return "PNG";
  return mimeType;
}

function validateFile(file: File): string | null {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
    return "Carica un file PDF, JPG o PNG.";
  }
  if (file.size > MAX_BYTES) {
    return "Il file supera la dimensione massima consentita.";
  }
  return null;
}

export function ContractDocument({
  waiterId,
  contractId,
  document,
  onChange,
  variant = "full",
}: {
  waiterId: string;
  contractId: string;
  document: ContractDocumentInfo | null;
  onChange: (doc: ContractDocumentInfo | null) => void;
  variant?: "full" | "compact";
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = `/api/waiters/${waiterId}/contracts/${contractId}/document`;

  async function upload(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setUploading(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(baseUrl, { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.message ?? "Non è stato possibile caricare il documento. Riprova.");
      return;
    }
    const saved = await res.json();
    onChange(saved);
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(baseUrl, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setError("Impossibile eliminare il documento. Riprova.");
      return;
    }
    setConfirmingDelete(false);
    onChange(null);
  }

  const hiddenInput = (
    <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileInputChange} disabled={uploading} />
  );

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        {document ? (
          <>
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
            <button type="button" className="text-accent hover:underline" onClick={() => setPreviewOpen(true)}>
              {document.originalFileName}
            </button>
            <ContractDocumentPreview open={previewOpen} onOpenChange={setPreviewOpen} document={document} baseUrl={baseUrl} />
          </>
        ) : (
          <span className="text-muted-foreground">Nessun documento</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Documento contratto</p>

      {!document ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-5 text-center transition-colors",
            dragOver && "border-accent bg-accent/5",
          )}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Nessun documento caricato
            <br />
            Trascina qui il contratto oppure
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Caricamento…" : "Carica contratto"}
          </Button>
          <p className="text-[11px] text-muted-foreground">PDF, JPG o PNG · max 10 MB</p>
          {hiddenInput}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-md border border-border p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            {document.mimeType === "application/pdf" ? (
              <FileText className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-card-foreground">{document.originalFileName}</p>
            <p className="text-xs text-muted-foreground">
              {formatKind(document.mimeType)} · {formatFileSize(document.fileSize)} · Caricato il{" "}
              {new Date(document.createdAt).toLocaleDateString("it-IT")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-3.5 w-3.5" /> Visualizza
            </Button>
            <Button type="button" variant="ghost" size="icon" asChild>
              <a href={`${baseUrl}?download=1`} download={document.originalFileName} aria-label="Scarica documento">
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Altre azioni documento">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> Sostituisci documento
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setConfirmingDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Elimina documento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {hiddenInput}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminare il documento?</DialogTitle>
            <DialogDescription>Vuoi eliminare la copia digitale di questo contratto?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Elimino…" : "Elimina documento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {document && <ContractDocumentPreview open={previewOpen} onOpenChange={setPreviewOpen} document={document} baseUrl={baseUrl} />}
    </div>
  );
}

function ContractDocumentPreview({
  open,
  onOpenChange,
  document,
  baseUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ContractDocumentInfo;
  baseUrl: string;
}) {
  const isPdf = document.mimeType === "application/pdf";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{document.originalFileName}</DialogTitle>
          <DialogDescription>
            {formatKind(document.mimeType)} · {formatFileSize(document.fileSize)}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-md border border-border bg-muted">
          {isPdf ? (
            <iframe src={baseUrl} title={document.originalFileName} className="h-[60vh] w-full" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={baseUrl} alt={document.originalFileName} className="max-h-[60vh] w-full object-contain" />
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <a href={`${baseUrl}?download=1`} download={document.originalFileName}>
              <Download className="h-3.5 w-3.5" /> Scarica
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
