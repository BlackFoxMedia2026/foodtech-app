"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import { CARATTERISTICHE_SUGGERITE } from "@/lib/scheda-dipendente";
import { cn } from "@/lib/utils";
import { Sezione } from "./sezione";

/**
 * Le caratteristiche: tag liberi sulla persona — «Sommelier», «Inglese»,
 * «Apertura locale», «Auto propria».
 *
 * Diverse dalle competenze operative (`capabilities`), che dicono a cosa si
 * può essere **assegnati** in sala e sono un vocabolario chiuso. Queste sono
 * il vocabolario del locale, e domani serviranno a suggerire chi mettere in
 * turno: «serve qualcuno che apra e parli francese».
 *
 * Si salvano a ogni gesto, come i tag dell'ospite: un tag è un clic, non un
 * modulo.
 */
export function Caratteristiche({ waiterId, skills, canEdit }: { waiterId: string; skills: string[]; canEdit: boolean }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [bozza, setBozza] = useState("");
  const [inCorso, setInCorso] = useState(false);

  async function salva(next: string[]) {
    setInCorso(true);
    const res = await fetch(`/api/waiters/${waiterId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skills: next }),
    });
    setInCorso(false);
    if (!res.ok) {
      avvisi.problema(await readApiError(res, "Impossibile aggiornare le caratteristiche."));
      return;
    }
    router.refresh();
  }

  function aggiungi(raw: string) {
    const v = raw.trim();
    if (!v) return;
    if (skills.some((s) => s.toLowerCase() === v.toLowerCase())) {
      setBozza("");
      return;
    }
    setBozza("");
    salva([...skills, v]);
  }

  const suggerimenti = CARATTERISTICHE_SUGGERITE.filter((s) => !skills.some((t) => t.toLowerCase() === s.toLowerCase()));

  return (
    <Sezione
      id="caratteristiche"
      titolo="Caratteristiche"
      icona={Sparkles}
      descrizione="Lingue, abilitazioni e particolarità utili per comporre i turni."
    >
      <div className="flex flex-wrap items-center gap-2">
        {skills.length === 0 && !canEdit && <p className="text-base text-tertiary-foreground">Nessuna caratteristica indicata.</p>}
        {skills.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-secondary px-3 py-1.5 text-sm font-medium text-foreground">
            {s}
            {canEdit && (
              <button
                type="button"
                onClick={() => salva(skills.filter((t) => t !== s))}
                disabled={inCorso}
                aria-label={`Rimuovi ${s}`}
                className="rounded-full opacity-60 transition hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              aggiungi(bozza);
            }}
            className="flex items-center gap-2"
          >
            <Input
              value={bozza}
              onChange={(e) => setBozza(e.target.value)}
              placeholder="Aggiungi una caratteristica…"
              className="h-9 w-56"
              disabled={inCorso}
              aria-label="Nuova caratteristica"
            />
            <button
              type="submit"
              disabled={inCorso || !bozza.trim()}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-surface-brown/40 px-3 text-sm font-medium transition hover:bg-surface-brown/15 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi
            </button>
          </form>
        )}
      </div>

      {canEdit && suggerimenti.length > 0 && (
        <div className="mt-5">
          <p className="t-etichetta mb-2">Suggerimenti</p>
          <div className="flex flex-wrap gap-2">
            {suggerimenti.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => aggiungi(s)}
                disabled={inCorso}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition",
                  "hover:border-accent/50 hover:text-foreground disabled:opacity-50",
                )}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </Sezione>
  );
}
