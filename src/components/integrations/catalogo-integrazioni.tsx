"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CATEGORIE, ETICHETTA_CATEGORIA, type Categoria } from "@/server/integrations/tipi";
import type { SchedaCatalogo } from "@/server/integrations/vista";
import { BadgeImplementazione, BadgeStato, Monogramma, PallinoSalute, quando } from "./segni";

/**
 * **Il catalogo delle integrazioni.**
 *
 * Non è un negozio: niente stelline, niente «più popolari», niente
 * copertine. È un elenco da gestionale, che risponde a due domande —
 * *cosa ho collegato, e sta funzionando?* e *cosa posso collegare?* — in
 * quest'ordine. Per questo le installate vengono per prime (l'ordine lo
 * decide il server, `catalogoPerLocale`), e il filtro «Richiedono attenzione»
 * esiste: è il motivo per cui si torna su questa pagina.
 *
 * Una scheda dice sempre la verità sullo stato del connettore: «Anteprima»
 * per un adattatore non ancora provato con il fornitore, «In arrivo» per una
 * voce che è solo catalogo. Nessun pulsante «Installa» su qualcosa che non si
 * può installare.
 */

type Filtro = "tutte" | "installate" | "disponibili" | "attenzione";

const FILTRI: { id: Filtro; etichetta: string }[] = [
  { id: "tutte", etichetta: "Tutte" },
  { id: "installate", etichetta: "Installate" },
  { id: "disponibili", etichetta: "Disponibili" },
  { id: "attenzione", etichetta: "Richiedono attenzione" },
];

function normalizza(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function CatalogoIntegrazioni({ schede }: { schede: SchedaCatalogo[] }) {
  const [cerca, setCerca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [categoria, setCategoria] = useState<Categoria | null>(null);

  const conteggi = useMemo(
    () => ({
      tutte: schede.length,
      installate: schede.filter((s) => s.installazione).length,
      disponibili: schede.filter((s) => !s.installazione && (s.nonInstallabile === null || s.nativa)).length,
      attenzione: schede.filter((s) => s.richiedeAttenzione).length,
    }),
    [schede],
  );

  const categoriePresenti = CATEGORIE.filter((c) => schede.some((s) => s.categoria === c));

  const visibili = schede.filter((s) => {
    if (filtro === "installate" && !s.installazione) return false;
    if (filtro === "disponibili" && (s.installazione || (s.nonInstallabile !== null && !s.nativa))) return false;
    if (filtro === "attenzione" && !s.richiedeAttenzione) return false;
    if (categoria && s.categoria !== categoria) return false;
    if (cerca.trim()) {
      const q = normalizza(cerca.trim());
      const testo = normalizza(`${s.nome} ${s.fornitore} ${s.descrizione} ${ETICHETTA_CATEGORIA[s.categoria]}`);
      if (!testo.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Ricerca e stato */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Cerca un'integrazione o un fornitore"
            aria-label="Cerca un'integrazione"
            className="pl-9"
          />
        </div>
        <div role="tablist" aria-label="Filtra per stato" className="flex flex-wrap gap-1.5">
          {FILTRI.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "tocco-comodo inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                filtro === f.id
                  ? "border-accent/60 bg-accent/50 text-cream"
                  : "border-border text-muted-foreground hover:text-foreground",
                f.id === "attenzione" && conteggi.attenzione === 0 && filtro !== f.id && "opacity-60",
              )}
            >
              {f.etichetta}
              <span className="tabular-nums opacity-80">{conteggi[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Categorie */}
      <div className="flex flex-wrap gap-1.5" aria-label="Categorie">
        <button
          type="button"
          onClick={() => setCategoria(null)}
          aria-pressed={categoria === null}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            categoria === null ? "border-cream/40 text-cream" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Tutte le categorie
        </button>
        {categoriePresenti.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoria(categoria === c ? null : c)}
            aria-pressed={categoria === c}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              categoria === c ? "border-cream/40 text-cream" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {ETICHETTA_CATEGORIA[c]}
          </button>
        ))}
      </div>

      {visibili.length === 0 ? (
        <p className="riquadro tratteggiato comodo text-center text-sm text-muted-foreground">
          {filtro === "attenzione"
            ? "Nessuna integrazione richiede attenzione. Tutto quello che è collegato sta funzionando."
            : filtro === "installate"
              ? "Nessuna integrazione installata su questo locale."
              : "Nessuna integrazione corrisponde alla ricerca."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibili.map((s) => (
            <li key={s.slug}>
              <Scheda s={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Scheda({ s }: { s: SchedaCatalogo }) {
  const href = s.nativa ?? `/settings/integrations/${s.slug}`;
  const i = s.installazione;

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-full flex-col gap-3 rounded-lg border bg-card/60 p-4 transition-colors hover:border-border-strong hover:bg-card",
        s.richiedeAttenzione ? "border-accent/60" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <Monogramma testo={s.monogramma} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">
            {i && <PallinoSalute salute={i.salute} />}
            <span className="truncate">{s.nome}</span>
          </p>
          <p className="t-etichetta mt-0.5">{ETICHETTA_CATEGORIA[s.categoria]}</p>
        </div>
        <BadgeImplementazione voce={s} />
      </div>

      <p className="text-sm text-muted-foreground">{s.descrizione}</p>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        {i ? (
          <div className="min-w-0 space-y-0.5">
            <BadgeStato stato={i.status} salute={i.salute} />
            {i.sede && <p className="truncate t-nota">Punto vendita: {i.sede}</p>}
            {i.problema ? (
              <p className="truncate text-xs text-accent-strong">{i.problema.titolo}</p>
            ) : i.ultimaSyncIl ? (
              <p className="t-nota">Ultima sincronizzazione {quando(i.ultimaSyncIl)}</p>
            ) : null}
          </div>
        ) : s.nonInstallabile && !s.nativa ? (
          <p className="t-nota">{s.implementazione === "PLANNED" ? "Non ancora disponibile" : s.nonInstallabile}</p>
        ) : (
          <span className="text-sm font-medium text-cream">{s.nativa ? "Collega" : "Installa"}</span>
        )}
        <ArrowRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}
