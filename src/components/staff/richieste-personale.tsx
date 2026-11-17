"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { NOME_TIPO_RICHIESTA, TIPI_RICHIESTA } from "@/lib/richieste-personale";

/**
 * Ferie, permessi e cambi turno: chiederli e deciderli.
 *
 * ## Perché una schermata sola per le due cose
 *
 * Perché in un ristorante da dieci persone chi chiede e chi decide sono spesso
 * nella stessa stanza: la ferie si chiede a voce e qualcuno la segna. Due
 * schermate separate vorrebbero dire che il responsabile deve aprirne una per
 * scrivere quello che gli hanno detto e un'altra per approvarlo.
 *
 * ## Le decisioni non si sovrascrivono
 *
 * Una richiesta approvata non si modifica più: la si ritira. Se si potesse
 * riscrivere dopo, «te l'avevo chiesto» e «non me l'hai approvato»
 * diventerebbero due verità diverse sullo stesso foglio — ed è esattamente il
 * problema che questa schermata esiste per chiudere.
 */

type Richiesta = {
  id: string;
  tipoNome: string;
  statoNome: string;
  dal: string;
  al: string;
  motivo: string | null;
  persona: { id: string; nome: string } | null;
};

export function RichiestePersonale({
  richieste,
  persone,
  canManage,
  nascoste = 0,
}: {
  richieste: Richiesta[];
  persone: { id: string; nome: string }[];
  canManage: boolean;
  /** Le richieste che ci sono ma che i filtri della colonna tengono fuori:
   * «nessuna richiesta» sarebbe falso, e si direbbe proprio quando ce ne sono. */
  nascoste?: number;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [apri, setApri] = useState(false);

  async function decidi(id: string, stato: "APPROVED" | "REJECTED" | "WITHDRAWN") {
    setInCorso(id);
    setErrore(null);
    try {
      const res = await fetch(`/api/staff-richieste/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stato }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non ci siamo riusciti."));
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(null);
    }
  }

  async function crea(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso("nuova");
    setErrore(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/staff-richieste", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          waiterId: String(fd.get("waiterId")),
          type: String(fd.get("type")),
          dal: String(fd.get("dal")),
          /* Vuoto significa «un giorno solo», non «fino a sempre»: il server
             lo interpreta così, e qui non si manda una stringa vuota. */
          ...(fd.get("al") ? { al: String(fd.get("al")) } : {}),
          ...(fd.get("motivo") ? { motivo: String(fd.get("motivo")) } : {}),
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Non ci siamo riusciti."));
      setApri(false);
      router.refresh();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Non ci siamo riusciti.");
    } finally {
      setInCorso(null);
    }
  }

  const giorno = (iso: string) =>
    new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  return (
    <section className="riquadro fill flex min-h-0 flex-col overflow-hidden bg-card-sunken">
      <header className="fissa flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-veil-5 px-4 py-3">
        <div>
          <h2 className="text-display text-lg">Richieste da decidere</h2>
          <p className="t-nota text-[13px] sm:text-xs">
            Ferie, permessi e cambi turno. Le più vecchie in cima: aspettano da
            più tempo.
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            variant={apri ? "outline" : "default"}
            className="h-11 text-sm sm:h-9 sm:text-xs"
            onClick={() => setApri((v) => !v)}
          >
            {apri ? "Annulla" : "Segna una richiesta"}
          </Button>
        )}
      </header>

      <div className="fill-scroll flex flex-col gap-3 p-3">
      {errore && (
        <p role="alert" className="text-sm text-destructive">
          {errore}
        </p>
      )}

      {apri && canManage && (
        <form onSubmit={crea} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="waiterId">Chi</Label>
            <select
              id="waiterId"
              name="waiterId"
              required
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-auto md:py-2 md:text-sm"
            >
              {persone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="type">Cosa chiede</Label>
            <select
              id="type"
              name="type"
              required
              className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-auto md:py-2 md:text-sm"
            >
              {TIPI_RICHIESTA.map((t) => (
                <option key={t} value={t}>
                  {NOME_TIPO_RICHIESTA[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="dal">Dal giorno</Label>
            <Input id="dal" name="dal" type="date" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="al">Al giorno</Label>
            <Input id="al" name="al" type="date" className="mt-1" />
            <p className="t-nota mt-1">Vuoto = un giorno solo.</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="motivo">Motivo (facoltativo)</Label>
            <Input id="motivo" name="motivo" maxLength={1000} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" className="h-11 w-full text-sm sm:h-9 sm:w-auto sm:text-xs" disabled={inCorso === "nuova"}>
              Segna
            </Button>
          </div>
        </form>
      )}

      {richieste.length === 0 ? (
        <div className="grid flex-1 place-content-center gap-1 px-6 py-12 text-center">
          <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-veil-10">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
          {nascoste > 0 ? (
            <>
              <p className="text-sm font-medium">Nessuna richiesta con questi filtri</p>
              <p className="t-nota text-[13px] sm:text-xs">
                {nascoste === 1 ? "Ce n'è una" : `Ce ne sono ${nascoste}`} di persone che i filtri
                tengono fuori.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Nessuna richiesta in attesa</p>
              <p className="t-nota text-[13px] sm:text-xs">
                Quelle decise restano nella scheda della persona.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {richieste.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm">
                  <strong>{r.persona?.nome ?? "Senza nome"}</strong> · {r.tipoNome}
                </p>
                <p className="t-nota text-[13px] sm:text-xs">
                  {r.dal === r.al ? giorno(r.dal) : `dal ${giorno(r.dal)} al ${giorno(r.al)}`}
                  {r.motivo ? ` · ${r.motivo}` : ""}
                </p>
              </div>
              {canManage && (
                // Sul telefono i due esiti prendono la riga, metà ciascuno: è
                // la decisione per cui si apre la pagina.
                <div className="flex w-full items-center gap-1.5 sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-11 flex-1 text-sm sm:h-9 sm:flex-none sm:text-xs"
                    onClick={() => void decidi(r.id, "APPROVED")}
                    disabled={inCorso === r.id}
                  >
                    <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                    Approva
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-11 flex-1 text-sm sm:h-9 sm:flex-none sm:text-xs"
                    onClick={() => void decidi(r.id, "REJECTED")}
                    disabled={inCorso === r.id}
                  >
                    <X className="mr-1 h-4 w-4" aria-hidden="true" />
                    Rifiuta
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}
