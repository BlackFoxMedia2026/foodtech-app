"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type FreeTable = { tableId: string; label: string; seats: number; roomId: string | null; roomName: string | null };
/** Un'unione prevista, come la restituisce `/api/table-combinations`. */
type UnionePrevista = { id: string; label: string | null; tableIds: string[]; posti: number; nomi: string };
type Ricerca = {
  tables: FreeTable[];
  reason: "venue_closed" | "shift_full" | "all_busy" | "no_table_that_big" | null;
};

const MOTIVO: Record<NonNullable<Ricerca["reason"]>, string> = {
  venue_closed: "Il locale è chiuso a quest'ora: fuori dal servizio non si assegnano tavoli.",
  shift_full:
    "Il turno è al completo. Puoi comunque forzare l'assegnazione dalla Sala, se il locale decide di accettare.",
  all_busy: "Tutti i tavoli sono occupati in questo momento.",
  no_table_that_big: "Nessun tavolo di questa misura, e nessuno libero da unire adesso.",
};

/**
 * Scegliere il tavolo — o unirne due, che durante un servizio è la stessa
 * operazione.
 *
 * Mostra **solo i tavoli davvero liberi adesso** — glielo chiede il motore di
 * disponibilità — perché durante il servizio non si ha tempo di scoprire dopo
 * che quel tavolo era già occupato.
 *
 * Un tocco solo assegna, due o più uniscono: non ci sono due schermate né una
 * modalità da scegliere prima, perché chi ha davanti dieci persone in piedi
 * non deve decidere in quale menu andare. I posti si sommano sotto gli occhi, e
 * se non bastano si può procedere comunque scrivendo il motivo — come per la
 * forzatura della disponibilità. L'elenco contiene anche i tavoli troppo
 * piccoli da soli: sono esattamente quelli con cui si fa una tavolata.
 */
