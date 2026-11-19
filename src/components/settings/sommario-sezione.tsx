"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * «In questa pagina»: i gruppi della sezione aperta, nel pannello verde di
 * lato.
 *
 * Nato il 19 nov 2026 per usare lo spazio ai lati della colonna di lettura,
 * che su uno schermo largo restava vuoto. L'elenco **non è scritto a mano**:
 * si legge dai gruppi in pagina (`data-gruppo` su `GruppoImpostazioni`), così
 * un gruppo nuovo, o uno che compare solo a certe condizioni, ci finisce da
 * solo e il sommario non mente mai su cosa c'è sotto.
 *
 * La voce accesa segue lo scorrere, e la capsula bianca **scivola** fino a
 * lei invece di saltare: si vede dove si è nella pagina anche con la coda
 * dell'occhio. Non è l'osservatore che era stato tolto dalla barra in alto:
 * quello serviva a una pagina di ottomila pixel, questo accende una riga in
 * un elenco di quattro.
 */
export function SommarioSezione({ sezione }: { sezione: string }) {
  const [gruppi, setGruppi] = useState<{ id: string; titolo: string }[]>([]);
  const [acceso, setAcceso] = useState<string | null>(null);
  const voci = useRef(new Map<string, HTMLAnchorElement>());
  const [capsula, setCapsula] = useState<{ y: number; h: number } | null>(null);
  /* Dopo un clic la capsula va dove si è cliccato e ci resta finché lo
     scorrere morbido non arriva: senza, attraversando i gruppi in mezzo,
     ripasserebbe su ognuno. */
  const fermo = useRef(0);

  useEffect(() => {
    const elementi = Array.from(
      document.querySelectorAll<HTMLElement>(`#${sezione} [data-gruppo]`),
    );
    setGruppi(
      elementi.map((el) => ({ id: el.id, titolo: el.dataset.gruppo ?? "" })),
    );
    if (elementi.length === 0) return;
    setAcceso(elementi[0].id);

    const visibili = new Set<string>();
    const osservatore = new IntersectionObserver(
      (cambi) => {
        for (const c of cambi) {
          if (c.isIntersecting) visibili.add(c.target.id);
          else visibili.delete(c.target.id);
        }
        if (Date.now() < fermo.current) return;
        /* Il primo gruppo, in ordine di pagina, che si vede nella fascia alta. */
        const primo = elementi.find((el) => visibili.has(el.id));
        if (primo) setAcceso(primo.id);
      },
      { rootMargin: "-15% 0px -55% 0px" },
    );
    elementi.forEach((el) => osservatore.observe(el));
    return () => osservatore.disconnect();
  }, [sezione]);

  useLayoutEffect(() => {
    function misura() {
      const el = acceso ? voci.current.get(acceso) : undefined;
      setCapsula(el ? { y: el.offsetTop, h: el.offsetHeight } : null);
    }
    misura();
    window.addEventListener("resize", misura);
    return () => window.removeEventListener("resize", misura);
  }, [acceso, gruppi]);

  if (gruppi.length < 2) return null;

  return (
    <nav aria-label="In questa pagina" className="mt-7">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white/60">
        In questa pagina
      </p>
      <ul className="relative mt-3 space-y-0.5">
        {capsula && (
          <li
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 rounded-full bg-white shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)] transition-[transform,height] duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none"
            style={{ transform: `translateY(${capsula.y}px)`, height: capsula.h }}
          />
        )}
        {gruppi.map((g) => (
          <li key={g.id}>
            <a
              ref={(el) => {
                if (el) voci.current.set(g.id, el);
                else voci.current.delete(g.id);
              }}
              href={`#${g.id}`}
              aria-current={acceso === g.id ? "location" : undefined}
              onClick={(e) => {
                e.preventDefault();
                fermo.current = Date.now() + 900;
                setAcceso(g.id);
                document
                  .getElementById(g.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "relative block rounded-full px-4 py-2 text-sm leading-snug transition-colors duration-200",
                acceso === g.id
                  ? "font-semibold text-[#1f3d31]"
                  : "text-white/80 hover:text-white",
              )}
            >
              {g.titolo}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
