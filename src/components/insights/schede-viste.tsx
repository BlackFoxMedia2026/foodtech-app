"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, ChevronDown, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { VISTE, vistaDa } from "@/lib/viste-insights";
import { cn } from "@/lib/utils";

/**
 * La barra di Analytics: le quattro viste a sinistra, il periodo a destra.
 *
 * Fino al 18 novembre 2026 erano due file di pillole sopra tutto il resto —
 * sei per il periodo, quattro per le viste, più un sottotitolo — e
 * occupavano la prima schermata prima ancora di un numero. Adesso stanno in
 * una riga sola, **sotto** le quattro tessere: i numeri del periodo vengono
 * prima, e la barra decide cosa si guarda dopo.
 *
 * Le viste restano **link** (funzionano senza JavaScript, si mandano a un
 * collega, il tasto indietro fa quello che ci si aspetta). Al clic semplice
 * la navigazione passa da una transizione: il cursore si sposta subito e la
 * voce scelta porta una rotella finché i dati non arrivano — altrimenti su
 * una connessione lenta si restava a guardare i numeri di prima senza sapere
 * se il tocco era arrivato.
 *
 * Sta in un componente suo perché la rende **anche la schermata di
 * caricamento**: cambiando vista la barra non deve diventare un rettangolo.
 */
export function SchedeViste({ from, to }: { from?: string; to?: string }) {
  const parametri = useSearchParams();
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [chiesta, setChiesta] = useState<string | null>(null);
  const attiva = vistaDa(parametri.get("vista"));
  const mostrata = inCorso && chiesta ? chiesta : attiva;
  const indice = Math.max(0, VISTE.findIndex((v) => v.id === mostrata));

  function hrefDi(id: string) {
    const sp = new URLSearchParams(parametri);
    sp.set("vista", id);
    return `/insights?${sp.toString()}`;
  }

  function vai(e: React.MouseEvent<HTMLAnchorElement>, href: string, id: string) {
    // Un clic con un modificatore vuole aprire altrove: non è nostro.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setChiesta(id);
    avvia(() => router.push(href));
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <nav
        aria-label="Viste di Analytics"
        className="relative grid h-10 min-w-0 flex-1 grid-cols-4 rounded-xl bg-[rgba(118,118,128,0.12)] p-0.5"
      >
        {/* Il cursore bianco che scorre sotto la voce scelta. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0.5 w-[calc(25%-1px)] rounded-[10px] bg-white/90 shadow-[0_3px_8px_rgba(16,32,26,0.12),0_1px_1px_rgba(16,32,26,0.04)] transition-transform duration-300 ease-out dark:bg-white/15"
          style={{ transform: `translateX(${indice * 100}%)` }}
        />
        {VISTE.map((v) => {
          const href = hrefDi(v.id);
          const scelta = v.id === mostrata;
          const aspetta = inCorso && chiesta === v.id;
          return (
            <Link
              key={v.id}
              href={href}
              onClick={(e) => vai(e, href, v.id)}
              aria-current={v.id === attiva ? "page" : undefined}
              aria-busy={aspetta || undefined}
              title={v.titolo}
              className={cn(
                "relative z-10 flex min-w-0 items-center justify-center gap-1 rounded-[10px] px-1 text-xs transition-colors sm:px-1.5 sm:text-sm",
                scelta ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Sul telefono il nome corto: quattro voci in 358 px. */}
              <span className="truncate sm:hidden">{v.corto}</span>
              <span className="hidden truncate sm:inline">{v.titolo}</span>
              {aspetta && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />}
            </Link>
          );
        })}
      </nav>

      <SceltaPeriodo from={from ?? parametri.get("from") ?? ""} to={to ?? parametri.get("to") ?? ""} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Il periodo                                                                 */
/* -------------------------------------------------------------------------- */

const PERIODI = [
  { key: "last7", label: "Ultimi 7 giorni" },
  { key: "last30", label: "Ultimi 30 giorni" },
  { key: "last90", label: "Ultimi 90 giorni" },
  { key: "currentMonth", label: "Mese corrente" },
  { key: "currentYear", label: "Anno corrente" },
] as const;

const DATA = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const breve = (k: string) => (k ? DATA.format(new Date(`${k}T12:00:00Z`)).replace(".", "") : "");

/**
 * Un pulsante solo, che dice il periodo scelto; le scelte stanno dentro.
 * Sei pillole sempre aperte dicevano la stessa cosa usando una riga intera.
 */
export function SceltaPeriodo({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const parametri = useSearchParams();
  const [aperto, setAperto] = useState(false);
  const [dal, setDal] = useState(from);
  const [al, setAl] = useState(to);
  const range = parametri.get("range") ?? "last7";
  const scelto = PERIODI.find((p) => p.key === range);

  function vai(sp: URLSearchParams) {
    setAperto(false);
    router.push(`${pathname}?${sp.toString()}`);
  }

  function scegli(key: string) {
    const sp = new URLSearchParams(parametri);
    sp.set("range", key);
    sp.delete("from");
    sp.delete("to");
    vai(sp);
  }

  function applica() {
    if (!dal || !al) return;
    const sp = new URLSearchParams(parametri);
    sp.set("range", "custom");
    sp.set("from", dal <= al ? dal : al);
    sp.set("to", dal <= al ? al : dal);
    vai(sp);
  }

  const etichetta = scelto ? scelto.label : from && to ? `${breve(from)} – ${breve(to)}` : "Personalizzato";

  return (
    <Popover
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o);
        if (o) {
          setDal(from);
          setAl(to);
        }
      }}
    >
      <PopoverTrigger
        className="vetro flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-medium text-foreground transition-colors hover:bg-white/40 sm:w-auto sm:px-3"
        aria-label={`Periodo: ${etichetta}`}
      >
        <CalendarDays className="h-4 w-4 text-accent-strong" aria-hidden="true" />
        {/* Sul telefono solo l'icona: le quattro viste hanno bisogno della riga. */}
        <span className="hidden sm:inline">{etichetta}</span>
        <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <ul role="listbox" aria-label="Periodo">
          {PERIODI.map((p) => (
            <li key={p.key}>
              <button
                type="button"
                role="option"
                aria-selected={p.key === range}
                onClick={() => scegli(p.key)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/60",
                  p.key === range ? "font-semibold text-foreground" : "text-card-foreground",
                )}
              >
                {p.label}
                {p.key === range && <Check className="h-4 w-4 text-sage-strong" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-border px-3 pb-2 pt-3">
          <p className="t-etichetta text-xs text-kpi-label-muted">Date a scelta</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              Dal
              <input
                type="date"
                value={dal}
                max={al || undefined}
                onChange={(e) => setDal(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Al
              <input
                type="date"
                value={al}
                min={dal || undefined}
                onChange={(e) => setAl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={applica}
            disabled={!dal || !al}
            className="mt-3 h-9 w-full rounded-lg bg-segment text-sm font-semibold text-segment-ink transition-opacity disabled:opacity-40"
          >
            Mostra queste date
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
