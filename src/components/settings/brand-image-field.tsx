"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadBrandImage } from "@/lib/venue-brand-api";

/**
 * Stesso pattern già costruito per i blocchi immagine dell'editor email
 * (ImageField in block-inspector.tsx): un'unica azione primaria ("Carica"),
 * niente campo URL sempre visibile — qui non serve nemmeno quello manuale,
 * i loghi/copertine si caricano sempre da file.
 */
export function BrandImageField({
  label,
  value,
  onChange,
  removeLabel = "Rimuovi logo",
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  removeLabel?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadBrandImage(file);
      onChange(url);
    } catch {
      setError("Caricamento logo non riuscito. Riprova.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-14 w-14 rounded border border-border bg-white object-contain p-1" />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Carico..." : "Cambia logo"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            {removeLabel}
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Carico..." : "Carica"}
        </Button>
      )}
      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleFileChange} />
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}
