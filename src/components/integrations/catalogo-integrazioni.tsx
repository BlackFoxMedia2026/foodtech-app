"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SchedaCliente } from "@/server/integrations/vista-cliente";
import { CATEGORIA_CLIENTE, STATI_DA_SISTEMARE, STATI_INSTALLATA } from "@/server/integrations/cliente";
import { CATEGORIE } from "@/server/integrations/tipi";
import { Logo, PillolaStato, SegnoAnteprima } from "./segni";
import { PulsanteAzione } from "./pulsante-azione";

/**
 * **Il catalogo delle integrazioni, visto dal ristoratore.**
 *
 * Ogni scheda risponde a due domande con due elementi: *in che stato è la
 * connessione* (uno degli stati del cliente) e *che cosa posso fare* (un
 * pulsante). Tutto il resto — perché un'anteprima è un'anteprima, che cosa è
 * stato provato, con quale adattatore — è di Foodtech, e sta in
 * /admin/integrazioni.
 *
 * In cima «Le tue integrazioni», quelle già installate su questo locale: sono
 * il motivo per cui si torna qui, e si riconoscono subito. Sotto, il resto del
 * catalogo diviso per categoria, nell'ordine del catalogo. Due filtri: la
 * categoria e lo stato.
 */

function normalizza(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* Prima le due famiglie per cui un ristorante viene qui (la cassa, e i canali
   con cui parla ai clienti), poi il resto nell'ordine del catalogo. */
const IN_TESTA = ["POS", "MARKETING", "PAGAMENTI"] as const;
const ORDINE_CATEGORIE = [...IN_TESTA, ...CATEGORIE.filter((c) => !(IN_TESTA as readonly string[]).includes(c))].map((c) => CATEGORIA_CLIENTE[c]);

type FiltroStato = "tutte" | "collegate" | "da_sistemare" | "collegabili" | "anteprima" | "prossimamente";

const FILTRI_STATO: { chiave: FiltroStato; etichetta: string; vale: (s: SchedaCliente) => boolean }[] = [
  { chiave: "tutte", etichetta: "Tutte", vale: () => true },
  { chiave: "collegate", etichetta: "Collegate", vale: (s) => STATI_INSTALLATA.has(s.stato) },
  { chiave: "da_sistemare", etichetta: "Da sistemare", vale: (s) => STATI_DA_SISTEMARE.has(s.stato) },
  { chiave: "collegabili", etichetta: "Pronte da collegare", vale: (s) => s.azione === "COLLEGA" },
  { chiave: "anteprima", etichetta: "In anteprima", vale: (s) => s.anteprima && s.stato !== "PROSSIMAMENTE" },
  { chiave: "prossimamente", etichetta: "Prossimamente", vale: (s) => s.stato === "PROSSIMAMENTE" },
];

export function CatalogoIntegrazioni({ schede, puoCollegare }: { schede: SchedaCliente[]; puoCollegare: boolean }) {
  const [cerca, setCerca] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroStato>("tutte");

  const categorie = useMemo(
    () => [...new Set(schede.map((s) => s.categoria))].sort((a, b) => ORDINE_CATEGORIE.indexOf(a) - ORDINE_CATEGORIE.indexOf(b)),
    [schede],
  );
  // Un filtro che non troverebbe niente non si offre.
  const filtri = FILTRI_STATO.filter((f) => f.chiave === "tutte" || schede.some(f.vale));
  const vale = FILTRI_STATO.find((f) => f.chiave === filtro)!.vale;

  const visibili = schede.filter((s) => {
    if (categoria && s.categoria !== categoria) return false;
    if (!vale(s)) return false;
    if (cerca.trim()) {
      const q = normalizza(cerca.trim());
      if (!normalizza(`${s.nome} ${s.descrizione} ${s.categoria}`).includes(q)) return false;
    }
    return true;
  });
  const mie = visibili.filter((s) => STATI_INSTALLATA.has(s.stato));
  const altre = visibili.filter((s) => !mie.includes(s));
  const perCategoria = categorie
    .map((c) => ({ categoria: c, schede: altre.filter((s) => s.categoria === c) }))
    .filter((g) => g.schede.length > 0);

  return (
    <div className="min-w-0 space-y-5">
      <div className="space-y-2.5">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
          <div className="relative w-full md:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Cerca un'integrazione"
              aria-label="Cerca un'integrazione"
              className="pl-9"
            />
          </div>
          <FilaChip etichetta="Categorie">
            <Chip attiva={categoria === null} onClick={() => setCategoria(null)}>
              Tutte le categorie
            </Chip>
            {categorie.map((c) => (
              <Chip key={c} attiva={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </FilaChip>
        </div>
        {filtri.length > 2 && (
          <FilaChip etichetta="Stato">
            {filtri.map((f) => (
              <Chip key={f.chiave} attiva={filtro === f.chiave} onClick={() => setFiltro(f.chiave)}>
                {f.etichetta}
              </Chip>
            ))}
          </FilaChip>
        )}
      </div>

      {visibili.length === 0 && (
        <p className="riquadro tratteggiato comodo text-center text-sm text-muted-foreground">
          Nessuna integrazione corrisponde alla ricerca.
        </p>
      )}

      {mie.length > 0 && (
        <Sezione titolo="Le tue integrazioni">
          {mie.map((s) => (
            <Scheda key={s.slug} s={s} puoCollegare={puoCollegare} />
          ))}
        </Sezione>
      )}

      {perCategoria.map((g) => (
        <Sezione key={g.categoria} titolo={g.categoria}>
          {g.schede.map((s) => (
            <Scheda key={s.slug} s={s} puoCollegare={puoCollegare} />
          ))}
        </Sezione>
      ))}
    </div>
  );
}

function FilaChip({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div
      className="-mx-1 flex w-full min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 md:w-auto md:flex-wrap md:overflow-visible md:pb-0"
      role="group"
      aria-label={etichetta}
    >
      {children}
    </div>
  );
}

function Chip({ attiva, onClick, children }: { attiva: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attiva}
      className={cn(
        "tocco-comodo inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors",
        attiva ? "segmento-scelto border-accent/60 bg-accent/50 text-cream" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="t-etichetta">{titolo}</h2>
      <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>
    </section>
  );
}

function Scheda({ s, puoCollegare }: { s: SchedaCliente; puoCollegare: boolean }) {
  const href = s.hrefNativa ?? `/settings/integrations/${s.slug}`;
  const daSistemare = STATI_DA_SISTEMARE.has(s.stato);
  return (
    <li
      className={cn(
        "group relative flex h-full min-w-0 flex-col gap-3 rounded-xl border bg-card/60 p-4 transition-colors hover:border-border-strong hover:bg-card",
        daSistemare ? "border-accent/60" : s.stato === "COLLEGATO" ? "border-[color:var(--integ-bordo-collegata)]" : "border-border",
        s.stato === "PROSSIMAMENTE" && "bg-card/30",
      )}
    >
      <div className="flex items-start gap-3">
        <Logo src={s.logo} testo={s.monogramma} />
        <div className="min-w-0 flex-1">
          {/* Il nome è il collegamento, e copre tutta la scheda: il pulsante sta sopra. */}
          <Link href={href} className="block truncate font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {s.nome}
          </Link>
          <p className="t-nota mt-0.5 flex flex-wrap items-center gap-1.5">
            {s.categoria}
            {s.anteprima && s.stato !== "PROSSIMAMENTE" && <SegnoAnteprima />}
          </p>
        </div>
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">{s.descrizione}</p>

      <div className="mt-auto flex min-h-9 items-center justify-between gap-2 border-t border-border/60 pt-3">
        <div className="min-w-0">
          <PillolaStato stato={s.stato} etichetta={s.etichettaStato} />
          {s.riga && <p className="mt-0.5 truncate t-nota">{s.riga}</p>}
        </div>
        <div className="relative z-10 shrink-0">
          <PulsanteAzione
            slug={s.slug}
            nome={s.nome}
            azione={s.azione}
            hrefNativa={s.hrefNativa}
            puoRichiedere={puoCollegare}
            inAttivazione={s.inAttivazione}
          />
        </div>
      </div>
    </li>
  );
}
