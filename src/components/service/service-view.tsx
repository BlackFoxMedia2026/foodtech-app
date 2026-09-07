"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ListOrdered, RefreshCw, Timer, UserCheck, Users, UtensilsCrossed } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { ServiceSnapshot } from "@/server/service";
import { ServiceBookingCard } from "@/components/service/service-booking-card";
import { ServiceWaitlistCard } from "@/components/service/service-waitlist-card";
import { ServiceSwitch } from "@/components/service/service-switch";
import { ServiceInsights } from "@/components/service/service-insights";
import type { ServiceInsight } from "@/server/service-intelligence";

/** Ogni quanto la schermata si riaggiorna da sola. */
const REFRESH_MS = 30_000;

type Colonna = "adesso" | "prossimi" | "attesa";

/**
 * La schermata del servizio.
 *
 * Tre scelte che vengono dall'uso reale, non dal disegno:
 *
 * - **Si aggiorna da sola** ogni trenta secondi. Chi la tiene aperta per tre
 *   ore non deve ricordarsi di ricaricare, e un dato vecchio di venti minuti
 *   su questa schermata è peggio di nessun dato.
 * - **Su tablet tre colonne, su telefono tre schede.** Comprimere tre colonne
 *   in 390 px produce tre strisce illeggibili; meglio una cosa per volta, con
 *   i numeri sempre in testa.
 * - **I numeri in testa sono sempre visibili**, anche cambiando scheda:
 *   quanti sono dentro e quanti aspettano è la domanda che si rifà ogni due
 *   minuti.
 */
