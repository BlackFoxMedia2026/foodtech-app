"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvvisi } from "@/components/ui/avvisi";
import { cn } from "@/lib/utils";
import { readApiError } from "@/lib/api-client";

/**
 * **Che cosa corrisponde a cosa**, letto dal lato del ristorante.
 *
 * ```
 * Foodtech          Cassa in Cloud
 * B1                Tavolo B1       ✓
 * Terrazza 1        Non collegato   [Collega ▾]
 * ```
 *
 * L'elenco parte dai tavoli e dai piatti **di Foodtech**, perché sono quelli
 * che il ristoratore conosce; a destra il nome con cui li chiama la cassa.
 * Nessun identificativo del fornitore: la rotta non lo manda nemmeno.
 * Un collegamento deciso qui non lo cambia più nessuna sincronizzazione.
 */

type Riga = { id: string; tipo: string; esterno: string; internalId: string | null; interno: string | null; manuale: boolean };
type Interno = { id: string; etichetta: string };

const NESSUNO = "__nessuno";

export function CollegamentiElementi({
  slug,
  fornitore,
  tipi,
  puo,
}: {
  slug: string;
  fornitore: string;
  tipi: { tipo: string; etichetta: string; daCollegare: number }[];
  puo: boolean;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [tipo, setTipo] = useState(tipi[0]!.tipo);
  const [righe, setRighe] = useState<Riga[] | null>(null);
  const [interni, setInterni] = useState<Interno[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [soloDaCollegare, setSoloDaCollegare] = useState(false);

  async function carica(t: string) {
    setRighe(null);
    const res = await fetch(`/api/integrations/${slug}/mappature?tipo=${t}`);
    if (!res.ok) {
      avvisi.problema(await readApiError(res, "Non riusciamo a leggere i collegamenti."));
      setRighe([]);
      return;
    }
    const j = (await res.json()) as { righe: Riga[]; interni: Interno[] };
    setRighe(j.righe);
    setInterni(j.interni);
  }

  useEffect(() => {
    void carica(tipo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  async function abbina(mappingId: string, internalId: string | null) {
    const res = await fetch(`/api/integrations/${slug}/mappature`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappingId, internalId }),
    });
    if (!res.ok) throw new Error(await readApiError(res, "Collegamento non salvato."));
  }

  async function collega(interno: Interno, rigaId: string | null, prima: Riga | null) {
    if (rigaId === (prima?.id ?? null)) return;
    setSalvando(interno.id);
    try {
      // Un elemento di Foodtech corrisponde a una cosa sola della cassa: prima
      // si libera quella di prima, poi si collega la nuova.
      if (prima) await abbina(prima.id, null);
      if (rigaId) await abbina(rigaId, interno.id);
      await carica(tipo);
      router.refresh();
    } catch (e) {
      avvisi.problema(e instanceof Error ? e.message : "Collegamento non salvato.");
    } finally {
      setSalvando(null);
    }
  }

  const perInterno = new Map((righe ?? []).filter((r) => r.internalId).map((r) => [r.internalId!, r]));
  const libere = (righe ?? []).filter((r) => !r.internalId);
  const elenco = soloDaCollegare ? interni.filter((x) => !perInterno.has(x.id)) : interni;

  return (
    <section className="riquadro comodo space-y-3 bg-card/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-titolo-scheda">Collegamenti</h2>
        <div className="flex gap-1.5" role="tablist" aria-label="Che cosa collegare">
          {tipi.map((t) => (
            <button
              key={t.tipo}
              type="button"
              role="tab"
              aria-selected={tipo === t.tipo}
              onClick={() => setTipo(t.tipo)}
              className={cn(
                "tocco-comodo inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                tipo === t.tipo ? "segmento-scelto border-accent/60 bg-accent/50 text-cream" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t.etichetta}
              {t.daCollegare > 0 && <span className="tabular-nums opacity-80">{t.daCollegare}</span>}
            </button>
          ))}
        </div>
      </div>

      {!righe ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carichiamo…
        </p>
      ) : interni.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          In Foodtech non c&apos;è ancora niente da collegare. Crea {tipo === "TABLE" ? "i tavoli in Sala" : "il menu in Carta"}, oppure
          importali dalla cassa.
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={soloDaCollegare} onChange={(e) => setSoloDaCollegare(e.target.checked)} className="accent-accent" />
            Solo quelli da collegare
          </label>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 border-b border-border bg-card/60 px-3.5 py-2 t-etichetta">
              <span>Foodtech</span>
              <span>{fornitore}</span>
            </div>
            <ul className="max-h-96 divide-y divide-border/60 overflow-y-auto">
              {elenco.map((x) => {
                const r = perInterno.get(x.id) ?? null;
                return (
                  <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 px-3.5 py-2 text-sm">
                    <span className="truncate font-medium">{x.etichetta}</span>
                    <div className="flex min-w-0 items-center gap-2">
                      {puo ? (
                        <Select
                          value={r?.id ?? NESSUNO}
                          disabled={salvando === x.id}
                          onValueChange={(v) => void collega(x, v === NESSUNO ? null : v, r)}
                        >
                          <SelectTrigger className={cn("h-9 min-w-0 flex-1", !r && "text-muted-foreground")} aria-label={`Collega ${x.etichetta}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NESSUNO}>Non collegato</SelectItem>
                            {r && <SelectItem value={r.id}>{r.esterno}</SelectItem>}
                            {libere.map((l) => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.esterno}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className={cn("truncate", !r && "text-muted-foreground")}>{r?.esterno ?? "Non collegato"}</span>
                      )}
                      {salvando === x.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                      ) : r ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-sage-strong" aria-label="collegato" />
                      ) : (
                        <span className="h-4 w-4 shrink-0" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {libere.length > 0 && (
            <p className="t-nota">
              {libere.length} {libere.length === 1 ? "elemento" : "elementi"} di {fornitore} non {libere.length === 1 ? "è collegato" : "sono collegati"} a niente in Foodtech.
            </p>
          )}
        </>
      )}
    </section>
  );
}
