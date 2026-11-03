"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, ListOrdered, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { durataUmana } from "@/lib/durata";
import type { ServiceSnapshot } from "@/server/service";
import { ServiceBookingCard } from "@/components/service/service-booking-card";
import { ServiceWaitlistCard } from "@/components/service/service-waitlist-card";
import { ServiceSwitch } from "@/components/service/service-switch";
import { PassoServizio, SelettorePassi } from "@/components/service/flusso-servizio";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { RiepilogoTelefono } from "@/components/telefono/riepilogo-servizio";
import { CambiamentiRecenti } from "@/components/service/cambiamenti-recenti";
import { misuraSchede, volaScheda, ATTRIBUTO_SCHEDA } from "@/components/service/volo-schede";

/** I tre momenti, nell'ordine in cui li vive chi entra. */
type Passo = "arrivo" | "attesa" | "accomodati";

/** In quale passo sta ogni prenotazione: 0 fuori, 1 in piedi, 2 a tavola. */
function colonne(s: ServiceSnapshot) {
  const m = new Map<string, number>();
  for (const b of [...s.late, ...s.next]) m.set(b.id, 0);
  for (const b of s.arrived) m.set(b.id, 1);
  for (const b of s.seated) m.set(b.id, 2);
  return m;
}

/**
 * La schermata del servizio.
 *
 * Quattro scelte che vengono dall'uso reale, non dal disegno:
 *
 * - **Si aggiorna da sola** ogni trenta secondi. Chi la tiene aperta per tre
 *   ore non deve ricordarsi di ricaricare, e un dato vecchio di venti minuti
 *   su questa schermata è peggio di nessun dato.
 * - **La pagina è un flusso, non tre elenchi.** In arrivo → in attesa →
 *   accomodati: i tre momenti del cliente dentro il locale, nell'ordine in
 *   cui accadono. Il perché della divisione — e perché «in ritardo» e
 *   «arrivati» hanno cambiato colonna — sta in `flusso-servizio.tsx`.
 * - **Niente avvisi in pagina.** Prima erano una fascia che si allargava
 *   quando c'era più da fare, poi un pulsante «Da tenere d'occhio» accanto
 *   all'interruttore; adesso quello che chiede di essere fatto arriva dalle
 *   notifiche, e la pagina comincia con il lavoro.
 * - **Su tablet due passi affiancati e il terzo sotto, su telefono uno per
 *   volta.** Comprimere tre colonne in 390 px produce tre strisce
 *   illeggibili.
 */
