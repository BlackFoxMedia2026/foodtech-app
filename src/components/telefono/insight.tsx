"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, NotebookPen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api-client";
import { useAvvisi } from "@/components/ui/avvisi";
import {
  DOVE_FINISCE,
  NOME_TIPO,
  TIPI_INSIGHT,
  type TipoInsight,
} from "@/lib/voice-insight";

/**
 * Le tre frasi che cambiano una cena, e che non arrivano mai nella scheda.
 *
 * «Mia moglie è celiaca.» «Il tavolo in fondo, quello vicino alla finestra
 * no.» «Chiamo per mio padre, ha 88 anni.» Dette al telefono a chi risponde, e
 * perse — perché per scriverle bisogna uscire dalla chiamata, cercare la
 * scheda, aprire il campo giusto.
 *
 * Qui si scrivono in due tocchi e diventano una **proposta**: nella scheda del
 * cliente non entra niente che nessuno abbia guardato. Il secondo gesto costa
 * un tocco, e vale oggi — un nome frainteso, una nota sulla scheda sbagliata —
 * e varrà di più domani, quando le proporrà un risponditore che ha *sentito*
 * «celiaca» in una frase in cui c'era «celiaco mio cognato».
 */

/* -------------------------------------------------------------------------- */
/*  Proporre, dalla riga di una chiamata                                      */
/* -------------------------------------------------------------------------- */

export function ProponiInsight({ chiamataId }: { chiamataId: string }) {
  const router = useRouter();
  const { mostra, problema } = useAvvisi();
  const [aperto, setAperto] = useState(false);
  const [tipo, setTipo] = useState<TipoInsight>("nota");
  const [valore, setValore] = useState("");
  const [inCorso, setInCorso] = useState(false);

  async function salva(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInCorso(true);
    const res = await fetch("/api/telefono/insight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chiamataId, tipo, valore }),
    });
    setInCorso(false);
    if (!res.ok) {
      problema(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    setValore("");
    setAperto(false);
    /* «Da approvare» e non «salvato»: dire «salvato» su una cosa che non è
       ancora nella scheda è la stessa bugia che l'anteprima di una
       prenotazione non deve dire. */
    mostra("Scritto, da approvare.");
    router.refresh();
  }

  if (!aperto) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAperto(true)}>
        <NotebookPen className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Nota sul cliente
      </Button>
    );
  }

  return (
    <form onSubmit={salva} className="flex flex-wrap items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {TIPI_INSIGHT.map((t) => (
          <Button
            key={t}
            type="button"
            variant={tipo === t ? "subtle" : "ghost"}
            size="sm"
            onClick={() => setTipo(t)}
          >
            {NOME_TIPO[t]}
          </Button>
        ))}
      </div>
      <Input
        value={valore}
        onChange={(e) => setValore(e.target.value)}
        placeholder={
          tipo === "allergia"
            ? "celiaca"
            : tipo === "preferenza"
              ? "tavolo in fondo, non vicino alla finestra"
              : "chiama per il padre, 88 anni"
        }
        required
        autoFocus
        className="h-8 w-56 text-xs"
        aria-label={`${NOME_TIPO[tipo]}: finirà ${DOVE_FINISCE[tipo]}`}
      />
      <Button
        type="submit"
        variant="accent"
        size="sm"
        disabled={inCorso || valore.trim().length < 2}
      >
        {inCorso ? "Salvo…" : "Proponi"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAperto(false)}
      >
        Annulla
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Approvare                                                                 */
/* -------------------------------------------------------------------------- */

export type InsightVista = {
  id: string;
  tipo: string;
  valore: string;
  chi: string | null;
  ospite: { id: string; nome: string } | null;
};

export function DaApprovare({ proposte }: { proposte: InsightVista[] }) {
  /* Vuoto non compare: un titolo «Da approvare» sopra il niente è un posto in
     più dove guardare per scoprire che non c'era niente. */
  if (proposte.length === 0) return null;

  return (
    <section aria-label="Da approvare" className="fissa space-y-2">
      <header className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold">Da approvare</h2>
        <span className="t-nota tabular-nums">{proposte.length}</span>
      </header>
      <ul className="space-y-2">
        {proposte.map((p) => (
          <RigaProposta key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );
}

function RigaProposta({ p }: { p: InsightVista }) {
  const router = useRouter();
  const { mostra, problema } = useAvvisi();
  const [inCorso, setInCorso] = useState(false);

  async function decidi(come: "approva" | "ignora") {
    setInCorso(true);
    const res = await fetch(`/api/telefono/insight/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ come }),
    });
    setInCorso(false);
    if (!res.ok) {
      problema(await readApiError(res, "Non siamo riusciti a salvare."));
      return;
    }
    mostra(come === "approva" ? "Scritto nella scheda." : "Non la teniamo.");
    router.refresh();
  }

  const tipo = p.tipo as TipoInsight;
  const nomeTipo = NOME_TIPO[tipo] ?? "Nota";
  const dove = DOVE_FINISCE[tipo] ?? "nelle note interne della scheda";

  return (
    <li className="riquadro p-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <Badge tone={tipo === "allergia" ? "warning" : "neutral"}>
              {nomeTipo}
            </Badge>
            {p.ospite ? (
              <Link
                href={`/guests/${p.ospite.id}`}
                className="text-sm underline underline-offset-2"
              >
                {p.ospite.nome}
              </Link>
            ) : (
              <span className="text-sm">{p.chi ?? "Non riconosciuto"}</span>
            )}
          </p>
          <p className="mt-1 text-sm">{p.valore}</p>
          {/* Dove finisce, prima di approvare: un'allergia si legge in sala su
              ogni cena, una nota interna no. Chi decide deve sapere quale
              delle due sta per scrivere. */}
          <p className="mt-0.5 t-nota">
            {p.ospite
              ? `Andrà ${dove}.`
              : "Questo numero non è ancora di nessuno: dai un nome a chi ha chiamato nello storico, poi approva."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="accent"
            size="sm"
            disabled={inCorso || !p.ospite}
            onClick={() => decidi("approva")}
          >
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Approva
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={inCorso}
            onClick={() => decidi("ignora")}
          >
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            No
          </Button>
        </div>
      </div>
    </li>
  );
}
