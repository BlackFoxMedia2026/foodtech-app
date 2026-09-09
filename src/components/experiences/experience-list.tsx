"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { readApiError } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { ExperienceDialog } from "@/components/experiences/experience-dialog";
import type { ExperienceView } from "@/server/experiences";

/**
 * Il programma del locale.
 *
 * Prima c'era la stessa lista con un pulsante «Nuova esperienza» che non
 * apriva niente, e una barra di riempimento sui biglietti venduti — sempre a
 * zero, perché nessuno può venderli da qui. Le due cose insieme facevano
 * sembrare finito quello che non era nemmeno iniziato.
 *
 * Ora si creano, si modificano e si pubblicano; i biglietti si comprano dove
 * li vende il locale, col suo link, e questa pagina lo dice invece di
 * mostrare un contatore vuoto.
 */
export function ExperienceList({
  items,
  currency,
  canEdit,
}: {
  items: ExperienceView[];
  currency: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [nuova, setNuova] = useState(false);
  const [inModifica, setInModifica] = useState<ExperienceView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function chiama(id: string, init: RequestInit, fallback: string) {
    setBusy(id);
    setError(null);
    const res = await fetch(`/api/experiences/${id}`, init);
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, fallback));
      return;
    }
    router.refresh();
  }

  const pubblica = (e: ExperienceView, published: boolean) =>
    chiama(
      e.id,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ published }),
      },
      "Non siamo riusciti a cambiare lo stato.",
    );

  const elimina = (e: ExperienceView) =>
    chiama(e.id, { method: "DELETE" }, "Non siamo riusciti a eliminare l'esperienza.");

  return (
    <>
      <header className="fissa flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Programma</p>
          <h1 className="text-display text-3xl">Esperienze</h1>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "Nessuna esperienza in calendario"
              : `${items.length} ${items.length === 1 ? "esperienza" : "esperienze"} in calendario`}
          </p>
        </div>
        {canEdit && (
          <Button variant="accent" onClick={() => setNuova(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nuova esperienza
          </Button>
        )}
      </header>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <div className="fill mt-6">
          <EmptyState
            icon={Sparkles}
            title="Nessuna esperienza"
            action={
              canEdit ? (
                <Button variant="accent" onClick={() => setNuova(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Crea la prima
                </Button>
              ) : undefined
            }
          >
            Una cena a tema, una degustazione, una serata con il produttore: qui si tiene il programma, e si
            pubblica quando è pronto.
          </EmptyState>
        </div>
      ) : (
        <div className="fill-scroll mt-6 grid gap-4 pr-0.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((e) => (
            <Card key={e.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-accent">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    {e.published ? "Pubblicata" : "Bozza"}
                  </div>
                  {canEdit && (
                    <label
                      htmlFor={`pub-${e.id}`}
                      className="flex min-h-[44px] cursor-pointer items-center gap-2 px-1"
                      title={e.published ? "Riporta in bozza" : "Pubblica"}
                    >
                      <Switch
                        id={`pub-${e.id}`}
                        checked={e.published}
                        disabled={busy === e.id}
                        aria-label={e.published ? `Riporta in bozza ${e.title}` : `Pubblica ${e.title}`}
                        onCheckedChange={(v) => void pubblica(e, v)}
                      />
                    </label>
                  )}
                </div>
                <CardTitle>{e.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{formatDateTime(e.startsAt)}</p>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                {e.description && <p className="text-muted-foreground">{e.description}</p>}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="gold">{formatCurrency(e.priceCents, currency)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {e.capacity} {e.capacity === 1 ? "posto" : "posti"}
                  </span>
                  {e.ticketsSold > 0 && (
                    <span className="text-xs text-muted-foreground">· {e.ticketsSold} venduti</span>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {e.ticketUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer">
                        Biglietti <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-tertiary-foreground">Nessun link ai biglietti</span>
                  )}

                  {canEdit && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setInModifica(e)} disabled={busy === e.id}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Modifica
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void elimina(e)}
                        disabled={busy === e.id}
                        aria-label={`Elimina ${e.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-tertiary-foreground">
        I biglietti non si vendono da Tavolo: servono i pagamenti, che arriveranno con le caparre. Nel frattempo
        il link porta dove li vendi tu.
      </p>

      {nuova && <ExperienceDialog open onOpenChange={(v) => !v && setNuova(false)} />}
      {inModifica && (
        <ExperienceDialog
          open
          onOpenChange={(v) => !v && setInModifica(null)}
          experience={inModifica}
        />
      )}
    </>
  );
}
