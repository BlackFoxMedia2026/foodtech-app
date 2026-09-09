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
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { CambiamentiRecenti } from "@/components/service/cambiamenti-recenti";

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
  // Scarica la fotografia. Il *quando* non è più affare di questo componente:
  // ci pensa `useServizioVivo`, che chiede al server ogni cinque secondi se
  // qualcosa è cambiato e chiama questa funzione solo se la risposta è sì.
  const scarica = useCallback(
    async (finestra = window_) => {
      const res = await fetch(`/api/service?window=${finestra}`, { cache: "no-store" });
      // Una rete che salta per un istante non deve svuotare la schermata:
      // resta l'ultima fotografia buona, con l'ora a cui è stata presa.
      if (res.ok) setSnapshot(await res.json());
    },
    [window_],
  );

  const { ultimo, aggiornando, aggiornaOra } = useServizioVivo(scarica);

  const aggiorna = useCallback(
    (finestra?: number) => (finestra === undefined ? aggiornaOra() : scarica(finestra)),
    [aggiornaOra, scarica],
  );

  const dopoAzione = useCallback(() => {
    aggiorna();
    // Anche il resto dell'applicazione (Sala, Panoramica) è cambiato.
    router.refresh();
  }, [aggiorna, router]);

  const c = snapshot.counters;

  return (
    /*
      Questa schermata non era mai stata convertita: la radice era un
      `flex flex-col` che cresce, e misurava zero solo perché il contenuto ci
      stava. Il 9 settembre, con un servizio vero in corso — sei avvisi, tavoli
      seduti, tre colonne piene — sforava di 49 px su una scrivania e di 600 su
      un telefono. Cioè cedeva **esattamente quando serve**, che è il modo
      peggiore di cedere.

      Misurare zero non è la stessa cosa che essere costruito per non scorrere.
    */
    <div className="schermo animate-fade-in gap-4">
      {/*
        L'intestazione qui è **compatta di proposito**, e non per gusto.

        «Servizio» in serif a tre righe di altezza è l'identità editoriale di
        Tavolo, e va benissimo in Panoramica o in Analytics — dove si legge.
        Qui si lavora: prima di questa modifica, fra titolo, sei riquadri e
        cinque avvisi, la prima colonna operativa cominciava a 850 px, cioè
        **sotto la piega** su un portatile. Ottanta pixel di titolo alle 21:30
        sono una prenotazione che non si vede.
        
        È la direzione C dell'audit visivo (*Premium Control Room*):
        l'identità resta dove si legge e cede il passo alla densità dove si
        lavora.
      */}
      <header className="fissa flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-semibold leading-none">Servizio</h1>
          <p className="t-etichetta">{venueName}</p>
        </div>

        <div className="flex items-center gap-3">
          <ServiceSwitch />
          {/*
            Chi ha cambiato cosa (§65).

            La schermata si aggiorna da sola, e il cambiamento appariva senza
            dire chi: due persone sullo stesso servizio da due tablet vedevano
            un tavolo assegnarsi da solo, e la seconda rifaceva il lavoro della
            prima o si fermava a chiedere. Adesso c'è scritto — e al posto
            dell'ora dell'ultimo aggiornamento, che era la stessa cosa detta
            senza informazione: «aggiornato alle 21:14» dice che il programma
            funziona, non cosa è successo.

            L'ora resta nel suggerimento, e quando non è cambiato niente torna
            la frase di prima.
          */}
          {snapshot.cambiamenti.length > 0 ? (
            <CambiamentiRecenti cambiamenti={snapshot.cambiamenti} ultimo={ultimo} />
          ) : (
            ultimo && (
              <span className="hidden t-nota sm:inline">
                aggiornato alle{" "}
                {ultimo.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )
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

      {/* Sul telefono, prima cosa fare e poi quanti: su 844 px di altezza,
          intestazione più sei riquadri spingevano il primo avviso sotto la
          piega, e in servizio si scorreva due schermate per sapere cosa fare.
          Su schermo largo l'ordine resta quello di prima: là ci sta tutto. */}
      {/*
        Su tablet ci stanno tutti e sei, e ci devono stare: a 820 px la fascia
        ne mostrava tre come su un telefono da 390, sprecando metà larghezza.
        Il tablet non è un telefono grande.
      */}
      <section className="fissa surface riquadro order-2 grid grid-cols-3 divide-x divide-border md:grid-cols-6 lg:order-1">
        <Numero
          icona={Users}
          etichetta="In sala"
          valore={c.copertiPresenti}
          nota="coperti"
          className="hidden md:flex"
        />
        <Numero
          icona={UtensilsCrossed}
          etichetta="Tavoli"
          valore={`${c.tavoliOccupati}/${c.tavoliTotali}`}
          nota="occupati"
          className="hidden md:flex"
        />
        <Numero icona={Clock} etichetta="In arrivo" valore={c.inArrivo} nota={`entro ${window_} min`} />
        <Numero
          icona={Timer}
          etichetta="In ritardo"
          valore={c.inRitardo}
          allarme={c.inRitardo > 0}
          nota={c.nonArrivate > 0 ? `+${c.nonArrivate} mai arrivate` : undefined}
        />
        <Numero icona={ListOrdered} etichetta="In attesa" valore={c.personeInAttesa} nota="persone" />
        <Numero
          icona={UserCheck}
          etichetta="Walk-in"
          valore={c.walkInOggi}
          nota="oggi"
          className="hidden md:flex"
        />
      </section>

      {insights.length > 0 && (
        /*
          Gli avvisi restano fermi — sono la cosa più importante della
          schermata — ma non oltre un terzo dell'altezza: dieci avvisi da
          sessanta pixel si mangerebbero lo schermo e le tre colonne
          sparirebbero. Sono già ordinati per urgenza, quindi quello che finisce
          sotto la piega interna è il meno grave, e scorre nel suo riquadro.
        */
        <section
          aria-label="Cosa sta per andare storto"
          className="fissa order-1 max-h-[34%] space-y-2 overflow-y-auto pr-0.5 lg:order-2"
        >
          <h2 className="t-etichetta font-medium">
            Da tenere d&apos;occhio
          </h2>
          <ServiceInsights insights={insights} />
        </section>
      )}

      {/* Le linguette servono dove c'è una colonna per volta: sul telefono.
          Da tablet in su le colonne stanno affiancate. */}
      <div className="fissa order-3 flex gap-1 md:hidden" role="tablist" aria-label="Aree del servizio">
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

      {/*
        Tre colonne su schermo largo, **due su tablet**, una sul telefono.
        A 820 px tre colonne da 273 px comprimono le card fino a renderle
        illeggibili; una sola spreca ottocento pixel. Due è la risposta del
        tablet, che non è né l'uno né l'altro.
      */}
      {/* La regione elastica: le colonne prendono l'altezza che avanza e
          scorrono al loro interno. */}
      <div className="fill-scroll order-4 grid gap-4 pr-0.5 md:grid-cols-2 xl:grid-cols-3">
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
    <section className={cn("space-y-3", !visibile && "hidden md:block")} aria-label={titolo}>
      <h2 className="hidden items-center gap-2 t-etichetta font-medium md:flex">
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
      <p className={cn("text-xs font-medium", allarme ? "text-accent-strong" : "text-tertiary-foreground")}>
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
  className,
}: {
  icona: typeof Users;
  etichetta: string;
  valore: number | string;
  nota?: string;
  allarme?: boolean;
  /** Serve a tenerne alcuni fuori dal telefono: là contano le azioni. */
  className?: string;
}) {
  /**
   * Una cella di una fascia, non un riquadro.
   *
   * Sei riquadri con la loro cornice e il loro respiro erano 110 px di
   * altezza per dire sei numeri. In una fascia sola sono 52, e i numeri si
   * leggono meglio: **sans e tabellari**, non serif. Il serif nei numeri è la
   * cosa che l'audit visivo ha segnalato come «premium che costa
   * leggibilità» — e un numero che si guarda di sfuggita mentre si cammina
   * non è il posto dove fare bella figura.
   */
  return (
    <div className={cn("flex items-center gap-2 px-3 py-2", className)}>
      <Icona
        className={cn("h-4 w-4 shrink-0", allarme ? "text-accent-strong" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p
          className={cn(
            "text-lg font-semibold leading-none tabular-nums",
            allarme && "text-accent-strong",
          )}
        >
          {valore}
        </p>
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
          {etichetta}
          {nota && <span className="normal-case tracking-normal text-tertiary-foreground"> · {nota}</span>}
        </p>
      </div>
    </div>
  );
}
