"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ListPlus, Loader2, Minus, Plus, UserPlus } from "lucide-react";
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
  const [ricerca, setRicerca] = useState<Ricerca | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [conNome, setConNome] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  // I tavoli si aggiornano al cambio del numero di persone: sono i due dati
  // legati fra loro, e chiedere di premere "cerca" sarebbe un tocco in più.
  useEffect(() => {
    if (!open) return;
    let annullato = false;
    setRicerca(null);
    setSelected(null);
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
  }, [open, partySize]);

  const scelto = ricerca?.tables.find((t) => t.tableId === selected) ?? null;
  /* Fino a 7 un tasto per numero; da 8 in su il tasto «8+» e un contatore. */
  const gruppoGrande = partySize >= 8;
  const motivo = ricerca?.reason ? MOTIVO[ricerca.reason] : null;
  const versoLista = ricerca?.reason === "shift_full" || ricerca?.reason === "all_busy";

  async function accomoda() {
    if (!scelto) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/walk-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ partySize, tableId: scelto.tableId, guestName: guestName.trim() || null }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad accomodare il walk-in. Riprova."));
      return;
    }

    setFatto(`${scelto.label} · ${partySize} ${partySize === 1 ? "persona" : "persone"}`);
    window.setTimeout(() => {
      setFatto(null);
      setGuestName("");
      setConNome(false);
      setPartySize(2);
      onOpenChange(false);
      onSeated ? onSeated() : router.refresh();
    }, 1100);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
            <DialogHeader>
              <DialogTitle>Walk-in</DialogTitle>
              <DialogDescription>Quanti sono? Il tavolo migliore è già scelto.</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <section className="space-y-2" aria-labelledby="wi-persone">
                <p id="wi-persone" className="t-etichetta text-sm text-muted-foreground">
                  Persone
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <TastoNumero key={n} attivo={partySize === n} onClick={() => setPartySize(n)}>
                      {n}
                    </TastoNumero>
                  ))}
                  <TastoNumero attivo={gruppoGrande} onClick={() => !gruppoGrande && setPartySize(8)}>
                    8+
                  </TastoNumero>
                </div>
                {gruppoGrande && (
                  <div className="flex items-center justify-center gap-4 pt-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-12 w-12 rounded-full"
                      aria-label="Una persona in meno"
                      onClick={() => setPartySize((n) => Math.max(1, n - 1))}
                    >
                      <Minus className="h-5 w-5" aria-hidden="true" />
                    </Button>
                    <span className="min-w-[3ch] text-center font-mono text-3xl tabular-nums" aria-live="polite">
                      {partySize}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-12 w-12 rounded-full"
                      aria-label="Una persona in più"
                      onClick={() => setPartySize((n) => Math.min(50, n + 1))}
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </section>

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
                  <div className="max-h-72 space-y-3 overflow-y-auto p-0.5">
                    {perSala(ricerca.tables).map(([sala, tavoli]) => (
                      <div key={sala ?? "-"} className="space-y-1.5">
                        {sala && <p className="px-1 text-xs font-medium text-muted-foreground">{sala}</p>}
                        <ul className="grid grid-cols-3 gap-2 pt-1.5">
                          {tavoli.map((t) => {
                            const attivo = selected === t.tableId;
                            const consigliato = t.tableId === ricerca.tables[0].tableId;
                            return (
                              <li key={t.tableId}>
                                <button
                                  type="button"
                                  onClick={() => setSelected(t.tableId)}
                                  aria-pressed={attivo}
                                  aria-label={`${t.label}, ${t.seats} posti${consigliato ? ", consigliato" : ""}`}
                                  className={cn(
                                    "relative flex h-[76px] w-full flex-col items-center justify-center rounded-2xl border-2 px-2 text-center transition-colors active:scale-[0.97]",
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
                                      className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                                      style={{ background: VERDE }}
                                    >
                                      Consigliato
                                    </span>
                                  )}
                                  {attivo && (
                                    <span
                                      className="absolute bottom-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full text-white"
                                      style={{ background: VERDE }}
                                    >
                                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                                    </span>
                                  )}
                                  <span className="text-xl font-semibold leading-tight">{t.label}</span>
                                  <span className="text-sm text-muted-foreground">{t.seats} posti</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Il nome non si chiede: si aggiunge, se lo dicono. */}
              {conNome ? (
                <div className="space-y-1.5">
                  <Label htmlFor="wi-name">Nome</Label>
                  <Input
                    id="wi-name"
                    autoFocus
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Es. Rossi"
                    className="h-12"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConNome(true)}
                  className="tocco-comodo inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-muted-foreground"
                >
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  Aggiungi un nome
                </button>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              {/* Sul telefono si chiude con la X in alto: in fondo resta
                  solo il gesto che conta. */}
              <Button type="button" variant="ghost" className="max-md:hidden" onClick={() => onOpenChange(false)}>
                Annulla
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
        "h-14 rounded-2xl font-mono text-xl tabular-nums transition-colors active:scale-[0.96]",
        attivo ? "text-white" : "bg-foreground/[0.07] text-foreground hover:bg-foreground/10",
      )}
      style={attivo ? { background: VERDE } : undefined}
    >
      {children}
    </button>
  );
}
