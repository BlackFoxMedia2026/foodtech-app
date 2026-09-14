"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Lock, NotebookPen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAvvisi } from "@/components/ui/avvisi";
import { readApiError } from "@/lib/api-client";
import { dataLunga } from "@/lib/scheda-dipendente";
import type { VoceStorico } from "@/server/staff-storico";
import { Sezione } from "./sezione";
import type { NotaDTO, PersonaDTO } from "./tipi";

type Nota = Omit<NotaDTO, "createdAt"> & { createdAt: Date | string };

/**
 * Note interne e storico, fianco a fianco su schermo largo.
 *
 * Le **note** le scrive il locale su una persona e la persona non le vede:
 * il lucchetto accanto al titolo lo dice a chi scrive, mentre scrive. Non si
 * modificano: una riga firmata e datata che cambia sotto la firma non è più
 * una nota; si cancella e se ne scrive un'altra.
 *
 * Lo **storico** è il registro (`AuditLog`) letto per questa persona: chi ha
 * cambiato cosa, e quando. Serve come controllo, quindi non si tocca.
 */
export function NoteStorico({ persona, note, storico }: { persona: PersonaDTO; note: Nota[]; storico: VoceStorico[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <NoteInterne persona={persona} note={note} />
      <Storico storico={storico} />
    </div>
  );
}

function NoteInterne({ persona, note }: { persona: PersonaDTO; note: Nota[] }) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [bozza, setBozza] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [confermaElimina, setConfermaElimina] = useState<string | null>(null);

  async function aggiungi(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!bozza.trim()) return;
    setInCorso(true);
    setErrore(null);
    const res = await fetch(`/api/waiters/${persona.id}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: bozza.trim() }),
    });
    setInCorso(false);
    if (!res.ok) return setErrore(await readApiError(res, "Impossibile salvare la nota."));
    setBozza("");
    avvisi.mostra("Nota aggiunta");
    router.refresh();
  }

  async function elimina(id: string) {
    setInCorso(true);
    const res = await fetch(`/api/waiters/${persona.id}/notes/${id}`, { method: "DELETE" });
    setInCorso(false);
    setConfermaElimina(null);
    if (!res.ok) return avvisi.problema(await readApiError(res, "Impossibile eliminare la nota."));
    avvisi.mostra("Nota eliminata");
    router.refresh();
  }

  return (
    <Sezione
      id="note-interne"
      titolo="Note interne"
      icona={NotebookPen}
      descrizione={
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Visibili solo a chi gestisce lo staff. {persona.firstName} non le vede.
        </span>
      }
    >
      <form onSubmit={aggiungi} className="space-y-2">
        <Textarea
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          placeholder="Es. Ottimo nella gestione della sala durante gli eventi numerosi."
          className="min-h-[90px] text-base"
          maxLength={2000}
          aria-label="Nuova nota interna"
        />
        <div className="flex items-center justify-between gap-3">
          {errore ? <p className="text-sm text-destructive-soft">{errore}</p> : <span />}
          <Button type="submit" variant="accent" size="sm" disabled={inCorso || !bozza.trim()}>
            {inCorso ? "Salvo…" : "Aggiungi nota"}
          </Button>
        </div>
      </form>

      {note.length === 0 ? (
        <p className="mt-6 text-base text-muted-foreground">Nessuna nota. La prima è la più utile: com&apos;è andato il periodo di prova.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border/60">
          {note.map((n) => (
            <li key={n.id} className="py-4">
              <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">{n.body}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {n.authorLabel} · {dataLunga(n.createdAt)},{" "}
                  {new Date(n.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {confermaElimina === n.id ? (
                  <span className="flex items-center gap-2">
                    <button type="button" onClick={() => elimina(n.id)} disabled={inCorso} className="text-destructive-soft hover:underline">
                      Elimina
                    </button>
                    <button type="button" onClick={() => setConfermaElimina(null)} className="hover:underline">
                      Annulla
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfermaElimina(n.id)} className="inline-flex items-center gap-1 opacity-60 transition hover:opacity-100" aria-label="Elimina nota">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sezione>
  );
}

function Storico({ storico }: { storico: VoceStorico[] }) {
  return (
    <Sezione id="storico" titolo="Storico" icona={History} descrizione="Le modifiche alla scheda, dal registro delle azioni.">
      {storico.length === 0 ? (
        <p className="text-base text-muted-foreground">Nessuna modifica registrata.</p>
      ) : (
        <ol className="relative ml-2 border-l border-border/70">
          {storico.map((v) => (
            <li key={v.id} className="relative pb-6 pl-6 last:pb-0">
              <span aria-hidden="true" className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full border border-background bg-accent-strong" />
              <p className="text-sm text-muted-foreground">
                {dataLunga(v.quando)}
                <span className="ml-2 tabular-nums text-tertiary-foreground">
                  {new Date(v.quando).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
              <p className="mt-0.5 text-base font-medium text-foreground md:text-lg">{v.titolo}</p>
              {v.dettaglio && <p className="mt-0.5 whitespace-pre-line text-sm text-foreground/80">{v.dettaglio}</p>}
              {v.autore && <p className="mt-1 text-xs text-tertiary-foreground">{v.autore}</p>}
            </li>
          ))}
        </ol>
      )}
    </Sezione>
  );
}