export function TablePickerDialog({
  open,
  onOpenChange,
  bookingId,
  partySize,
  startsAt,
  titolo,
  seatAfter,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  partySize: number;
  /**
   * L'ora della prenotazione, non «adesso».
   *
   * Prima si chiedevano i tavoli liberi in questo istante: per una
   * prenotazione delle 19:30 aperta alle 17:00 — fra pranzo e cena — la
   * risposta era «il locale è chiuso», e non si poteva assegnare niente in
   * anticipo. La domanda giusta è «chi è libero **a quell'ora**».
   */
  startsAt: string;
  titolo: string;
  /** Dopo l'assegnazione segna anche «seduto». */
  seatAfter: boolean;
  onDone: () => void;
}) {
  const [ricerca, setRicerca] = useState<Ricerca | null>(null);
  const [scelti, setScelti] = useState<string[]>([]);
  const [unioni, setUnioni] = useState<UnionePrevista[]>([]);
  const [motivo, setMotivo] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let annullato = false;
    setRicerca(null);
    setScelti([]);
    setMotivo("");
    setError(null);

    // Le unioni previste si leggono insieme ai tavoli liberi: senza, la
    // proposta per un gruppo grande arriverebbe dopo, e il tocco dell'utente
    // nel frattempo verrebbe sovrascritto.
    const unioniPromessa = fetch("/api/table-combinations")
      .then(async (r) => (r.ok ? ((await r.json()) as UnionePrevista[]) : []))
      .catch(() => [] as UnionePrevista[]);

    fetch(`/api/tables/free?partySize=${partySize}&includeSmaller=1&at=${encodeURIComponent(startsAt)}`)
      .then(async (res) => {
        if (annullato) return;
        if (!res.ok) {
          setError(await readApiError(res, "Non siamo riusciti a leggere i tavoli liberi."));
          setRicerca({ tables: [], reason: null });
          return;
        }
        const data: Ricerca = await res.json();
        const tutteLeUnioni = await unioniPromessa;
        if (annullato) return;
        setRicerca(data);
        setUnioni(tutteLeUnioni);
        // Si propone il primo tavolo che basta da solo, se esiste: è il caso
        // normale, e un tocco in meno durante il servizio conta. Se nessuno
        // basta da solo, la più piccola unione prevista che basta.
        const daSolo = data.tables.find((t) => t.seats >= partySize);
        const unioneMigliore = unioniUtili(tutteLeUnioni, data.tables, partySize)[0];
        if (daSolo) setScelti([daSolo.tableId]);
        else if (unioneMigliore) setScelti(unioneMigliore.tableIds);
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
  }, [open, partySize, startsAt]);

  const tavoli = ricerca?.tables ?? [];
  const unioniLibere = unioniUtili(unioni, tavoli, partySize);
  const selezionati = tavoli.filter((t) => scelti.includes(t.tableId));
  const posti = selezionati.reduce((s, t) => s + t.seats, 0);
  const bastano = posti >= partySize;
  const unione = scelti.length > 1;
  const salaScelta = selezionati[0]?.roomId ?? null;
  // Una tavolata sta in una sala sola: dopo il primo tocco gli altri tavoli
  // della stessa sala restano scegliibili, gli altri no. Meglio impedire il
  // gesto che spiegare l'errore dopo.
  const bloccatoDaSala = (t: FreeTable) => scelti.length > 0 && !scelti.includes(t.tableId) && t.roomId !== salaScelta;

  function tocca(tableId: string) {
    setError(null);
    setScelti((prima) =>
      prima.includes(tableId) ? prima.filter((id) => id !== tableId) : [...prima, tableId],
    );
  }

  async function conferma() {
    if (scelti.length === 0) return;
    if (!bastano && !motivo.trim()) {
      setError("Scrivi il motivo: i posti scelti non bastano per questo gruppo.");
      return;
    }
    setInCorso(true);
    setError(null);

    const corpo = unione
      ? { tableIds: scelti, ...(bastano ? {} : { force: true, forceReason: motivo.trim() }) }
      // Il motivo va anche qui: prima lo chiedevamo e poi lo buttavamo via
      // sulla strada del tavolo singolo, e nel registro restava «forzata»
      // senza il perché — cioè senza la parte utile.
      : { tableId: scelti[0], ...(bastano ? {} : { force: true, forceReason: motivo.trim() }) };

    const assegna = await fetch(`/api/bookings/${bookingId}/${unione ? "combine-tables" : "assign-table"}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });

    if (!assegna.ok) {
      setInCorso(false);
      setError(
        await readApiError(
          assegna,
          unione ? "Non siamo riusciti a unire i tavoli. Riprova." : "Non siamo riusciti ad assegnare il tavolo. Riprova.",
        ),
      );
      return;
    }

    if (seatAfter) {
      const siedi = await fetch(`/api/bookings/${bookingId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "SEATED" }),
      });
      if (!siedi.ok) {
        setInCorso(false);
        // Il tavolo è stato assegnato: dirlo evita che si riprovi da capo.
        setError(
          await readApiError(siedi, "Tavolo assegnato, ma non siamo riusciti a segnare l'ospite come seduto."),
        );
        return;
      }
    }

    setInCorso(false);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>
            {partySize} {partySize === 1 ? "persona" : "persone"} · liberi a quell&apos;ora · tocca più tavoli
            per unirli
          </DialogDescription>
        </DialogHeader>

        {ricerca === null ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Cerco i tavoli liberi…
          </div>
        ) : tavoli.length === 0 ? (
          <EmptyState icon={Users} compact title="Nessun tavolo libero">
            {ricerca.reason ? MOTIVO[ricerca.reason] : null}
          </EmptyState>
        ) : (
          <>
            {/* Le unioni previste nell'editor della Sala: un tocco sceglie
                tutti i loro tavoli, e la conferma è quella di sempre. */}
            {unioniLibere.length > 0 && (
              <div className="space-y-1.5">
                <p className="t-etichetta">Unioni previste</p>
                <div className="flex flex-wrap gap-2">
                  {unioniLibere.map((u) => {
                    const scelta =
                      scelti.length === u.tableIds.length && u.tableIds.every((id) => scelti.includes(id));
                    return (
                      <button
                        key={u.id}
                        type="button"
                        aria-pressed={scelta}
                        onClick={() => {
                          setError(null);
                          setScelti(u.tableIds);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                          scelta ? "border-line bg-current/10" : "border-border hover:bg-current/5",
                        )}
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="font-medium">{u.label ?? u.nomi}</span>
                        <span className="text-muted-foreground">{u.posti} posti</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <ul className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {tavoli.map((t) => {
                const scelto = scelti.includes(t.tableId);
                const bloccato = bloccatoDaSala(t);
                return (
                  <li key={t.tableId}>
                    <button
                      type="button"
                      onClick={() => tocca(t.tableId)}
                      disabled={bloccato}
                      aria-pressed={scelto}
                      title={bloccato ? "Una tavolata sta in una sala sola" : undefined}
                      className={cn(
                        "flex min-h-[64px] w-full flex-col items-start justify-center rounded-md border px-3 py-2 text-left transition-colors",
                        scelto ? "border-line bg-current/10" : "border-border hover:bg-current/5",
                        bloccato && "cursor-not-allowed opacity-40 hover:bg-transparent",
                      )}
                    >
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.seats} posti</span>
                      {t.roomName && (
                        <span className="flex w-full items-center gap-1 t-nota">
                          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{t.roomName}</span>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* L'oro del tema (5,11 : 1) e non l'accento (3,32): su verde scuro
                un avvertimento in accento si legge peggio delle note grigie
                accanto. */}
            {scelti.length > 0 && (
              <p className={cn("text-sm", bastano ? "text-muted-foreground" : "text-accent-strong")}>
                {unione ? `${scelti.length} tavoli uniti: ` : ""}
                {posti} {posti === 1 ? "posto" : "posti"} per {partySize}{" "}
                {partySize === 1 ? "persona" : "persone"}
                {bastano ? "." : " — non bastano."}
              </p>
            )}

            {scelti.length > 0 && !bastano && (
              <div className="space-y-1.5">
                <Label htmlFor="motivo-tavolo">Perché lo fai comunque?</Label>
                <Input
                  id="motivo-tavolo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Es. si accontentano, restano poco"
                />
                <p className="t-nota">
                  Finisce nel registro con il tuo nome e l&apos;ora: serve a chi guarda dopo, non a controllarti.
                </p>
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Annulla
          </Button>
          <Button variant="accent" onClick={conferma} disabled={scelti.length === 0 || inCorso}>
            {inCorso
              ? "Un istante…"
              : unione
                ? `Unisci ${scelti.length} tavoli`
                : seatAfter
                  ? "Accomoda"
                  : "Assegna il tavolo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Le unioni previste che servono adesso: tutti i loro tavoli sono liberi a
 * quell'ora e insieme bastano per il gruppo. Dalla più piccola, perché
 * un'unione da dieci per sei persone toglie quattro posti alla serata.
 */
function unioniUtili(unioni: UnionePrevista[], liberi: FreeTable[], persone: number) {
  const idLiberi = new Set(liberi.map((t) => t.tableId));
  return unioni
    .filter((u) => u.posti >= persone && u.tableIds.every((id) => idLiberi.has(id)))
    .sort((a, b) => a.posti - b.posti);
}
