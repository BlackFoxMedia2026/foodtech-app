"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  ListOrdered,
  Timer,
  UserCheck,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { durataUmana } from "@/lib/durata";
import { CartaKpi, FasciaKpi } from "@/components/ui/carta-kpi";
import type { ServiceSnapshot } from "@/server/service";
import { ServiceBookingCard } from "@/components/service/service-booking-card";
import { ServiceWaitlistCard } from "@/components/service/service-waitlist-card";
import { ServiceSwitch } from "@/components/service/service-switch";
import { AvvisiServizio } from "@/components/service/avvisi-servizio";
import {
  PassoServizio,
  SelettorePassi,
} from "@/components/service/flusso-servizio";
import type { ServiceInsight } from "@/server/service-intelligence";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { ChiamateInArrivo } from "@/components/service/chiamata-in-arrivo";
import { CambiamentiRecenti } from "@/components/service/cambiamenti-recenti";

/** I tre momenti, nell'ordine in cui li vive chi entra. */
type Passo = "arrivo" | "attesa" | "accomodati";

const plurale = (n: number, uno: string, molti: string) =>
  `${n} ${n === 1 ? uno : molti}`;

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
 * - **Gli avvisi sono un livello trasversale**, non una fascia: stanno dietro
 *   un pulsante accanto all'interruttore Elenco/Sala. Prima si allargavano
 *   quando c'era più da fare, e per farlo spingevano il lavoro sotto la
 *   piega.
 * - **Su tablet due passi affiancati e il terzo sotto, su telefono uno per
 *   volta.** Comprimere tre colonne in 390 px produce tre strisce
 *   illeggibili.
 */
