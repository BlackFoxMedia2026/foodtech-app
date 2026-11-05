"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Car,
  Crown,
  DoorClosed,
  DoorOpen,
  Flame,
  GraduationCap,
  HeartPulse,
  Languages,
  Martini,
  Plus,
  Sparkles,
  Wallet,
  Wine,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
 *
 * ## Revisione del 4 novembre 2026
 *
 * Erano pillole grigie tutte uguali, un campo di testo staccato e una fila di
 * suggerimenti tratteggiati: una nuvola di parole. Adesso ogni caratteristica
 * ha **la sua icona** (le lingue il fumetto, le abilitazioni la croce o la
 * fiamma, i compiti la chiave o il portafoglio), e una lingua si distingue
 * da una mansione senza leggerla. Il campo per aggiungere è una pillola sola
 * col suo pulsante, e i suggerimenti portano la stessa icona che avranno una
 * volta scelti.
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
    setBozza("");
    if (skills.some((s) => s.toLowerCase() === v.toLowerCase())) return;
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
      <div className="space-y-4">
        {skills.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            Nessuna caratteristica indicata{canEdit ? ": scegline una fra i suggerimenti o scrivila." : "."}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {skills.map((s) => {
              const { icona: Icona, famiglia } = riconosci(s);
              return (
                <li
                  key={s}
                  className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card-sunken/50 py-1.5 pl-1.5 pr-2 transition-colors hover:border-border-strong"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-cream shadow-[0_4px_10px_rgba(16,43,34,0.16)]",
                      famiglia === "lingua"
                        ? "bg-[linear-gradient(160deg,#B8893A_0%,#8A6424_100%)]"
                        : "bg-[linear-gradient(160deg,#1C4A3A_0%,#102B22_100%)]",
                    )}
                  >
                    <Icona className="h-4 w-4" />
                  </span>
                  <span className="break-words text-[15px] font-medium leading-snug">{s}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => salva(skills.filter((t) => t !== s))}
                      disabled={inCorso}
                      aria-label={`Rimuovi ${s}`}
                      title={`Rimuovi ${s}`}
                      className="grid h-6 w-6 place-items-center rounded-full text-tertiary-foreground transition hover:bg-veil-6 hover:text-foreground disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && (
          <div className="space-y-3 border-t border-border/60 pt-4">
            {/* Una pillola sola: il «+» davanti, il pulsante dentro. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                aggiungi(bozza);
              }}
              className="flex h-11 w-full max-w-md items-center gap-2 rounded-full border border-border bg-card pl-4 pr-1 focus-within:border-border-strong focus-within:ring-2 focus-within:ring-ring/30"
            >
              <Plus className="h-4 w-4 shrink-0 text-tertiary-foreground" aria-hidden="true" />
              <input
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                placeholder="Scrivi una caratteristica"
                disabled={inCorso}
                aria-label="Nuova caratteristica"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-tertiary-foreground"
              />
              <button
                type="submit"
                disabled={inCorso || !bozza.trim()}
                className="inline-flex h-9 shrink-0 items-center rounded-full bg-cta px-4 text-sm font-medium text-cta-ink transition hover:brightness-105 disabled:opacity-40"
              >
                Aggiungi
              </button>
            </form>

            {suggerimenti.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-muted-foreground">Suggeriti</span>
                {suggerimenti.map((s) => {
                  const { icona: Icona } = riconosci(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => aggiungi(s)}
                      disabled={inCorso}
                      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-accent/60 hover:bg-accent/10 hover:text-foreground disabled:opacity-50"
                    >
                      <Icona className="h-3.5 w-3.5 text-accent-strong" aria-hidden="true" /> {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Sezione>
  );
}

/* -------------------------------------------------------------------------- */
/*  L'icona di una caratteristica                                             */
/* -------------------------------------------------------------------------- */

const LINGUE = /ingles|frances|tedesc|spagnol|portoghes|russ|cines|giappones|arab|olandes|ucrain|rumen|albanes|polacc|lingu/i;

const PER_PAROLA: [RegExp, LucideIcon][] = [
  [/responsabil|capo|supervis/i, Crown],
  [/sommelier|vin/i, Wine],
  [/cocktail|bar|mixol/i, Martini],
  [/cassa|pagament|contant/i, Wallet],
  [/apertur|apre/i, DoorOpen],
  [/chiusur|chiude/i, DoorClosed],
  [/soccors|defibrill|blsd/i, HeartPulse],
  [/antincend|incend/i, Flame],
  [/format|insegn|tutor/i, GraduationCap],
  [/auto|patente|guida|moto/i, Car],
];

/**
 * Dal testo libero all'icona: le caratteristiche sono scritte a mano, quindi
 * si riconoscono per parola. Quello che non si riconosce prende la scintilla,
 * che è l'icona della sezione.
 */
function riconosci(testo: string): { icona: LucideIcon; famiglia: "lingua" | "altro" } {
  if (LINGUE.test(testo)) return { icona: Languages, famiglia: "lingua" };
  const trovata = PER_PAROLA.find(([re]) => re.test(testo));
  return { icona: trovata ? trovata[1] : Sparkles, famiglia: "altro" };
}