export function ServiceView({
  initial,
  insights,
  venueName,
  canManage,
}: {
  initial: ServiceSnapshot;
  insights: ServiceInsight[];
  venueName: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [window_, setWindow] = useState(60);
  const [colonna, setColonna] = useState<Colonna>("adesso");
  const [aggiornando, setAggiornando] = useState(false);
  // Nullo fino al primo aggiornamento: un orologio reso durante il rendering
  // sul server produce un'ora diversa da quella del browser, React se ne
  // accorge e sostituisce l'HTML — un errore di idratazione per un dettaglio
  // che prima del montaggio non ha nemmeno senso mostrare.
  const [ultimo, setUltimo] = useState<Date | null>(null);
  const inFlight = useRef(false);

  const aggiorna = useCallback(
    async (finestra = window_) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setAggiornando(true);
      try {
        const res = await fetch(`/api/service?window=${finestra}`, { cache: "no-store" });
        if (res.ok) {
          setSnapshot(await res.json());
          setUltimo(new Date());
        }
      } catch {
        // Una rete che salta per un istante non deve svuotare la schermata:
        // resta l'ultima fotografia buona, con l'ora a cui è stata presa.
      } finally {
        inFlight.current = false;
        setAggiornando(false);
      }
    },
    [window_],
  );

  useEffect(() => {
    const id = setInterval(() => aggiorna(), REFRESH_MS);
    return () => clearInterval(id);
  }, [aggiorna]);

  // Tornando sulla scheda dopo una pausa, la prima cosa da fare è ricaricare:
  // il servizio è andato avanti senza di noi.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") aggiorna();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [aggiorna]);

  const dopoAzione = useCallback(() => {
    aggiorna();
    // Anche il resto dell'applicazione (Sala, Panoramica) è cambiato.
    router.refresh();
  }, [aggiorna, router]);

  const c = snapshot.counters;

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{venueName}</p>
          <h1 className="text-display text-3xl">Servizio</h1>
        </div>

        <div className="flex items-center gap-3">
          <ServiceSwitch />
          {ultimo && (
            <span className="hidden text-xs text-tertiary-foreground sm:inline">
              aggiornato alle{" "}
              {ultimo.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => aggiorna()}
            aria-label="Aggiorna adesso"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className={cn("h-4 w-4", aggiornando && "animate-spin")} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* I numeri restano in testa in ogni scheda. */}
      {/* Tre per riga anche su telefono: sei riquadri in due colonne
          occupavano mezzo schermo prima di far vedere una sola prenotazione, e
          durante il servizio le prenotazioni contano più dei numeri. */}
      <section className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        <Numero icona={Users} etichetta="In sala" valore={c.copertiPresenti} nota="coperti" />
        <Numero
          icona={UtensilsCrossed}
          etichetta="Tavoli"
          valore={`${c.tavoliOccupati}/${c.tavoliTotali}`}
          nota="occupati"
        />
        <Numero icona={Clock} etichetta="In arrivo" valore={c.inArrivo} nota={`entro ${window_} min`} />
        <Numero icona={Timer} etichetta="In ritardo" valore={c.inRitardo} allarme={c.inRitardo > 0} />
        <Numero icona={ListOrdered} etichetta="In attesa" valore={c.personeInAttesa} nota="persone" />
        <Numero icona={UserCheck} etichetta="Walk-in" valore={c.walkInOggi} nota="oggi" />
      </section>

      {insights.length > 0 && (
        <section aria-label="Cosa sta per andare storto" className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Da tenere d&apos;occhio
          </h2>
          <ServiceInsights insights={insights} />
        </section>
      )}

      {/* Su telefono: una colonna per volta. */}
      <div className="flex gap-1 lg:hidden" role="tablist" aria-label="Aree del servizio">
        {(
          [
            ["adesso", "Adesso", snapshot.seated.length + snapshot.arrived.length],
            ["prossimi", "Prossimi", snapshot.next.length],
            ["attesa", "Attesa", snapshot.waitlist.length],
          ] as [Colonna, string, number][]
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={colonna === key}
            onClick={() => setColonna(key)}
            className={cn(
              "flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
              colonna === key ? "bg-cream text-clay-ink" : "bg-current/10 text-muted-foreground",
            )}
          >
            {label}
            <span className="text-xs opacity-70">{n}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ADESSO */}
        <Colonna1
          titolo="Adesso"
          visibile={colonna === "adesso"}
          conteggio={snapshot.seated.length + snapshot.arrived.length}
        >
          {snapshot.late.length > 0 && (
            <Gruppo titolo={`In ritardo · ${snapshot.late.length}`} allarme>
              {snapshot.late.map((b) => (
                <ServiceBookingCard
                  key={b.id}
                  booking={b}
                  timezone={snapshot.timezone}
                  currency={snapshot.currency}
                  canManage={canManage}
                  onChanged={dopoAzione}
                />
              ))}
            </Gruppo>
          )}

          {snapshot.arrived.length > 0 && (
            <Gruppo titolo={`Arrivati, da accomodare · ${snapshot.arrived.length}`}>
              {snapshot.arrived.map((b) => (
                <ServiceBookingCard
                  key={b.id}
                  booking={b}
                  timezone={snapshot.timezone}
                  currency={snapshot.currency}
                  canManage={canManage}
                  onChanged={dopoAzione}
                />
              ))}
            </Gruppo>
          )}

          {snapshot.freeingSoon.length > 0 && (
            <Gruppo titolo={`In chiusura · ${snapshot.freeingSoon.length}`}>
              {snapshot.freeingSoon.map((b) => (
                <ServiceBookingCard
                  key={b.id}
                  booking={b}
                  timezone={snapshot.timezone}
                  currency={snapshot.currency}
                  canManage={canManage}
                  onChanged={dopoAzione}
                />
              ))}
            </Gruppo>
          )}

          {snapshot.seated.filter((b) => !snapshot.freeingSoon.some((f) => f.id === b.id)).length > 0 && (
            <Gruppo titolo={`Seduti · ${snapshot.seated.length}`}>
              {snapshot.seated
                .filter((b) => !snapshot.freeingSoon.some((f) => f.id === b.id))
                .map((b) => (
                  <ServiceBookingCard
                    key={b.id}
                    booking={b}
                    timezone={snapshot.timezone}
                  currency={snapshot.currency}
                    canManage={canManage}
                    onChanged={dopoAzione}
                  />
                ))}
            </Gruppo>
          )}

          {snapshot.seated.length === 0 && snapshot.arrived.length === 0 && snapshot.late.length === 0 && (
            <EmptyState icon={Users} title="Sala vuota" compact>
              Nessuno è ancora seduto. Appena il primo ospite arriva, lo segni qui con un tocco e la sala
              si aggiorna da sola.
            </EmptyState>
          )}
        </Colonna1>

        {/* PROSSIMI */}
        <Colonna1 titolo="Prossimi arrivi" visibile={colonna === "prossimi"} conteggio={snapshot.next.length}>
          <div className="flex gap-1">
            {[30, 60, 90].map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={window_ === m}
                onClick={() => {
                  setWindow(m);
                  aggiorna(m);
                }}
                className={cn(
                  "min-h-[36px] rounded-full px-3 text-sm transition-colors",
                  window_ === m ? "bg-cream text-clay-ink" : "bg-current/10 text-muted-foreground",
                )}
              >
                {m} min
              </button>
            ))}
          </div>

          {snapshot.next.length === 0 ? (
            <EmptyState icon={Clock} title="Nessun arrivo in vista" compact>
              Nei prossimi {window_} minuti non è previsto nessuno. Allarga la finestra per guardare più
              avanti.
            </EmptyState>
          ) : (
            snapshot.next.map((b) => (
              <ServiceBookingCard
                key={b.id}
                booking={b}
                timezone={snapshot.timezone}
                currency={snapshot.currency}
                canManage={canManage}
                onChanged={dopoAzione}
              />
            ))
          )}
        </Colonna1>

        {/* ATTESA */}
        <Colonna1 titolo="Lista d'attesa" visibile={colonna === "attesa"} conteggio={snapshot.waitlist.length}>
          {snapshot.waitlist.length === 0 ? (
            <EmptyState icon={ListOrdered} title="Nessuno in attesa" compact>
              Quando il locale è pieno, aggiungi qui chi aspetta: appena un tavolo si libera Tavolo ti dice
              chi ci sta.
            </EmptyState>
          ) : (
            snapshot.waitlist.map((e, i) => (
              <ServiceWaitlistCard
                key={e.id}
                entry={e}
                posizione={i + 1}
                canManage={canManage}
                onChanged={dopoAzione}
              />
            ))
          )}
        </Colonna1>
      </div>
    </div>
  );
}

