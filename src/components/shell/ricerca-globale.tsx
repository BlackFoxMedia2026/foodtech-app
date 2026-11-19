"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, CornerDownLeft, Loader2, Search, UserRound, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MINIMO_LETTERE, type EsitoRicerca } from "@/lib/ricerca-tipi";

/**
 * Cercare una persona da qualunque schermata.
 *
 * Non è una tavolozza dei comandi: non lancia azioni, trova **cose** — un
 * ospite, una prenotazione.
 *
 * **Nella testata, non in una finestra** (19 nov 2026). Il pulsante con la
 * lente si allarga e diventa il campo; agente, notifiche e profilo si fanno
 * da parte con un'animazione (lo decide `Header`, che riceve `aperta`), e i
 * risultati scendono in un pannello sotto il campo. Prima era una finestra
 * al centro dello schermo: per una riga di testo, troppo.
 *
 * Le scelte che la rendono usabile con una mano occupata:
 *
 * - **⌘K / Ctrl+K** la apre da qualunque schermata, e la scorciatoia non
 *   scatta quando si sta scrivendo in un campo;
 * - **frecce e Invio** scelgono senza toccare il mouse, **Esc** o un clic
 *   fuori la richiudono;
 * - **una domanda per volta**: le risposte in ritardo di una richiesta
 *   precedente si scartano confrontando la domanda che tornava con quella
 *   scritta adesso.
 */
/** Il segnale con cui un altro punto del guscio apre la ricerca. */
export const EVENTO_APRI_RICERCA = "tavolo:apri-ricerca";

