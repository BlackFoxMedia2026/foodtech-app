"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, FilePen, Trash2 } from "lucide-react";
import { SOTTOPASSI } from "@/components/staff/nuova/passi";
import type { BozzaStaff } from "@/server/staff-bozze";

const NOME_PASSO: Record<string, string> = Object.fromEntries(
  [...SOTTOPASSI.personali, ...SOTTOPASSI.lavoro].map((p) => [p.chiave, p.label]),
);

function quando(iso: string) {
  const d = new Date(iso);
  const minuti = Math.round((Date.now() - d.getTime()) / 60000);
  if (minuti < 1) return "adesso";
  if (minuti < 60) return `${minuti} min fa`;
  const oggi = new Date();
  if (d.toDateString() === oggi.toDateString()) {
    return `oggi alle ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

/**
 * Le registrazioni salvate a metà con «Salva», in cima a «Nuova persona»:
 * chi riapre la pagina ritrova quella lasciata ieri invece di un modulo
 * vuoto. «Riprendi» riporta al passo in cui ci si era fermati.
 */
export function BozzeInSospeso({ bozze }: { bozze: BozzaStaff[] }) {
  const router = useRouter();
  const [nascoste, setNascoste] = useState<string[]>([]);
  const [daConfermare, setDaConfermare] = useState<string | null>(null);
  const visibili = bozze.filter((b) => !nascoste.includes(b.id));
  if (!visibili.length) return null;

  async function elimina(id: string) {
    setNascoste((n) => [...n, id]);
    setDaConfermare(null);
    const res = await fetch(`/api/staff/bozze/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) setNascoste((n) => n.filter((x) => x !== id));
    else router.refresh();
  }

  return (
    <section aria-labelledby="bozze-titolo" className="mb-4 rounded-2xl border border-border/60 bg-card/70 p-3">
      <h2 id="bozze-titolo" className="t-etichetta px-1 pb-2 text-muted-foreground">
        {visibili.length === 1 ? "Una registrazione in sospeso" : `${visibili.length} registrazioni in sospeso`}
      </h2>
      <ul className="space-y-1.5">
        {visibili.map((b) => (
          <li key={b.id} className="flex items-center gap-3 rounded-xl bg-veil-5 px-3 py-2">
            <FilePen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{b.nome || "Senza nome"}</p>
              <p className="truncate text-xs text-muted-foreground">
                Ferma a {NOME_PASSO[b.passo] ?? b.passo} · {quando(b.aggiornata)}
              </p>
            </div>
            {daConfermare === b.id ? (
              <button
                type="button"
                onClick={() => void elimina(b.id)}
                onBlur={() => setDaConfermare(null)}
                autoFocus
                className="h-9 rounded-full px-3 text-sm font-medium text-destructive-soft hover:bg-destructive/10"
              >
                Elimina
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDaConfermare(b.id)}
                aria-label={`Elimina la registrazione di ${b.nome || "persona senza nome"}`}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-veil-10 hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <Link
              href={`/staff/nuova?bozza=${b.id}`}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-border/70 px-3 text-sm font-medium hover:bg-veil-10"
            >
              Riprendi <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
