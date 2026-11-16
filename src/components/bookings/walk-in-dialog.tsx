"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ListPlus, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readApiError } from "@/lib/api-client";
import { CercaOspite, type OspiteTrovato } from "./walk-in-cerca-ospite";
import { cn } from "@/lib/utils";

type FreeTable = {
  tableId: string;
  label: string;
  seats: number;
  roomName: string | null;
};

type Ricerca = {
  tables: FreeTable[];
  reason: "venue_closed" | "shift_full" | "all_busy" | "no_table_that_big" | null;
};

const MOTIVO: Record<NonNullable<Ricerca["reason"]>, { titolo: string; spiegazione: string }> = {
  venue_closed: {
    titolo: "Il locale è chiuso a quest'ora",
    spiegazione:
      "Fuori dai turni di servizio non si può accomodare nessuno. Se il servizio è aperto, controlla i turni in Impostazioni.",
  },
  shift_full: {
    titolo: "Il turno è al completo",
    spiegazione:
      "I coperti di questo turno sono esauriti: non è un problema di tavoli. Metti la persona in lista d'attesa e accomodala appena un tavolo si libera.",
  },
  all_busy: {
    titolo: "Nessun tavolo libero adesso",
    spiegazione:
      "Tutti i tavoli abbastanza grandi sono occupati. Mettili in lista d'attesa: Tavolo ti avvisa appena uno si libera.",
  },
  no_table_that_big: {
    titolo: "Nessun tavolo di questa misura",
    spiegazione:
      "Non è che siano occupati: un tavolo così grande non c'è. Per un gruppo del genere si uniscono più tavoli, dalla scheda della prenotazione in Servizio.",
  },
};

/** Quante tessere si vedono prima di «Altri tavoli». */
const PRIMI_TAVOLI = 6;

/** Il verde dell'azione: quello del guscio, con un ripiego fuori dal guscio. */
const VERDE = "var(--vi-verde,#2c5545)";

/**
 * Accomodare un walk-in in due tocchi: quante persone, «Accomoda».
 *
 * Prima bisognava aprire «nuova prenotazione» e compilare un form pensato per
 * chi prenota al telefono — nome, cognome, email, data, ora, durata, fonte —
 * con una persona in piedi davanti che aspetta.
 *
 * 16 nov 2026, ripensato per il cameriere col telefono in una mano: tasti
 * grandi da 1 a 8 (prima un contatore −/+ con tre scorciatoie piccole), il
 * tavolo più adatto già scelto e segnato «Consigliato», il nome nascosto
 * dietro «Aggiungi un nome», e un solo pulsante grande che dice dove si
 * accomoda. Dopo, un attimo di conferma: un foglio che sparisce e basta non
 * dice se è andata.
 *
 * Poi diviso in due passi, una scelta alla volta: prima solo le persone (tasti
 * più grandi, un tocco e si va avanti), poi il tavolo. Numeri e tavoli sulla
 * stessa schermata confondevano chi ha fretta. Sul telefono la finestra sta al
 * centro, non in fondo: i tasti bassi erano scomodi. Da 1 a 8 un tasto per
 * numero; per i gruppi più grandi «Più di 8» apre un selettore − 8 +, e
 * toccando il numero lo si scrive direttamente. Poi tavoli più grandi (due per
 * riga, i primi sei e gli altri a richiesta) e il nome in un terzo passo,
 * facoltativo: toccare un tavolo porta lì.
 */
