"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { uploadCampaignImage } from "@/lib/campaign-wizard-api";
import { cn } from "@/lib/utils";

/**
 * Le immagini già caricate.
 *
 * Il negozio vero è Vercel Blob, e non espone un elenco: non esiste una
 * chiamata «dammi le immagini di questo locale». Finché non c'è, l'elenco lo
 * teniamo qui — gli indirizzi delle immagini caricate da questo browser. È
 * meno di una libreria condivisa e va detto com'è: chi carica da un altro
 * computer non le ritrova. Ma è vero, funziona, e copre il caso normale di chi
 * riusa la foto di ieri.
 */
const LIBRARY_KEY = "tavolo.editor-email.immagini";

function readLibrary(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeLibrary(urls: string[]) {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(urls.slice(0, 40)));
  } catch {
    /* memoria locale non disponibile: il caricamento funziona lo stesso */
  }
}

export function MediaPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (url: string) => void;
}) {
  const [tab, setTab] = useState<"caricate" | "carica">("caricate");
  const [library, setLibrary] = useState<string[]>(readLibrary);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [url, setUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function remember(next: string) {
    const updated = [next, ...library.filter((u) => u !== next)];
    setLibrary(updated);
    writeLibrary(updated);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { url: uploaded } = await uploadCampaignImage(file);
      remember(uploaded);
      onPick(uploaded);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caricamento non riuscito");
    } finally {
      setUploading(false);
    }
  }

  function forget(target: string) {
    const updated = library.filter((u) => u !== target);
    setLibrary(updated);
    writeLibrary(updated);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Immagini</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1">
          {(["caricate", "carica"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize",
                tab === t ? "bg-cream font-medium text-clay-ink" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "caricate" ? "Caricate di recente" : "Carica"}
            </button>
          ))}
        </div>

        {tab === "caricate" ? (
          library.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nessuna immagine caricata da questo computer. Passa a «Carica».
            </p>
          ) : (
            <div className="grid max-h-80 grid-cols-4 gap-3 overflow-y-auto">
              {library.map((u) => (
                <div key={u} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(u);
                      onOpenChange(false);
                    }}
                    className="block h-24 w-full overflow-hidden rounded-md border border-border bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={u} alt="" className="h-full w-full object-contain" />
                  </button>
                  <button
                    type="button"
                    aria-label="Togli dall'elenco"
                    onClick={() => forget(u)}
                    className="absolute right-1 top-1 hidden rounded bg-background/90 p-1 text-muted-foreground group-hover:block hover:text-destructive-soft"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void upload(file);
              }}
              onClick={() => fileInput.current?.click()}
              className={cn(
                "flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors",
                dragOver ? "border-accent bg-accent/10" : "border-border hover:border-border-strong"
              )}
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <ImageUp className="h-6 w-6 text-muted-foreground" />
              )}
              <p className="text-sm">{uploading ? "Caricamento…" : "Trascina qui una foto, o clicca per sceglierla"}</p>
              <p className="t-nota">JPG, PNG o GIF</p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
            <div className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Oppure incolla un indirizzo" />
              <button
                type="button"
                disabled={!url.trim()}
                onClick={() => {
                  remember(url.trim());
                  onPick(url.trim());
                  onOpenChange(false);
                }}
                className="h-9 shrink-0 rounded-md bg-cream px-4 text-sm font-medium text-clay-ink disabled:opacity-50"
              >
                Usa
              </button>
            </div>
            {error && <p className="text-xs text-destructive-soft">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
