"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Luogo } from "@/server/luoghi";

/**
 * Un campo che suggerisce mentre si scrive: un **comune** (luogo di nascita:
 * «To» → Torino (TO)) o un **indirizzo** (via e civico: scelto il
 * suggerimento si compilano anche CAP, comune e provincia, vedi `onScegli`).
 *
 * Il testo resta libero: se il servizio non risponde, o il posto non c'è, si
 * scrive a mano. I suggerimenti arrivano da `/api/luoghi`.
 */
export function CampoLuogo({
  id,
  valore,
  onCambia,
  onScegli,
  tipo,
  placeholder,
  invalido,
  autoFocus,
}: {
  id: string;
  valore: string;
  onCambia: (testo: string) => void;
  onScegli: (luogo: Luogo) => void;
  tipo: "comune" | "indirizzo";
  placeholder?: string;
  invalido?: boolean;
  autoFocus?: boolean;
}) {
  const [suggeriti, setSuggeriti] = useState<Luogo[]>([]);
  const [aperto, setAperto] = useState(false);
  const [attivo, setAttivo] = useState(-1);
  const [cerca, setCerca] = useState(false);
  // Si cerca solo dopo che si è scritto, non quando il valore cambia perché
  // si è scelto un suggerimento (o tornando a un passo già compilato).
  const daCercare = useRef<string | null>(null);
  const idElenco = useId();

  useEffect(() => {
    const q = daCercare.current;
    if (q === null) return;
    if (q.trim().length < (tipo === "comune" ? 2 : 4)) {
      setSuggeriti([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCerca(true);
      try {
        const res = await fetch(`/api/luoghi?q=${encodeURIComponent(q)}${tipo === "comune" ? "&comuni=1" : ""}`, {
          signal: controller.signal,
        });
        const dati = res.ok ? ((await res.json()) as { luoghi: Luogo[] }) : { luoghi: [] };
        setSuggeriti(dati.luoghi);
        setAttivo(dati.luoghi.length ? 0 : -1);
        setAperto(true);
      } catch {
        /* Interrotta da una nuova lettera, o rete assente: si scrive a mano. */
      } finally {
        if (!controller.signal.aborted) setCerca(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [valore, tipo]);

  function scegli(l: Luogo) {
    daCercare.current = null;
    setAperto(false);
    setSuggeriti([]);
    onScegli(l);
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={valore}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-invalid={invalido}
        role="combobox"
        aria-expanded={aperto && suggeriti.length > 0}
        aria-controls={idElenco}
        aria-autocomplete="list"
        onChange={(e) => {
          daCercare.current = e.target.value;
          onCambia(e.target.value);
        }}
        onFocus={() => suggeriti.length && setAperto(true)}
        // Il clic su un suggerimento arriva prima del blur (onMouseDown).
        onBlur={() => window.setTimeout(() => setAperto(false), 120)}
        onKeyDown={(e) => {
          if (!aperto || !suggeriti.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAttivo((a) => (a + 1) % suggeriti.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAttivo((a) => (a - 1 + suggeriti.length) % suggeriti.length);
          } else if (e.key === "Enter" && attivo >= 0) {
            e.preventDefault();
            scegli(suggeriti[attivo]);
          } else if (e.key === "Escape") {
            setAperto(false);
          }
        }}
        className="pr-9"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
        {cerca ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
      </span>

      {aperto && suggeriti.length > 0 && (
        <ul
          id={idElenco}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-2xl border border-border/70 bg-popover p-1 shadow-xl"
        >
          {suggeriti.map((l, i) => (
            <li
              key={l.etichetta}
              role="option"
              aria-selected={i === attivo}
              onMouseDown={(e) => {
                e.preventDefault();
                scegli(l);
              }}
              onMouseEnter={() => setAttivo(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm",
                i === attivo ? "bg-veil-10 text-foreground" : "text-foreground/85",
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{l.etichetta}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
