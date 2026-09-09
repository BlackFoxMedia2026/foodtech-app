"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2, Search, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MINIMO_LETTERE, type EsitoRicerca } from "@/lib/ricerca-tipi";

/**
 * Cercare una persona da qualunque schermata.
 *
 * Non è una tavolozza dei comandi: non lancia azioni, trova **cose** — un
 * ospite, una prenotazione. La tavolozza è un'altra cosa e sta più avanti
 * nella coda dei lavori.
 *
 * Perché un pulsante e non un campo nella barra: a 1440 px la barra in alto
 * porta già sei voci più «Altro» più tre comandi a destra, e un campo di
 * ricerca dentro quella fila l'avrebbe fatta tornare a scorrere in
 * orizzontale. Un pulsante costa quaranta pixel e apre una finestra che su
 * telefono e su scrivania è la stessa.
 *
 * Le scelte che la rendono usabile con una mano occupata:
 *
 * - **⌘K / Ctrl+K** la apre da qualunque schermata, e la scorciatoia non
 *   scatta quando si sta scrivendo in un campo — chi compila una prenotazione
 *   e scrive «k» non deve vedersi aprire una finestra;
 * - **frecce e Invio** scelgono senza toccare il mouse, e la riga scelta
 *   resta visibile perché si porta nel campo visivo da sola;
 * - **una domanda per volta**: le risposte in ritardo di una richiesta
 *   precedente si scartano confrontando la domanda che tornava con quella
 *   scritta adesso. Senza, chi digita in fretta vede lampeggiare i risultati
 *   di «Ro» sopra quelli di «Rossi».
 */
export function RicercaGlobale() {
  const router = useRouter();
  const [aperta, setAperta] = useState(false);
  const [q, setQ] = useState("");
  const [esito, setEsito] = useState<EsitoRicerca | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [scelta, setScelta] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  /* ---- la scorciatoia ---------------------------------------------------- */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      // In un campo di testo la scorciatoia non c'entra: ⌘K in un editor è
      // «inserisci un link», e qui dentro sarebbe un dispetto.
      const dove = e.target as HTMLElement | null;
      const scrivendo =
        dove?.tagName === "INPUT" || dove?.tagName === "TEXTAREA" || dove?.isContentEditable;
      if (scrivendo && !aperta) return;
      e.preventDefault();
      setAperta(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aperta]);

  /* ---- la domanda -------------------------------------------------------- */

  useEffect(() => {
    const domanda = q.trim();
    if (domanda.length < MINIMO_LETTERE) {
      setEsito(null);
      setInCorso(false);
      return;
    }
    // Duecento millesimi: il tempo di finire una parola. Senza attesa, ogni
    // lettera è una lettura del database.
    const attesa = window.setTimeout(async () => {
      setInCorso(true);
      try {
        const res = await fetch(`/api/ricerca?q=${encodeURIComponent(domanda)}`);
        if (!res.ok) return;
        const dati: EsitoRicerca = await res.json();
        // L'esito in ritardo di una domanda precedente si scarta.
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
        // Perché questa riga è qui: chi ha cercato una stringa non riconosce
        // un nome, riconosce il riferimento che ha letto al telefono.
        p.perRiferimento ? "trovata per riferimento" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  ];

  const vai = useCallback(
    (href: string) => {
      setAperta(false);
      setQ("");
      setEsito(null);
      router.push(href);
    },
    [router],
  );

  function onKeyCampo(e: React.KeyboardEvent<HTMLInputElement>) {
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

  return (
    <>
      <button
        type="button"
        onClick={() => setAperta(true)}
        aria-label="Cerca un ospite o una prenotazione"
        className="tocco-comodo flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-cream hover:text-foreground"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
      </button>

      <Dialog open={aperta} onOpenChange={setAperta}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 p-0">
          <DialogTitle className="sr-only">Cerca</DialogTitle>

          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={campo}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyCampo}
              placeholder="Nome, telefono, email…"
              aria-label="Cosa cerchi"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {inCorso && (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
          </div>

          <div className="fill-scroll max-h-[60vh] px-2 py-2">
            {q.trim().length < MINIMO_LETTERE ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Scrivi almeno {MINIMO_LETTERE} lettere, o le ultime cifre di un numero.
              </p>
            ) : righe.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                {inCorso
                  ? "Cerco…"
                  : "Nessun ospite e nessuna prenotazione con questo nome o numero."}
              </p>
            ) : (
              <ul>
                {righe.map((r, i) => {
                  const Icona = r.icona;
                  // L'etichetta compare sulla prima riga del suo tipo: quattro
                  // nomi e sei orari senza un titolo sono un elenco solo, e
                  // «Giulia Russo» due volte sembra un doppione.
                  const primaDelTipo = i === 0 || righe[i - 1].tipo !== r.tipo;
                  return (
                    <li key={r.chiave}>
                      {primaDelTipo && (
                        <p className="px-2 pb-0.5 pt-2 t-etichetta">
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
                          "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left",
                          // `bg-current/10` su verde scuro non si vedeva: la
                          // riga scelta deve stare addosso all'occhio, perché
                          // è quella che Invio apre.
                          i === scelta ? "bg-secondary" : "hover:bg-current/5",
                        )}
                      >
                        <Icona className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{r.titolo}</span>
                          {r.dettaglio && <span className="block truncate t-nota">{r.dettaglio}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

          </div>

          <div className="border-t border-border px-4 py-2">
            {(troppiOspiti > 0 || troppePrenotazioni > 0) && (
              /*
                Il tetto non nasconde il totale: «ci sono altri dodici Rossi»
                è un'informazione, mostrarne sei e tacere è una bugia.

                Sta **fuori** dalla regione che scorre: dentro finiva sotto il
                bordo inferiore e si leggeva a metà, cioè non si leggeva.
              */
              <p className="t-nota">
                {[
                  troppiOspiti > 0
                    ? troppiOspiti === 1
                      ? "un altro ospite"
                      : `altri ${troppiOspiti} ospiti`
                    : null,
                  troppePrenotazioni > 0
                    ? troppePrenotazioni === 1
                      ? "un'altra prenotazione"
                      : `altre ${troppePrenotazioni} prenotazioni`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" e ")}{" "}
                {troppiOspiti + troppePrenotazioni === 1 ? "corrisponde" : "corrispondono"}: restringi la
                ricerca, o apri il CRM.
              </p>
            )}
            {/*
              Cosa cerca, scritto. Una ricerca che non dice il suo perimetro fa
              concludere «non c'è» a chi cerca un piatto o un coupon.
            */}
            <p className="t-nota">
              Cerca fra ospiti e prenotazioni delle prossime settimane — o il riferimento di una
              prenotazione, in qualunque data. ⌘K per riaprirla.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
