"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
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
}: {
  richieste: Richiesta[];
  persone: { id: string; nome: string }[];
  canManage: boolean;
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
    <section className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-display text-lg">Richieste da decidere</h2>
          <p className="t-nota">
            Ferie, permessi e cambi turno. Le più vecchie in cima: aspettano da
            più tempo.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant={apri ? "outline" : "default"} onClick={() => setApri((v) => !v)}>
            {apri ? "Annulla" : "Segna una richiesta"}
          </Button>
        )}
      </header>

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
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <Button type="submit" size="sm" disabled={inCorso === "nuova"}>
              Segna
            </Button>
          </div>
        </form>
      )}

      {richieste.length === 0 ? (
        <p className="t-nota">
          Nessuna richiesta in attesa. Quelle decise restano nella scheda della
          persona.
        </p>
      ) : (
        <ul className="space-y-2">
          {richieste.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
            >
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm">
                  <strong>{r.persona?.nome ?? "Senza nome"}</strong> · {r.tipoNome}
                </p>
                <p className="t-nota">
                  {r.dal === r.al ? giorno(r.dal) : `dal ${giorno(r.dal)} al ${giorno(r.al)}`}
                  {r.motivo ? ` · ${r.motivo}` : ""}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void decidi(r.id, "APPROVED")}
                    disabled={inCorso === r.id}
                  >
                    <Check className="mr-1 h-4 w-4" aria-hidden="true" />
                    Approva
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
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
    </section>
  );
}