export function RicercaGlobale({
  aperta,
  onAperta,
}: {
  aperta: boolean;
  onAperta: (v: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [esito, setEsito] = useState<EsitoRicerca | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [scelta, setScelta] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const radice = useRef<HTMLDivElement>(null);

  const chiudi = useCallback(() => {
    onAperta(false);
    setQ("");
    setEsito(null);
  }, [onAperta]);

  /* ---- la scorciatoia ---------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const dove = e.target as HTMLElement | null;
      const scrivendo =
        dove?.tagName === "INPUT" || dove?.tagName === "TEXTAREA" || dove?.isContentEditable;
      if (scrivendo && !aperta) return;
      e.preventDefault();
      onAperta(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aperta, onAperta]);

  useEffect(() => {
    const apri = () => onAperta(true);
    window.addEventListener(EVENTO_APRI_RICERCA, apri);
    return () => window.removeEventListener(EVENTO_APRI_RICERCA, apri);
  }, [onAperta]);

  /* Aperta: il cursore va nel campo (dopo che ha cominciato ad allargarsi) e
     un clic fuori la richiude. */
  useEffect(() => {
    if (!aperta) return;
    const t = window.setTimeout(() => campo.current?.focus(), 60);
    function fuori(e: PointerEvent) {
      if (radice.current && !radice.current.contains(e.target as Node)) chiudi();
    }
    document.addEventListener("pointerdown", fuori);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", fuori);
    };
  }, [aperta, chiudi]);

  /* ---- la domanda -------------------------------------------------------- */

  useEffect(() => {
    const domanda = q.trim();
    if (domanda.length < MINIMO_LETTERE) {
      setEsito(null);
      setInCorso(false);
      return;
    }
    // Duecento millesimi: il tempo di finire una parola.
    const attesa = window.setTimeout(async () => {
      setInCorso(true);
      try {
        const res = await fetch(`/api/ricerca?q=${encodeURIComponent(domanda)}`);
        if (!res.ok) return;
        const dati: EsitoRicerca = await res.json();
        setEsito((prima) => (dati.q === domanda ? dati : prima));
        setScelta(0);
      } finally {
        setInCorso(false);
      }
    }, 200);
    return () => window.clearTimeout(attesa);
  }, [q]);

  const righe = [
    ...(esito?.ospiti ?? []).map((o) => ({
      tipo: "ospite" as const,
      chiave: `o-${o.id}`,
      href: `/guests/${o.id}`,
      icona: UserRound,
      titolo: o.nome,
      dettaglio: [
        o.telefono,
        o.visite > 0 ? `${o.visite} ${o.visite === 1 ? "visita" : "visite"}` : null,
        o.livello === "VIP" || o.livello === "AMBASSADOR" ? "VIP" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
    ...(esito?.prenotazioni ?? []).map((p) => ({
      tipo: "prenotazione" as const,
      chiave: `p-${p.id}`,
      href: `/bookings/${p.id}`,
      icona: CalendarRange,
      titolo: p.nome,
      dettaglio: [
        new Intl.DateTimeFormat("it-IT", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(p.quando)),
        `${p.partySize} ${p.partySize === 1 ? "coperto" : "coperti"}`,
        p.tavolo,
        // Chi ha cercato una stringa non riconosce un nome, riconosce il
        // riferimento che ha letto al telefono.
        p.perRiferimento ? "trovata per riferimento" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  ];

  const vai = useCallback(
    (href: string) => {
      chiudi();
      router.push(href);
    },
    [chiudi, router],
  );

  function onKeyCampo(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      chiudi();
      return;
    }
    if (righe.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setScelta((i) => (i + 1) % righe.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setScelta((i) => (i - 1 + righe.length) % righe.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      vai(righe[scelta].href);
    }
  }

  const troppiOspiti = (esito?.ospitiTotali ?? 0) - (esito?.ospiti.length ?? 0);
  const troppePrenotazioni = (esito?.prenotazioniTotali ?? 0) - (esito?.prenotazioni.length ?? 0);
  const conDomanda = q.trim().length >= MINIMO_LETTERE;

  return (
    <div
      ref={radice}
      className={cn(
        "relative",
        // Sul telefono la lente non sta in testata; aperta da un segnale, il
        // campo copre la testata intera.
        aperta ? "max-md:fixed max-md:inset-x-3 max-md:top-[calc(env(safe-area-inset-top)+0.75rem)] max-md:z-50" : "hidden md:block",
      )}
    >
      <div
        className={cn(
          "flex h-10 items-center overflow-hidden rounded-lg border transition-[width,background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:h-[46px]",
          aperta
            ? "w-full border-border bg-card shadow-[0_6px_24px_-12px_rgba(16,32,26,0.35)] md:w-[13.5rem]"
            : "tondo-strumento w-10 border-border text-muted-foreground hover:border-line hover:text-foreground md:w-[46px]",
        )}
      >
        <button
          type="button"
          onClick={() => (aperta ? campo.current?.focus() : onAperta(true))}
          aria-label="Cerca un ospite o una prenotazione"
          tabIndex={aperta ? -1 : 0}
          className={cn(
            "grid h-full w-10 shrink-0 place-items-center md:w-[46px]",
            aperta && "text-sage-strong",
          )}
        >
          {inCorso ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <input
          ref={campo}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyCampo}
          placeholder="Ospite o prenotazione"
          aria-label="Cosa cerchi"
          tabIndex={aperta ? 0 : -1}
          aria-hidden={!aperta}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm text-card-foreground outline-none transition-opacity duration-200 placeholder:text-muted-foreground/80",
            aperta ? "opacity-100 delay-100" : "pointer-events-none opacity-0",
          )}
        />
        {aperta && (
          <button
            type="button"
            onClick={chiudi}
            aria-label="Chiudi la ricerca"
            className="mr-1.5 grid h-8 w-8 shrink-0 animate-fade-in place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* I risultati scendono sotto il campo, solo quando c'è una domanda. */}
      {aperta && conDomanda && (
        <div className="absolute right-0 top-full z-50 mt-2 w-full animate-fade-in overflow-hidden rounded-2xl border border-border bg-popover shadow-[0_18px_40px_-18px_rgba(16,32,26,0.45)] md:w-[min(30rem,calc(100vw-1.5rem))]">
          <div className="fill-scroll max-h-[60vh] p-1.5">
            {righe.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {inCorso ? "Cerco…" : "Nessun risultato"}
              </p>
            ) : (
              <ul>
                {righe.map((r, i) => {
                  const Icona = r.icona;
                  // L'etichetta compare sulla prima riga del suo tipo: senza,
                  // «Giulia Russo» ospite e prenotazione sembra un doppione.
                  const primaDelTipo = i === 0 || righe[i - 1].tipo !== r.tipo;
                  return (
                    <li key={r.chiave}>
                      {primaDelTipo && (
                        <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {r.tipo === "ospite" ? "Ospiti" : "Prenotazioni"}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => vai(r.href)}
                        onMouseEnter={() => setScelta(i)}
                        aria-current={i === scelta ? "true" : undefined}
                        ref={(el) => {
                          if (i === scelta) el?.scrollIntoView({ block: "nearest" });
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                          i === scelta ? "bg-secondary" : "hover:bg-current/5",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                            r.tipo === "ospite" ? "bg-sage-strong/10 text-sage-strong" : "bg-accent-strong/10 text-accent-strong",
                          )}
                        >
                          <Icona className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-card-foreground">{r.titolo}</span>
                          {r.dettaglio && (
                            <span className="block truncate text-xs text-muted-foreground">{r.dettaglio}</span>
                          )}
                        </span>
                        {i === scelta && (
                          <CornerDownLeft className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {(troppiOspiti > 0 || troppePrenotazioni > 0) && (
            /* Il tetto non nasconde il totale: tacere gli altri sarebbe una
               bugia. */
            <p className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
              {[
                troppiOspiti > 0 ? (troppiOspiti === 1 ? "+1 ospite" : `+${troppiOspiti} ospiti`) : null,
                troppePrenotazioni > 0
                  ? troppePrenotazioni === 1
                    ? "+1 prenotazione"
                    : `+${troppePrenotazioni} prenotazioni`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              — scrivi qualcosa in più per restringere
            </p>
          )}
        </div>
      )}
    </div>
  );
}