export function ServiceView({
  initial,
  canManage,
}: {
  initial: ServiceSnapshot;
  canManage: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [window_, setWindow] = useState(60);
  const [passo, setPasso] = useState<Passo>("arrivo");
  /* La griglia dei passi e dove stavano le schede prima dell'ultima
     fotografia: servono a farle volare da una colonna all'altra. */
  const griglia = useRef<HTMLDivElement>(null);
  const posizioniPrima = useRef(new Map<string, DOMRect>());
  // Scarica la fotografia. Il *quando* non è più affare di questo componente:
  // ci pensa `useServizioVivo`, che chiede al server ogni cinque secondi se
  // qualcosa è cambiato e chiama questa funzione solo se la risposta è sì.
  const scarica = useCallback(
    async (finestra = window_) => {
      const res = await fetch(`/api/service?window=${finestra}`, {
        cache: "no-store",
      });
      // Una rete che salta per un istante non deve svuotare la schermata:
      // resta l'ultima fotografia buona, con l'ora a cui è stata presa.
      if (res.ok) {
        const nuova = await res.json();
        // Prima che la fotografia nuova cambi il DOM: dove sta ogni scheda.
        posizioniPrima.current = misuraSchede(griglia.current);
        setSnapshot(nuova);
      }
    },
    [window_],
  );

  const { ultimo, aggiornaOra } = useServizioVivo(scarica, initial.versione);

  /*
    Le schede appena passate al passo dopo (3 novembre 2026).

    Confrontando la fotografia nuova con la precedente si sa chi ha cambiato
    colonna: quelle schede volano dal posto di prima a quello nuovo
    (`volo-schede.ts`), in avanti col gesto e all'indietro con «Annulla». Vale
    anche per i gesti fatti da un collega su un altro tablet: chi guarda vede
    il movimento, non un nome che sparisce.

    È lo schema «stato precedente nello stato» di React: niente effetti,
    niente riferimenti letti durante il disegno.
  */
  const [traccia, setTraccia] = useState(() => ({
    foto: initial,
    dove: colonne(initial),
    entrate: new Set<string>(),
  }));
  if (traccia.foto !== snapshot) {
    const dove = colonne(snapshot);
    const entrate = new Set<string>();
    for (const [id, col] of dove) {
      const prima = traccia.dove.get(id);
      // Avanti e indietro: «Annulla» riporta la scheda dov'era, e torna
      // volando come era partita.
      if (prima !== undefined && prima !== col) entrate.add(id);
    }
    setTraccia({ foto: snapshot, dove, entrate });
  }
  const entrata = (id: string) => traccia.entrate.has(id);

  // Le schede passate al passo dopo volano dal posto di prima a quello nuovo.
  useLayoutEffect(() => {
    if (traccia.entrate.size === 0) return;
    const chiudi: (() => void)[] = [];
    for (const id of traccia.entrate) {
      const da = posizioniPrima.current.get(id);
      const el = griglia.current?.querySelector<HTMLElement>(`[${ATTRIBUTO_SCHEDA}="${CSS.escape(id)}"]`);
      if (da && el) chiudi.push(volaScheda(el, da));
    }
    return () => chiudi.forEach((f) => f());
  }, [traccia.entrate]);

  const aggiorna = useCallback(
    (finestra?: number) =>
      finestra === undefined ? aggiornaOra() : scarica(finestra),
    [aggiornaOra, scarica],
  );

  const dopoAzione = useCallback(() => {
    aggiorna();
    // Anche il resto dell'applicazione (Sala, Panoramica) è cambiato.
    router.refresh();
  }, [aggiorna, router]);

  const c = snapshot.counters;

  /*
    I conteggi dei tre passi.

    Sono **aritmetica di presentazione** sugli stessi array che il server
    manda già divisi: nessuna regola nuova, nessuna chiamata in più. Le
    persone prima dei gruppi, perché i coperti sono l'unità con cui si
    ragiona in sala — quanti ne entrano in quel tavolo, non quanti nomi ci
    sono in lista.
  */
  const inArrivo = [...snapshot.late, ...snapshot.next];
  const personeInArrivo = inArrivo.reduce((n, b) => n + b.partySize, 0);

  const personeInAttesa =
    snapshot.arrived.reduce((n, b) => n + b.partySize, 0) +
    snapshot.waitlist.reduce((n, e) => n + e.partySize, 0);
  const gruppiInAttesa = snapshot.arrived.length + snapshot.waitlist.length;
  // L'attesa più lunga è il dato che decide chi si accomoda per primo, e
  // l'unico della banda che si accende: se qualcuno aspetta da mezz'ora,
  // quello è il numero da vedere senza aprire la colonna.
  const attesaPiuLunga = snapshot.waitlist.reduce(
    (m, e) => Math.max(m, e.waitingMin),
    0,
  );

  const seduti = snapshot.seated.filter(
    (b) => !snapshot.freeingSoon.some((f) => f.id === b.id),
  );

  /*
    Il filtro della finestra (30/60/90). Sta sulla riga del primo gruppo di
    «In arrivo», accanto a «In ritardo» o «Attesi»: in una riga sua sopra le
    schede lasciava una fascia vuota larga quanto la colonna.
  */
  const filtroFinestra = (
    <div className="flex items-center gap-1">
      {[30, 60, 90].map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={window_ === m}
          aria-label={`Guarda i prossimi ${m} minuti`}
          onClick={() => {
            setWindow(m);
            aggiorna(m);
          }}
          className={cn(
            "min-h-[36px] rounded-full px-2.5 text-xs tabular-nums transition-colors",
            window_ === m
              ? "bg-segment text-segment-ink"
              : "bg-current/10 text-muted-foreground",
          )}
        >
          {m}
        </button>
      ))}
      <span className="text-[11px] text-tertiary-foreground">min</span>
    </div>
  );

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
        Qui non c'è più una riga di comandi. L'interruttore Elenco/Sala sta
        nella testata, accanto al titolo (`ServiceSwitch` ci va con un
        portale); gli avvisi «Da tenere d'occhio» sono usciti dalla pagina —
        quello che chiede di essere fatto arriva dalle notifiche.
      */}
      <ServiceSwitch />

      {/*
        Chi ha cambiato cosa (§65).

        La schermata si aggiorna da sola, e il cambiamento appariva senza
        dire chi: due persone sullo stesso servizio da due tablet vedevano
        un tavolo assegnarsi da solo, e la seconda rifaceva il lavoro della
        prima o si fermava a chiedere. Adesso c'è scritto, in una nota a
        destra che compare solo quando c'è qualcosa da dire.
      */}
      {snapshot.cambiamenti.length > 0 && (
        <div className="fissa hidden justify-end sm:flex">
          <CambiamentiRecenti cambiamenti={snapshot.cambiamenti} ultimo={ultimo} />
        </div>
      )}

      {/*
        Il riquadro della chiamata **non è più qui**.

        Stava in questa pagina, e voleva dire che chi guardava la carta o la
        scheda di un cliente non vedeva squillare niente. Adesso vive nel
        guscio (`components/telefono/voice-globale.tsx`) e compare su qualunque
        pagina, compresa questa.

        Al suo posto resta quello che il Servizio deve dire del telefono: **cosa
        chiede di essere fatto**. Non lo storico, non i conteggi della giornata
        — quelli stanno nella pagina Telefono. Il Servizio non diventa un call
        center: mostra le due righe che riguardano il servizio di adesso.
      */}
      <RiepilogoTelefono />

      {/*
        Qui c'era la fascia dei sei numeri (in sala, tavoli, in arrivo, in
        ritardo, in attesa, walk-in). Tolta il 29 ottobre: ripeteva quello che
        le tre testate dicono già, a due centimetri, e faceva della parte alta
        un secondo cruscotto sopra il lavoro. Adesso ogni numero sta nella
        testata del passo a cui appartiene.
      */}


      {/* Le linguette servono dove c'è un passo per volta: sul telefono. */}
      <SelettorePassi
        attivo={passo}
        onCambia={setPasso}
        passi={[
          { chiave: "arrivo", corto: "In arrivo", conteggio: inArrivo.length },
          { chiave: "attesa", corto: "In attesa", conteggio: gruppiInAttesa },
          {
            chiave: "accomodati",
            corto: "Accomodati",
            conteggio: snapshot.seated.length,
          },
        ]}
      />

      {/*
        Tre passi affiancati da `xl`, **due su tablet con il terzo sotto**, uno
        sul telefono.

        A 820 px tre colonne da 273 px comprimono le card fino a renderle
        illeggibili. Ma la risposta di prima — due colonne e basta — spezzava
        il flusso a metà senza dire dove ricominciava. Adesso i due passi che
        si susseguono restano affiancati, e «accomodati» prende la riga intera
        sotto: è il passo con più righe, ed è quello a cui la larghezza serve
        davvero.

        **Il filetto fra i passi.** Un bordo sul lato sinistro dei passi
        successivi al primo, con sedici pixel di solco da una parte e
        dall'altra: la riga cade esatta in mezzo. Corre per tutta l'altezza
        anche dove la colonna è corta — le celle di una riga della griglia si
        stirano all'altezza della più alta — e questo è il punto: un filetto
        che finisse con l'ultima card direbbe «qui è finito l'elenco», non
        «di qua comincia un altro passo».

        Dove i passi non sono affiancati il filetto gira di novanta gradi: su
        tablet «accomodati» sta sotto, e lì la divisione è orizzontale.
      */}
      {/* La regione elastica: i passi prendono l'altezza che avanza e scorrono
          al loro interno. */}
      <div ref={griglia} className="fill-scroll grid gap-4 pr-0.5 md:grid-cols-2 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
        {/* Fuori: chi deve ancora entrare, compreso chi è in ritardo. */}
        <PassoServizio
          numero={1}
          tinta="arrivo"
          titolo="In arrivo"
          visibile={passo === "arrivo"}
          conteggio={inArrivo.length}
          riassunto={
            inArrivo.length === 0
              ? `nessuno atteso entro ${window_} min`
              : `${personeInArrivo} ${personeInArrivo === 1 ? "persona" : "persone"} · entro ${window_} min`
          }
          // A colonna vuota il filtro resta da solo in cima: è proprio lì che
          // serve allargare la finestra.
          comandi={inArrivo.length === 0 ? filtroFinestra : undefined}
        >
          {/*
            «In ritardo» ha cambiato colonna, ed è la correzione che vale di
            più di tutta questa revisione: stava sotto «Adesso», accanto a chi
            mangia da un'ora, mentre chi è in ritardo **non è ancora entrato**.
            È una telefonata da fare, e sta in cima a chi deve arrivare.
          */}
          {snapshot.late.length > 0 && (
            <Gruppo titolo="In ritardo" conteggio={snapshot.late.length} allarme comandi={filtroFinestra}>
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

          {snapshot.next.length === 0 ? (
            snapshot.late.length === 0 && (
              <EmptyState icon={Clock} title="Nessun arrivo in vista" compact>
                Nei prossimi {window_} minuti non è previsto nessuno. Allarga la
                finestra per guardare più avanti.
              </EmptyState>
            )
          ) : (
            <Gruppo
              titolo="Attesi"
              conteggio={snapshot.next.length}
              muto={snapshot.late.length === 0}
              comandi={snapshot.late.length === 0 ? filtroFinestra : undefined}
            >
              {snapshot.next.map((b) => (
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
        </PassoServizio>

        {/* Dentro, in piedi: chi è arrivato senza tavolo e chi è in lista.
            Sono la stessa domanda, «dove li metto?», e per la prima volta
            stanno nello stesso posto. */}
        <PassoServizio
          numero={2}
          tinta="attesa"
          titolo="In attesa"
          visibile={passo === "attesa"}
          conteggio={gruppiInAttesa}
          riassunto={
            gruppiInAttesa === 0 ? (
              "nessuno aspetta"
            ) : (
              <>
                {personeInAttesa} {personeInAttesa === 1 ? "persona" : "persone"}
                {attesaPiuLunga > 0 && (
                  <>
                    {" · max "}
                    <b className="font-semibold text-[color:var(--header-ink)]">
                      {durataUmana(attesaPiuLunga)}
                    </b>
                  </>
                )}
              </>
            )
          }
        >
          {snapshot.arrived.length > 0 && (
            <Gruppo
              titolo="Arrivati, da accomodare"
              conteggio={snapshot.arrived.length}
            >
              {snapshot.arrived.map((b) => (
                <ServiceBookingCard
                  key={b.id}
                  entrata={entrata(b.id)}
                  booking={b}
                  timezone={snapshot.timezone}
                  currency={snapshot.currency}
                  canManage={canManage}
                  onChanged={dopoAzione}
                />
              ))}
            </Gruppo>
          )}

          {snapshot.waitlist.length > 0 && (
            <Gruppo
              titolo="In lista"
              conteggio={snapshot.waitlist.length}
              muto={snapshot.arrived.length === 0}
            >
              {snapshot.waitlist.map((e, i) => (
                <ServiceWaitlistCard
                  key={e.id}
                  entry={e}
                  posizione={i + 1}
                  canManage={canManage}
                  onChanged={dopoAzione}
                />
              ))}
            </Gruppo>
          )}

          {gruppiInAttesa === 0 && (
            <EmptyState icon={ListOrdered} title="Nessuno in attesa" compact>
              Qui compare chi è arrivato senza tavolo e chi è in lista. Quando
              il locale è pieno, aggiungi la coda: appena un tavolo si libera
              Tavolo ti dice chi ci sta.
            </EmptyState>
          )}
        </PassoServizio>

        {/* A tavola. «In chiusura» resta uno stato **dentro** la colonna:
            è un modo di essere seduti, non un terzo elenco. */}
        <PassoServizio
          numero={3}
          tinta="accomodati"
          titolo="Accomodati"
          visibile={passo === "accomodati"}
          className="md:col-span-2 xl:col-span-1"
          conteggio={snapshot.seated.length}
          riassunto={
            snapshot.seated.length === 0
              ? "sala vuota"
              : `${c.copertiPresenti} ${c.copertiPresenti === 1 ? "coperto" : "coperti"} · ${c.tavoliOccupati}/${c.tavoliTotali} tavoli`
          }
        >
          {snapshot.freeingSoon.length > 0 && (
            <Gruppo titolo="In chiusura" conteggio={snapshot.freeingSoon.length}>
              {snapshot.freeingSoon.map((b) => (
                <ServiceBookingCard
                  key={b.id}
                  inChiusura
                  entrata={entrata(b.id)}
                  booking={b}
                  timezone={snapshot.timezone}
                  currency={snapshot.currency}
                  canManage={canManage}
                  onChanged={dopoAzione}
                />
              ))}
            </Gruppo>
          )}

          {seduti.length > 0 && (
            <Gruppo
              titolo="Seduti"
              conteggio={seduti.length}
              muto={snapshot.freeingSoon.length === 0}
            >
              {/* Chi è seduto e non chiede niente è una riga sola: la scheda
                  intera serve a chi sta per liberarsi, non a chi è al primo. */}
              {seduti.map((b) => (
                <ServiceBookingCard
                  key={b.id}
                  entrata={entrata(b.id)}
                  booking={b}
                  timezone={snapshot.timezone}
                  currency={snapshot.currency}
                  canManage={canManage}
                  onChanged={dopoAzione}
                  compatta
                />
              ))}
            </Gruppo>
          )}

          {snapshot.seated.length === 0 && (
            /* Con la sala vuota e gente in coda, il fatto su cui si può agire
               non è che nessuno è seduto: è che qualcuno aspetta. Lo stato
               vuoto lo dice e ci porta, invece di descrivere l'attesa e
               lasciare mezzo schermo bianco. E dice **due** numeri, perché
               sono due cose diverse: i gruppi in coda e le persone che sono. */
            <EmptyState
              icon={Users}
              title="Sala vuota"
              compact
              action={
                snapshot.waitlist.length > 0 ? (
                  <Button
                    size="sm"
                    variant="accent"
                    onClick={() => setPasso("attesa")}
                  >
                    Vedi chi aspetta
                  </Button>
                ) : undefined
              }
            >
              {snapshot.waitlist.length > 0 ? (
                <>
                  Nessuno è ancora seduto, ma{" "}
                  {snapshot.waitlist.length === 1
                    ? "c'è un gruppo che aspetta"
                    : `ci sono ${snapshot.waitlist.length} gruppi che aspettano`}
                  {c.personeInAttesa > 0
                    ? `, ${c.personeInAttesa} persone in tutto`
                    : ""}
                  . Da lì si accomoda il primo tavolo.
                </>
              ) : (
                <>
                  Nessuno è ancora seduto. Appena il primo ospite arriva, lo
                  segni qui con un tocco e la sala si aggiorna da sola.
                </>
              )}
            </EmptyState>
          )}
        </PassoServizio>
      </div>
    </div>
  );
}

/**
 * Un gruppo dentro un passo: «in ritardo», «in lista», «in chiusura».
 *
 * `muto` toglie il titolo quando il gruppo è **l'unico** del passo: ripetere
 * «Attesi» sotto una testata che dice già «In arrivo · 13 persone» è la
 * stessa cosa detta due volte. Il titolo torna appena c'è un secondo gruppo,
 * cioè appena serve a distinguere.
 *
 * Maiuscoletto a 13 px, senza tondino del conteggio: il numero del passo sta
 * già nella testata, e qui il titolo fa solo da segnalibro fra due gruppi.
 *
 * `comandi` va sulla stessa riga, a destra (il filtro 30/60/90 di «In
 * arrivo»). Con i comandi il titolo si vede anche se il gruppo è muto: un
 * filtro da solo, senza dire su cosa agisce, non si legge.
 */
function Gruppo({
  titolo,
  conteggio,
  allarme = false,
  muto = false,
  comandi,
  children,
}: {
  titolo: string;
  conteggio: number;
  allarme?: boolean;
  muto?: boolean;
  comandi?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      {(!muto || comandi) && (
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "px-1.5 pt-0.5 text-[13px] font-bold uppercase tracking-[0.07em]",
              allarme ? "text-accent-strong" : "text-foreground/75",
            )}
          >
            {titolo}
            <span className="sr-only">: {conteggio}</span>
          </p>
          {comandi}
        </div>
      )}
      {children}
    </div>
  );
}
