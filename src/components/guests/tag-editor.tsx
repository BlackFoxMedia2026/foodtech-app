"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import { Etichetta } from "@/components/ui/etichetta";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

/**
 * I tag della scheda: **un solo comando per aggiungerne uno**.
 *
 * ## Cos'era
 *
 * Tre controlli per un gesto: un campo di testo sempre aperto («Aggiungi
 * tag…»), un pulsante «+» accanto che faceva la stessa identica cosa del
 * tasto Invio, e una riga di suggerimenti che compariva sotto al fuoco
 * spostando tutto quello che aveva intorno. In una riga condivisa con email,
 * telefono e consenso, un campo di input sempre visibile è l'elemento più
 * pesante di tutta la testata — e serve per un'azione che si fa una volta al
 * mese.
 *
 * ## Com'è adesso
 *
 * I tag esistenti sono pillole, e in coda c'è **una** pillola tratteggiata:
 * «Aggiungi tag». Il tratteggio dice che è un posto vuoto, non un tag; la
 * stessa altezza degli altri tiene la riga dritta. Al clic si apre un
 * popover, che è dove stanno il campo e i suggerimenti: la riga non si muove
 * più, e i suggerimenti hanno finalmente lo spazio per essere otto senza
 * mangiarsi una riga della pagina.
 */
export function TagEditor({ guestId, tags }: { guestId: string; tags: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [aperto, setAperto] = useState(false);
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
    setDraft("");
    setAperto(false);
    if (exists) return;
    saveTags([...tags, value]);
  }

  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
  }

  const q = draft.trim().toLowerCase();
  const suggestions = SUGGESTED_TAGS.filter(
    (s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()) && (!q || s.toLowerCase().includes(q)),
  );
  /* «Crea "x"» si offre solo se `x` non è già uno dei suggerimenti in elenco:
     altrimenti la stessa parola comparirebbe due volte, una come voce e una
     come creazione, e sarebbero lo stesso clic. */
  const nuovo =
    q.length > 0 &&
    !SUGGESTED_TAGS.some((s) => s.toLowerCase() === q) &&
    !tags.some((t) => t.toLowerCase() === q);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Questi li ha scritti una persona del locale: pillola piena
          (`linguaggio="manuale"`), diversa dal bordo vuoto dei tag che
          calcoliamo noi. L'altezza è fissa a 28 px — la stessa del comando in
          coda — così la riga ha una linea di base sola. */}
      {tags.map((t) => (
        <Etichetta
          key={t}
          linguaggio="manuale"
          className="h-7 gap-1.5 px-3 transition-colors hover:bg-secondary/70"
        >
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            disabled={pending}
            aria-label={`Rimuovi tag ${t}`}
            title={`Rimuovi «${t}»`}
            className="-mr-1 grid h-4 w-4 place-items-center rounded-full text-tertiary-foreground transition-colors hover:bg-black/20 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </Etichetta>
      ))}

      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:border-solid hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 data-[state=open]:border-solid data-[state=open]:bg-secondary data-[state=open]:text-foreground"
          >
            <Plus className="h-3 w-3" aria-hidden="true" /> Aggiungi tag
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" sideOffset={8} className="w-72 p-3">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(draft);
              }
            }}
            placeholder="Cerca o scrivi un tag…"
            disabled={pending}
            className="h-9"
          />

          <div className="mt-3 max-h-56 overflow-y-auto">
            {nuovo && (
              <Voce onClick={() => addTag(draft)} disabled={pending}>
                <Plus className="h-3.5 w-3.5 shrink-0 text-accent-strong" aria-hidden="true" />
                <span className="truncate">
                  Crea <span className="font-medium text-foreground">{draft.trim()}</span>
                </span>
              </Voce>
            )}

            {suggestions.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-2 text-xs text-tertiary-foreground">Suggeriti</p>
                {suggestions.map((s) => (
                  <Voce key={s} onClick={() => addTag(s)} disabled={pending}>
                    <TagIcon className="h-3.5 w-3.5 shrink-0 text-tertiary-foreground" aria-hidden="true" />
                    <span className="truncate">{s}</span>
                  </Voce>
                ))}
              </>
            )}

            {!nuovo && suggestions.length === 0 && (
              <p className="px-2 py-3 text-xs text-tertiary-foreground">
                {q ? "Questo tag c'è già." : "Sono stati usati tutti i suggerimenti."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Voce({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-popover-foreground/90 transition-colors duration-150 hover:bg-black/15 hover:text-popover-foreground disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}