export function WalkInDialog({
  open,
  onOpenChange,
  onSeated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeated?: () => void;
}) {
  const router = useRouter();
  const [partySize, setPartySize] = useState(2);
  const [passo, setPasso] = useState<"persone" | "tavolo" | "nome">("persone");
  const [tuttiITavoli, setTuttiITavoli] = useState(false);
  const [scrivi, setScrivi] = useState(false);
  const [numeroScritto, setNumeroScritto] = useState("");
  const [ricerca, setRicerca] = useState<Ricerca | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [ospite, setOspite] = useState<OspiteTrovato | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  // I tavoli si aggiornano al cambio del numero di persone: sono i due dati
  // legati fra loro, e chiedere di premere "cerca" sarebbe un tocco in più.
  // Ogni apertura riparte dalle persone.
  useEffect(() => {
    if (open) {
      setPasso("persone");
      setScrivi(false);
      setGuestName("");
      setOspite(null);
    }
  }, [open]);

  // Dal nome si torna ai tavoli senza rifare la ricerca: la scelta resta.
  const cercaTavoli = open && passo !== "persone";

  useEffect(() => {
    if (!cercaTavoli) return;
    let annullato = false;
    setRicerca(null);
    setSelected(null);
    setTuttiITavoli(false);
    setError(null);

    fetch(`/api/tables/free?partySize=${partySize}`)
      .then(async (res) => {
        if (annullato) return;
        if (!res.ok) {
          setError(await readApiError(res, "Non siamo riusciti a leggere i tavoli liberi."));
          setRicerca({ tables: [], reason: null });
          return;
        }
        const data: Ricerca = await res.json();
        setRicerca(data);
        if (data.tables.length > 0) setSelected(data.tables[0].tableId);
      })
      .catch(() => {
        if (!annullato) {
          setError("Non siamo riusciti a leggere i tavoli liberi.");
          setRicerca({ tables: [], reason: null });
        }
      });

    return () => {
      annullato = true;
    };
  }, [cercaTavoli, partySize]);

  const scelto = ricerca?.tables.find((t) => t.tableId === selected) ?? null;
  const persone = `${partySize} ${partySize === 1 ? "persona" : "persone"}`;

  const scritto = Number.parseInt(numeroScritto, 10);
  const scrittoValido = Number.isInteger(scritto) && scritto >= 1 && scritto <= 50;

  /** −/+ partono dal numero scritto, o da 8 se il campo è vuoto. */
  function cambiaDi(d: number) {
    const base = scrittoValido ? scritto : 8;
    setNumeroScritto(String(Math.min(50, Math.max(1, base + d))));
  }

  function scegliPersone(n: number) {
    setPartySize(n);
    setPasso("tavolo");
  }

  function scegliTavolo(id: string) {
    setSelected(id);
    setPasso("nome");
  }

  function tornaAllePersone() {
    // Un gruppo grande torna al numero scritto, non ai tasti.
    setScrivi(partySize > 8);
    setNumeroScritto(partySize > 8 ? String(partySize) : "");
    setPasso("persone");
  }
  const motivo = ricerca?.reason ? MOTIVO[ricerca.reason] : null;
  const versoLista = ricerca?.reason === "shift_full" || ricerca?.reason === "all_busy";

  async function accomoda() {
    if (!scelto) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/walk-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Scelto dalla tendina: si collega alla sua scheda. Scritto e basta:
      // persona nuova, il server le apre una scheda.
      body: JSON.stringify({
        partySize,
        tableId: scelto.tableId,
        guestId: ospite?.id ?? null,
        guestName: ospite ? null : guestName.trim() || null,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad accomodare il walk-in. Riprova."));
      return;
    }

    setFatto(`${scelto.label} · ${persone}`);
    window.setTimeout(() => {
      setFatto(null);
      setGuestName("");
      setOspite(null);
      setPartySize(2);
      onOpenChange(false);
      onSeated ? onSeated() : router.refresh();
    }, 1100);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent centrata className="sm:max-w-lg">
        {fatto ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
            <span className="grid h-16 w-16 place-items-center rounded-full text-white" style={{ background: VERDE }}>
              <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden="true" />
            </span>
            <DialogTitle className="text-xl">Accomodati</DialogTitle>
            <DialogDescription className="text-base">{fatto}</DialogDescription>
          </div>
        ) : (
          <>
            {passo === "persone" ? (
              <>
                <DialogHeader>
                  <DialogTitle>Walk-in</DialogTitle>
                  <DialogDescription>Quanti sono?</DialogDescription>
                </DialogHeader>

                {scrivi ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (scrittoValido) scegliPersone(scritto);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 w-16 shrink-0 rounded-full border-2 border-foreground/15"
                        aria-label="Una persona in meno"
                        disabled={scrittoValido && scritto <= 1}
                        onClick={() => cambiaDi(-1)}
                      >
                        <Minus className="h-6 w-6" aria-hidden="true" />
                      </Button>
                      {/* Il numero è anche un campo: toccarlo fa scrivere,
                          più veloce di venti tocchi su +. */}
                      <Label htmlFor="wi-quanti" className="sr-only">
                        Quante persone?
                      </Label>
                      <Input
                        id="wi-quanti"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={2}
                        value={numeroScritto}
                        onChange={(e) => setNumeroScritto(e.target.value.replace(/\D/g, ""))}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-16 min-w-0 flex-1 border-transparent bg-foreground/[0.05] text-center font-mono text-4xl tabular-nums"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-16 w-16 shrink-0 rounded-full border-2 border-foreground/15"
                        aria-label="Una persona in più"
                        disabled={scrittoValido && scritto >= 50}
                        onClick={() => cambiaDi(1)}
                      >
                        <Plus className="h-6 w-6" aria-hidden="true" />
                      </Button>
                    </div>
                    <Button
                      type="submit"
                      variant="accent"
                      className="h-14 w-full rounded-full text-base"
                      disabled={!scrittoValido}
                    >
                      {scrittoValido ? `Avanti · ${scritto} persone` : "Avanti"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setScrivi(false)}
                      className="tocco-comodo mx-auto flex min-h-[44px] items-center gap-1 text-sm font-medium text-muted-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      Torna ai numeri
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="grid grid-cols-4 gap-3" role="group" aria-label="Persone">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <TastoNumero key={n} attivo={partySize === n} onClick={() => scegliPersone(n)}>
                          {n}
                        </TastoNumero>
                      ))}
                    </div>
                    {/* Il gruppo grande è raro: sta in fondo, e si scrive. */}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-14 w-full rounded-full border-2 border-foreground/15 text-base"
                      onClick={() => {
                        setNumeroScritto("8");
                        setScrivi(true);
                      }}
                    >
                      Più di 8
                    </Button>
                  </>
                )}
              </>
            ) : passo === "tavolo" ? (
              <>
                <DialogHeader>
                  <DialogTitle>Walk-in</DialogTitle>
                  <DialogDescription>Il tavolo migliore è già scelto.</DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                  {/* Il numero scelto resta in vista: toccarlo torna alle persone. */}
                  <button
                    type="button"
                    onClick={tornaAllePersone}
                    aria-label={`${persone}, cambia`}
                    className="tocco-comodo -ml-1 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-foreground/[0.07] py-1 pl-2 pr-4 text-base font-medium"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    {persone}
                  </button>

                  <section className="space-y-2" aria-labelledby="wi-tavolo">
                    <p id="wi-tavolo" className="t-etichetta text-sm text-muted-foreground">
                      Tavolo
                    </p>
                    {ricerca === null ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Cerco i tavoli liberi…
                      </div>
                    ) : ricerca.tables.length === 0 ? (
                      <div className="rounded-2xl bg-foreground/[0.05] p-4">
                        <p className="font-medium">{motivo?.titolo ?? "Nessun tavolo disponibile"}</p>
                        {motivo && <p className="mt-1 text-sm text-muted-foreground">{motivo.spiegazione}</p>}
                        {versoLista && (
                          <Button asChild variant="outline" className="mt-3 h-12 w-full rounded-full">
                            <Link href="/waitlist" onClick={() => onOpenChange(false)}>
                              <ListPlus className="mr-2 h-5 w-5" aria-hidden="true" />
                              Metti in lista d&apos;attesa
                            </Link>
                          </Button>
                        )}
                      </div>
                    ) : (
                      /* Il primo è il più adatto (il più piccolo che basta): è già
                         scelto, e lo dice. Toccare un altro tavolo lo cambia.
                         I tavoli stanno sotto la loro sala, detta una volta sola:
                         ripetuta su ogni tessera era rumore, e tagliata. */
                      <div className="space-y-3">
                        {perSala(tuttiITavoli ? ricerca.tables : ricerca.tables.slice(0, PRIMI_TAVOLI)).map(([sala, tavoli]) => (
                          <div key={sala ?? "-"} className="space-y-1.5">
                            {sala && <p className="px-1 text-xs font-medium text-muted-foreground">{sala}</p>}
                            <ul className="grid grid-cols-2 gap-3 pt-3">
                              {tavoli.map((t) => {
                                const attivo = selected === t.tableId;
                                const consigliato = t.tableId === ricerca.tables[0].tableId;
                                return (
                                  <li key={t.tableId}>
                                    <button
                                      type="button"
                                      onClick={() => scegliTavolo(t.tableId)}
                                      aria-pressed={attivo}
                                      aria-label={`${t.label}, ${t.seats} posti${consigliato ? ", consigliato" : ""}`}
                                      className={cn(
                                        "relative flex h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center transition-colors active:scale-[0.97]",
                                        !attivo && "border-border bg-foreground/[0.03]",
                                      )}
                                      style={
                                        attivo
                                          ? { borderColor: VERDE, background: `color-mix(in srgb, ${VERDE} 10%, transparent)` }
                                          : undefined
                                      }
                                    >
                                      {consigliato && (
                                        <span
                                          className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
                                          style={{ background: VERDE }}
                                        >
                                          Consigliato
                                        </span>
                                      )}
                                      {attivo && (
                                        <span
                                          className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full text-white"
                                          style={{ background: VERDE }}
                                        >
                                          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                                        </span>
                                      )}
                                      <span className="text-3xl font-semibold leading-none">{t.label}</span>
                                      <span className="text-base text-muted-foreground">{t.seats} posti</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                        {/* Tessere grandi vogliono dire poche per volta: i
                            primi sono i più adatti, gli altri a richiesta. */}
                        {!tuttiITavoli && ricerca.tables.length > PRIMI_TAVOLI && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-12 w-full rounded-full text-base text-muted-foreground"
                            onClick={() => setTuttiITavoli(true)}
                          >
                            Altri tavoli ({ricerca.tables.length - PRIMI_TAVOLI})
                          </Button>
                        )}
                      </div>
                    )}
                  </section>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                  {/* Sul telefono si torna indietro dal numero in alto: in fondo
                      resta solo il gesto che conta. */}
                  <Button type="button" variant="ghost" className="max-md:hidden" onClick={tornaAllePersone}>
                    Indietro
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    className="max-md:h-14 max-md:w-full max-md:rounded-full max-md:text-base"
                    disabled={!scelto}
                    onClick={() => setPasso("nome")}
                  >
                    {scelto ? `Avanti · ${scelto.label}` : "Avanti"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Walk-in</DialogTitle>
                  <DialogDescription>Scrivi nome e cognome: se è già venuto, compare qui sotto.</DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                  {/* Tavolo e persone restano in vista: toccarli torna ai tavoli. */}
                  <button
                    type="button"
                    onClick={() => setPasso("tavolo")}
                    aria-label={`${scelto?.label ?? "Tavolo"}, ${persone}, cambia tavolo`}
                    className="tocco-comodo -ml-1 inline-flex min-h-[44px] items-center gap-1 rounded-full bg-foreground/[0.07] py-1 pl-2 pr-4 text-base font-medium"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    {scelto?.label} · {persone}
                  </button>

                  <CercaOspite
                    testo={guestName}
                    onTesto={setGuestName}
                    ospite={ospite}
                    onOspite={setOspite}
                    onInvio={() => {
                      if (scelto && !submitting) accomoda();
                    }}
                  />

                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                  <Button type="button" variant="ghost" className="max-md:hidden" onClick={() => setPasso("tavolo")}>
                    Indietro
                  </Button>
                  <Button
                    type="button"
                    variant="accent"
                    className="max-md:h-14 max-md:w-full max-md:rounded-full max-md:text-base"
                    disabled={!scelto || submitting}
                    onClick={accomoda}
                  >
                    {submitting ? "Accomodo…" : scelto ? `Accomoda · ${scelto.label}` : "Accomoda"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** I tavoli divisi per sala, nell'ordine in cui arrivano (il più adatto per primo). */
function perSala(tavoli: FreeTable[]): [string | null, FreeTable[]][] {
  const gruppi = new Map<string | null, FreeTable[]>();
  for (const t of tavoli) {
    const g = gruppi.get(t.roomName);
    if (g) g.push(t);
    else gruppi.set(t.roomName, [t]);
  }
  return [...gruppi.entries()];
}

function TastoNumero({
  attivo,
  onClick,
  children,
}: {
  attivo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attivo}
      className={cn(
        "h-20 rounded-2xl font-mono text-3xl tabular-nums transition-colors active:scale-[0.96]",
        attivo ? "text-white" : "bg-foreground/[0.07] text-foreground hover:bg-foreground/10",
      )}
      style={attivo ? { background: VERDE } : undefined}
    >
      {children}
    </button>
  );
}
