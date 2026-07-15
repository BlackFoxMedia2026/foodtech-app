"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Block, BlockAlign, SimpleBlock } from "@/lib/campaign-blocks";
import { uploadCampaignImage } from "@/lib/campaign-wizard-api";

/**
 * Un'unica azione primaria (carica dal dispositivo, via
 * /api/campaigns/upload-image → Vercel Blob). L'URL manuale resta
 * disponibile ma dietro un link secondario, non come campo sempre visibile:
 * per chi carica una foto propria è rumore, per chi ha già un'immagine
 * ospitata altrove resta a un click di distanza.
 */
function ImageField({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  onFocus?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrlField, setShowUrlField] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadCampaignImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caricamento non riuscito");
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
          <img src={value} alt="" className="h-12 w-12 rounded border border-border bg-white object-contain p-1" />
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Carico..." : "Sostituisci"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
            Rimuovi
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Carico..." : "Carica immagine"}
        </Button>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {showUrlField ? (
        <Input
          value={value}
          onFocus={onFocus}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
          placeholder="URL immagine"
          className="text-xs"
        />
      ) : (
        <button type="button" className="block text-xs text-muted-foreground underline" onClick={() => setShowUrlField(true)}>
          Oppure incolla un URL
        </button>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function AlignField({ value, onChange }: { value: BlockAlign; onChange: (v: BlockAlign) => void }) {
  return (
    <div className="space-y-1">
      <Label>Allineamento</Label>
      <Select value={value} onValueChange={(v) => onChange(v as BlockAlign)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="left">Sinistra</SelectItem>
          <SelectItem value="center">Centro</SelectItem>
          <SelectItem value="right">Destra</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function SimpleBlockFields({
  block,
  onChange,
  onFieldFocus,
}: {
  block: SimpleBlock;
  onChange: (b: SimpleBlock) => void;
  onFieldFocus: (field: string) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <div className="space-y-1">
          <Label>Testo</Label>
          <Textarea
            rows={4}
            value={block.text}
            onFocus={() => onFieldFocus("text")}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
          />
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          <ImageField
            label="Immagine"
            value={block.imageUrl}
            onFocus={() => onFieldFocus("imageUrl")}
            onChange={(imageUrl) => onChange({ ...block, imageUrl })}
          />
          <Label>Testo alternativo</Label>
          <Input value={block.alt} onFocus={() => onFieldFocus("alt")} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
        </div>
      );
    case "button_cta":
      return (
        <div className="space-y-2">
          <Label>Testo bottone</Label>
          <Input value={block.label} onFocus={() => onFieldFocus("label")} onChange={(e) => onChange({ ...block, label: e.target.value })} />
          <Label>Link</Label>
          <Input value={block.url} onFocus={() => onFieldFocus("url")} onChange={(e) => onChange({ ...block, url: e.target.value })} />
        </div>
      );
  }
}

export function BlockInspector({
  block,
  onChange,
  onFieldFocus,
}: {
  block: Block | null;
  onChange: (updated: Block) => void;
  onFieldFocus: (field: string) => void;
}) {
  if (!block) {
    return <p className="text-sm text-muted-foreground">Seleziona un blocco per modificarlo.</p>;
  }

  switch (block.type) {
    case "logo":
      return (
        <div className="space-y-3">
          <ImageField
            label="Logo"
            value={block.imageUrl}
            onFocus={() => onFieldFocus("imageUrl")}
            onChange={(imageUrl) => onChange({ ...block, imageUrl })}
          />
          <AlignField value={block.align} onChange={(align) => onChange({ ...block, align })} />
        </div>
      );
    case "hero_image":
      return (
        <div className="space-y-3">
          <ImageField
            label="Immagine"
            value={block.imageUrl}
            onFocus={() => onFieldFocus("imageUrl")}
            onChange={(imageUrl) => onChange({ ...block, imageUrl })}
          />
          <Label>Testo alternativo</Label>
          <Input value={block.alt} onFocus={() => onFieldFocus("alt")} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
        </div>
      );
    case "title":
      return (
        <div className="space-y-3">
          <Label>Testo titolo</Label>
          <Input value={block.text} onFocus={() => onFieldFocus("text")} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          <AlignField value={block.align} onChange={(align) => onChange({ ...block, align })} />
        </div>
      );
    case "text":
    case "image":
    case "button_cta":
      return (
        <div className="space-y-3">
          <SimpleBlockFields block={block} onChange={(b) => onChange(b as Block)} onFieldFocus={onFieldFocus} />
          {"align" in block && <AlignField value={block.align} onChange={(align) => onChange({ ...block, align } as Block)} />}
        </div>
      );
    case "divider":
      return <p className="text-sm text-muted-foreground">Il divisore non ha campi da modificare.</p>;
    case "offer_box":
      return (
        <div className="space-y-3">
          <Label>Etichetta (opzionale)</Label>
          <Input value={block.badge ?? ""} onFocus={() => onFieldFocus("badge")} onChange={(e) => onChange({ ...block, badge: e.target.value })} />
          <Label>Titolo</Label>
          <Input value={block.title} onFocus={() => onFieldFocus("title")} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          <Label>Testo</Label>
          <Textarea rows={3} value={block.body} onFocus={() => onFieldFocus("body")} onChange={(e) => onChange({ ...block, body: e.target.value })} />
        </div>
      );
    case "two_columns":
      return (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Ogni colonna ha un solo elemento modificabile. Aggiungere o rimuovere elementi dentro le colonne non è
            ancora supportato — prossimamente.
          </p>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Colonna sinistra</p>
            {block.left.map((sub, i) => (
              <SimpleBlockFields
                key={sub.id}
                block={sub}
                onFieldFocus={onFieldFocus}
                onChange={(updated) => {
                  const left = [...block.left];
                  left[i] = updated;
                  onChange({ ...block, left });
                }}
              />
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Colonna destra</p>
            {block.right.map((sub, i) => (
              <SimpleBlockFields
                key={sub.id}
                block={sub}
                onFieldFocus={onFieldFocus}
                onChange={(updated) => {
                  const right = [...block.right];
                  right[i] = updated;
                  onChange({ ...block, right });
                }}
              />
            ))}
          </div>
        </div>
      );
    case "social_links":
      return (
        <div className="space-y-3">
          {block.links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={link.platform}
                placeholder="Piattaforma"
                onChange={(e) => {
                  const links = [...block.links];
                  links[i] = { ...link, platform: e.target.value };
                  onChange({ ...block, links });
                }}
              />
              <Input
                value={link.url}
                placeholder="URL"
                onChange={(e) => {
                  const links = [...block.links];
                  links[i] = { ...link, url: e.target.value };
                  onChange({ ...block, links });
                }}
              />
            </div>
          ))}
          <button
            type="button"
            className="text-xs underline"
            onClick={() => onChange({ ...block, links: [...block.links, { platform: "", url: "" }] })}
          >
            Aggiungi link
          </button>
        </div>
      );
    case "footer":
      return (
        <div className="space-y-3">
          <Label>Testo footer</Label>
          <Textarea rows={2} value={block.text} onFocus={() => onFieldFocus("text")} onChange={(e) => onChange({ ...block, text: e.target.value })} />
        </div>
      );
    case "unsubscribe_link":
      return (
        <div className="space-y-3">
          <Label>Testo del link</Label>
          <Input value={block.text} onFocus={() => onFieldFocus("text")} onChange={(e) => onChange({ ...block, text: e.target.value })} />
          <p className="text-xs text-muted-foreground">Questo blocco è obbligatorio e non può essere rimosso.</p>
        </div>
      );
  }
}