export function ServiceView({
  initial,
  insights,
  canManage,
}: {
  initial: ServiceSnapshot;
  insights: ServiceInsight[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initial);
  const [window_, setWindow] = useState(60);
  const [passo, setPasso] = useState<Passo>("arrivo");
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
      if (res.ok) setSnapshot(await res.json());
    },
    [window_],
  );

  const { ultimo, aggiornaOra } = useServizioVivo(scarica, initial.versione);

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
        Qui non c'è più un titolo: sta nella testata, accanto al marchio del
        locale. Questa riga tiene solo i comandi — interruttore del servizio,
        avvisi, ultimo cambiamento — e sono allineati a destra perché a
        sinistra non c'è più niente che li bilanci.

        Il titolo qui era già compatto di proposito: fra titolo, sei riquadri e
        cinque avvisi la prima colonna operativa cominciava a 850 px, cioè
        sotto la piega su un portatile. Adesso quei pixel non li spende
        nessuno.
      */}
      <header className="fissa flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <ServiceSwitch />

          {/* Gli avvisi: un bersaglio accanto all'interruttore, non una
              fascia che spinge giù il lavoro. */}
          <AvvisiServizio insights={insights} />

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
            <CambiamentiRecenti
              cambiamenti={snapshot.cambiamenti}
              ultimo={ultimo}
            />
          ) : (
            ultimo && (
              <span className="hidden t-nota sm:inline">
                aggiornato alle{" "}
                {ultimo.toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )
          )}
        </div>
      </header>

      {/*
        Il telefono che squilla, in cima e per il tempo di uno squillo.

        Sta **sopra** la fascia dei numeri e non di lato: tutto il resto di
        questa schermata dura un servizio, questo dura venti secondi, e in
        venti secondi non si cerca. Quando non c'e nessuna chiamata il
        componente non rende niente — il riquadro non e vuoto, non c'e.
      */}
      <ChiamateInArrivo chiamate={snapshot.chiamate} />

      {/*
        Su tablet ci stanno tutti e sei, e ci devono stare: a 820 px la fascia
        ne mostrava tre come su un telefono da 390, sprecando metà larghezza.
        Il tablet non è un telefono grande.

        Non è più una striscia divisa da righe verticali ma sei carte di vetro,
        una per tono. Il perché sta in `CartaKpi`; qui cambia solo che ognuna
        porta il proprio colore, e che il colore dice *quale* dato è — non che
        è importante.
      */}
      <FasciaKpi className="fissa">
        <CartaKpi
          icona={Users}
          tono="bosco"
          etichetta="In sala"
          valore={c.copertiPresenti}
          nota={["coperto", "coperti"]}
          className="hidden md:flex"
        />
        <CartaKpi
          icona={UtensilsCrossed}
          tono="bronzo"
          etichetta="Tavoli"
          valore={`${c.tavoliOccupati}/${c.tavoliTotali}`}
          nota="occupati"
          className="hidden md:flex"
        />
        <CartaKpi
          icona={Clock}
          tono="petrolio"
          etichetta="In arrivo"
          valore={c.inArrivo}
          nota={`entro ${window_} min`}
        />
        <CartaKpi
          icona={Timer}
          tono="oliva"
          etichetta="In ritardo"
          valore={c.inRitardo}
          allarme={c.inRitardo > 0}
          nota={
            c.nonArrivate > 0
              ? `+${c.nonArrivate} mai ${c.nonArrivate === 1 ? "arrivata" : "arrivate"}`
              : undefined
          }
        />
        <CartaKpi
          icona={ListOrdered}
          tono="salvia"
          etichetta="In attesa"
          valore={c.personeInAttesa}
          nota={["persona", "persone"]}
        />
        <CartaKpi
          icona={UserCheck}
          tono="alloro"
          etichetta="Walk-in"
          valore={c.walkInOggi}
          nota="oggi"
          className="hidden md:flex"
        />
      </FasciaKpi>

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
      <div className="fill-scroll grid gap-4 pr-0.5 md:grid-cols-2 xl:grid-cols-3">
        {/* Fuori: chi deve ancora entrare, compreso chi è in ritardo. */}
        <PassoServizio
          numero={1}
          titolo="In arrivo"
          visibile={passo === "arrivo"}
          riassunto={
            inArrivo.length === 0
              ? "nessuno atteso"
              : `${plurale(personeInArrivo, "persona", "persone")} · ${plurale(inArrivo.length, "prenotazione", "prenotazioni")}`
          }
          comandi={
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
                      ? "bg-cream text-clay-ink"
                      : "bg-current/10 text-muted-foreground",
                  )}
                >
                  {m}
                </button>
              ))}
              <span className="text-[11px] text-tertiary-foreground">min</span>
            </div>
          }
        >
          {/*
            «In ritardo» ha cambiato colonna, ed è la correzione che vale di
            più di tutta questa revisione: stava sotto «Adesso», accanto a chi
            mangia da un'ora, mentre chi è in ritardo **non è ancora entrato**.
            È una telefonata da fare, e sta in cima a chi deve arrivare.
          */}
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

          {snapshot.next.length === 0 ? (
            snapshot.late.length === 0 && (
              <EmptyState icon={Clock} title="Nessun arrivo in vista" compact>
                Nei prossimi {window_} minuti non è previsto nessuno. Allarga la
                finestra per guardare più avanti.
              </EmptyState>
            )
          ) : (
            <Gruppo
              titolo={`Attesi · ${snapshot.next.length}`}
              muto={snapshot.late.length === 0}
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
          titolo="In attesa"
          visibile={passo === "attesa"}
          className="md:border-l md:border-border md:pl-4"
          riassunto={
            gruppiInAttesa === 0 ? (
              "nessuno aspetta"
            ) : (
              <>
                {plurale(personeInAttesa, "persona", "persone")}
                {attesaPiuLunga > 0 && (
                  <>
                    {" · attesa più lunga "}
                    <span className="font-medium text-accent-strong">
                      {durataUmana(attesaPiuLunga)}
                    </span>
                  </>
                )}
              </>
            )
          }
        >
          {snapshot.arrived.length > 0 && (
            <Gruppo
              titolo={`Arrivati, da accomodare · ${snapshot.arrived.length}`}
            >
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

          {snapshot.waitlist.length > 0 && (
            <Gruppo
              titolo={`In lista · ${snapshot.waitlist.length}`}
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
          titolo="Accomodati"
          visibile={passo === "accomodati"}
          className="md:col-span-2 md:border-t md:border-border md:pt-4 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0"
          riassunto={
            snapshot.seated.length === 0
              ? "sala vuota"
              : `${plurale(c.copertiPresenti, "coperto", "coperti")} · ${plurale(c.tavoliOccupati, "tavolo", "tavoli")}`
          }
        >
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

          {seduti.length > 0 && (
            <Gruppo
              titolo={`Seduti · ${seduti.length}`}
              muto={snapshot.freeingSoon.length === 0}
            >
              {seduti.map((b) => (
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
 * «Attesi · 5» sotto una testata che dice già «01 In arrivo · 18 persone · 5
 * prenotazioni» è la stessa cosa detta due volte a due centimetri di
 * distanza. Il titolo torna appena c'è un secondo gruppo, cioè appena serve a
 * distinguere.
 */
function Gruppo({
  titolo,
  allarme = false,
  muto = false,
  children,
}: {
  titolo: string;
  allarme?: boolean;
  muto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {!muto && (
        <p
          className={cn(
            "text-xs font-medium",
            allarme ? "text-accent-strong" : "text-tertiary-foreground",
          )}
        >
          {titolo}
        </p>
      )}
      {children}
    </div>
  );
}
