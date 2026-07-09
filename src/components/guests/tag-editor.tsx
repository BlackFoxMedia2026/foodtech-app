"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const SUGGESTED_TAGS = [
  "VIP",
  "Vegetariano",
  "Allergia glutine",
  "Alto spendente",
  "Cliente inattivo",
  "Compleanno vicino",
  "Ama terrazza",
  "Preferisce venerdì sera",
];

export function TagEditor({ guestId, tags }: { guestId: string; tags: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");

  async function saveTags(next: string[]) {
    setPending(true);
    await fetch(`/api/guests/${guestId}`, {
      method: "PATCH",
      body: JSON.stringify({ tags: next }),
      headers: { "content-type": "application/json" },
    });
    setPending(false);
    router.refresh();
  }

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    const exists = tags.some((t) => t.toLowerCase() === value.toLowerCase());
    if (exists) return;
    setDraft("");
    saveTags([...tags, value]);
  }

  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
  }

  const suggestions = SUGGESTED_TAGS.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((t) => (
          <Badge key={t} tone="neutral" className="gap-1">
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              disabled={pending}
              aria-label={`Rimuovi tag ${t}`}
              className="rounded-full opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(draft);
            }
          }}
          placeholder="Aggiungi tag…"
          disabled={pending}
          className="h-7 w-36 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !draft.trim()}
          onClick={() => addTag(draft)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Suggeriti:</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => addTag(s)}
              className="rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-secondary hover:text-foreground"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