function Colonna1({
  titolo,
  conteggio,
  visibile,
  children,
}: {
  titolo: string;
  conteggio: number;
  visibile: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-3", !visibile && "hidden lg:block")} aria-label={titolo}>
      <h2 className="hidden items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground lg:flex">
        {titolo}
        <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">{conteggio}</span>
      </h2>
      {children}
    </section>
  );
}

function Gruppo({
  titolo,
  allarme = false,
  children,
}: {
  titolo: string;
  allarme?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className={cn("text-xs font-medium", allarme ? "text-accent" : "text-tertiary-foreground")}>
        {titolo}
      </p>
      {children}
    </div>
  );
}

function Numero({
  icona: Icona,
  etichetta,
  valore,
  nota,
  allarme = false,
}: {
  icona: typeof Users;
  etichetta: string;
  valore: number | string;
  nota?: string;
  allarme?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface rounded-md border px-2.5 py-2 lg:px-3 lg:py-3",
        allarme ? "border-accent/60" : "border-border",
      )}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground lg:gap-1.5 lg:text-[11px] lg:tracking-widest">
        <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{etichetta}</span>
      </div>
      <p className={cn("mt-0.5 text-display text-xl lg:text-2xl", allarme && "text-accent")}>{valore}</p>
      {nota && <p className="truncate text-[10px] text-tertiary-foreground lg:text-[11px]">{nota}</p>}
    </div>
  );
}
