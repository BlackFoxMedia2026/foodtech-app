"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Clock,
  Link2,
  Receipt,
  Timer,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { readApiError } from "@/lib/api-client";
import { durataUmana } from "@/lib/durata";
import { frasePrevisione } from "@/lib/liberazione";
import { cn, formatCurrency } from "@/lib/utils";
import { CosaSapere } from "@/components/guests/cosa-sapere";
import { TABLE_LIVE_HINTS, TABLE_LIVE_LABELS, type TableLiveStatus } from "@/lib/table-status";
import { LIVE_STATUS_ORDER, type FloorLive, type TableLiveInfo } from "@/server/floor-live";
import { ServiceSwitch } from "@/components/service/service-switch";
import { TablePickerDialog } from "@/components/service/table-picker-dialog";
import { useServizioVivo } from "@/lib/use-servizio-vivo";
import { oraInVenue } from "@/lib/venue-time";
import { STILE_STATO } from "@/components/tables/stile-stato";
import { PiantinaRenderer } from "@/components/floor/editor/piantina-renderer";
import { DEFAULT_ROOM_LAYERS, boundingBox, type RoomElement } from "@/lib/room-layout";
import {
  TableProfileDrawer,
  type PermessiTavolo,
} from "@/components/tables/table-profile-drawer";

type Corrente = NonNullable<TableLiveInfo["current"]>;

const VUOTO: RoomElement[] = [];

/**
 * Il conto del tavolo, detto in due parole.
 *
 * Zero righe su un tavolo seduto non è «zero euro»: è **un conto aperto e
 * ancora vuoto**, e sono due cose diverse per chi deve decidere se quel
 * tavolo sta per liberarsi.
 */
function fraseConto(conto: NonNullable<Corrente["conto"]>): string {
  if (conto.righe === 0) return "conto aperto, nulla battuto";
  const base = `${formatCurrency(conto.totalCents)} · ${conto.righe} ${conto.righe === 1 ? "riga" : "righe"}`;
  if (conto.residuoCents === 0 && conto.pagatoCents > 0) return `${base} — saldato dal tavolo`;
  if (conto.pagatoCents > 0) return `${base} — pagati ${formatCurrency(conto.pagatoCents)}, restano ${formatCurrency(conto.residuoCents)}`;
  if (conto.pagamentoInCorso) return `${base} — pagamento in corso al tavolo`;
  return base;
}

export type RoomTable = {
  id: string;
  label: string;
  seats: number;
  posX: number;
  posY: number;
  shape: string;
  roomId: string | null;
};

export type RoomOption = {
  id: string;
  name: string;
  /** La piantina disegnata in Sala. Arriva qui per la ragione che la Sala
   * esiste: una mappa del servizio senza muri è un elenco di rettangoli
   * sparsi, e per orientarsi in un locale servono il bancone, la cucina e la
   * porta d'ingresso — cioè le stesse cose che si sono già disegnate una
   * volta. Nessuno le ridisegna qui. */
  elementi: RoomElement[];
};

/**
 * La sala durante il servizio.
 *
 * Non è la pianta con cui si configura il locale — quella sta in Sala e serve
 * a disegnare, spostare, assegnare il personale. Questa serve a **guardare**:
 * chi c'è su ogni tavolo, da quando, quanto manca, e cosa fare adesso.
 *
 * Su telefono non c'è nessuna miniatura: la mappa rimpicciolita a 390 px non
 * si legge e non si tocca. Al suo posto c'è l'elenco dei tavoli raggruppati
 * per stato, che è la stessa informazione in una forma che ci sta.
 */
export function RoomLiveView({
  initial,
  tables,
  rooms,
  canManage,
  permessi,
}: {
  initial: FloorLive;
  tables: RoomTable[];
  rooms: RoomOption[];
  canManage: boolean;
  /** Chi guarda: decide cosa si può toccare dal profilo del tavolo. */
  permessi: PermessiTavolo;
}) {
  const router = useRouter();
  const [live, setLive] = useState(initial);
  const [roomId, setRoomId] = useState<string | null>(rooms[0]?.id ?? null);
  const [selezionato, setSelezionato] = useState<string | null>(null);

  // Il *quando* non è più affare di questo componente: vedi
  // `lib/use-servizio-vivo.ts`. Qui si sa solo come scaricare la mappa.
  const scarica = useCallback(async () => {
    const res = await fetch("/api/floor-live", { cache: "no-store" });
    // Resta l'ultima fotografia buona, con la sua ora.
    if (res.ok) setLive(await res.json());
  }, []);

  const { ultimo, aggiornaOra: aggiorna } = useServizioVivo(scarica);

  /*
    Dopo un'azione la mappa si riallinea, ma **il tavolo scelto resta scelto**:
    chi segna un arrivo dal pannello si aspetta di continuare a leggere quel
    tavolo, non di vederselo chiudere sotto le mani.
  */
  const dopoAzione = useCallback(() => {
    aggiorna();
    router.refresh();
  }, [aggiorna, router]);

  const tavoliSala = useMemo(
    () => (roomId ? tables.filter((t) => t.roomId === roomId) : tables),
    [tables, roomId],
  );

  // `?? VUOTO` e non `?? []`: un array nuovo a ogni render farebbe ricalcolare
  // il riquadro della mappa a ogni battito del servizio dal vivo.
  const elementiSala = useMemo(() => rooms.find((r) => r.id === roomId)?.elementi ?? VUOTO, [rooms, roomId]);

  /**
   * Il riquadro che la mappa deve contenere.
   *
   * Non solo i tavoli: anche i muri. I due disegni vivono nello stesso spazio
   * di coordinate — quello della Sala — e se il riquadro li abbracciasse a
   * metà la piantina e i tavoli finirebbero disallineati di quel tanto che
   * basta a mettere un tavolo dentro la cucina.
   */
  const bounds = useMemo(() => {
    const box = elementiSala.length > 0 ? boundingBox(elementiSala) : null;
    const maxTavoliX = tavoliSala.length > 0 ? Math.max(...tavoliSala.map((t) => t.posX)) + 140 : 0;
    const maxTavoliY = tavoliSala.length > 0 ? Math.max(...tavoliSala.map((t) => t.posY)) + 140 : 0;
    const maxX = Math.max(maxTavoliX, box ? box.maxX + 40 : 0);
    const maxY = Math.max(maxTavoliY, box ? box.maxY + 40 : 0);
    return { w: Math.max(600, maxX), h: Math.max(400, maxY) };
  }, [tavoliSala, elementiSala]);

  const perStato = useMemo(() => {
    const gruppi = new Map<TableLiveStatus, RoomTable[]>();
    for (const t of tavoliSala) {
      const stato = live.byTableId[t.id]?.status ?? "LIBERO";
      const lista = gruppi.get(stato);
      if (lista) lista.push(t);
      else gruppi.set(stato, [t]);
    }
    return gruppi;
  }, [tavoliSala, live]);

  return (
    <div className="schermo animate-fade-in gap-3">
      {/* Nessun titolo: la testata dice «Servizio» e l'interruttore qui
          accanto dice quale delle due viste si sta guardando. Scriverlo una
          terza volta sarebbe spazio tolto alla mappa. */}
      <header className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-3">
          <ServiceSwitch />
          {ultimo && (
            <span className="hidden t-nota sm:inline">
              {ultimo.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </header>

      {rooms.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {rooms.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={roomId === r.id}
              onClick={() => setRoomId(r.id)}
              className={cn(
                "min-h-[40px] rounded-full px-3 text-sm transition-colors",
                roomId === r.id ? "bg-cream text-clay-ink" : "bg-current/10 text-muted-foreground",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* La legenda è anche il conteggio: due informazioni nello stesso posto. */}
      <div className="flex flex-wrap gap-2">
        {LIVE_STATUS_ORDER.filter((s) => (perStato.get(s)?.length ?? 0) > 0).map((stato) => {
          const stile = STILE_STATO[stato];
          const Icona = stile.icona;
          return (
            <span
              key={stato}
              title={TABLE_LIVE_HINTS[stato]}
              className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs", stile.classe)}
            >
              <Icona className="h-3.5 w-3.5" aria-hidden="true" />
              {TABLE_LIVE_LABELS[stato]}
              <span className="font-semibold">{perStato.get(stato)?.length ?? 0}</span>
            </span>
          );
        })}
      </div>

      {/*
        Su cosa poggiano le previsioni, detto una volta.

        «Libero verso le 22:30» è una promessa: chi la legge la usa per far
        aspettare qualcuno dieci minuti invece di mandarlo via. Va detto da
        dove esce quel numero — e va detto **qui**, una volta per schermata,
        invece che come etichetta su ogni tavolo.
      */}
      <p className="t-nota">
        {live.durata
          ? `Le previsioni di liberazione usano la durata misurata in questo locale: ${durataUmana(
              live.durata.medianaMin,
            )}, su ${live.durata.misurate} cene chiuse.`
          : "Le previsioni di liberazione usano la durata prevista sulle prenotazioni: non ci sono ancora abbastanza cene chiuse per misurare quanto si sta a tavola qui."}
      </p>

      {tavoliSala.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="Nessun tavolo in questa sala">
          Aggiungi i tavoli dalla sezione Sala: da lì disegni la pianta, qui la guardi mentre lavora.
        </EmptyState>
      ) : (
        <>
          {/* MAPPA — da tablet in su */}
          <div className="fill hidden min-h-0 lg:block">
            <div className="surface relative h-full overflow-hidden riquadro">
              <div
                className="relative mx-auto"
                style={{
                  width: "100%",
                  aspectRatio: `${bounds.w} / ${bounds.h}`,
                  // Prima era `62vh`: un valore fisso che non sapeva quanta
                  // altezza avesse davvero a disposizione, e che sommato a
                  // testata e legenda faceva sforare la pagina. Adesso la
                  // mappa non passa l'altezza del suo contenitore, che è
                  // quello che avanza.
                  maxHeight: "100%",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    // Le posizioni sono in pixel del disegno: si riportano
                    // in percentuale, così la mappa si adatta a qualunque
                    // schermo senza matematica sul ridimensionamento.
                    containerType: "size",
                  }}
                >
                  {/*
                    La piantina disegnata in Sala, sotto i tavoli — e sotto un
                    velo scuro.

                    Il velo non è un effetto: qui le schede dei tavoli sono
                    chiare e translucide, disegnate per il verde scuro del
                    fondo, e sul legno caldo della piantina si leggono a
                    fatica. Durante un servizio la scheda che dice «Prenotato
                    alle 21:00» deve vincere sempre sulla parete che sta
                    dietro. La piantina resta quello che deve essere qui:
                    l'orientamento, non il contenuto.
                  */}
                  {elementiSala.length > 0 && (
                    <>
                      <PiantinaRenderer
                        elements={elementiSala}
                        width={bounds.w}
                        height={bounds.h}
                        layers={{ ...DEFAULT_ROOM_LAYERS, original: false }}
                        className="h-full w-full"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-background/65" aria-hidden="true" />
                    </>
                  )}
                  {tavoliSala.map((t) => {
                    const info = live.byTableId[t.id];
                    return (
                      <TavoloMappa
                        key={t.id}
                        table={t}
                        info={info}
                        bounds={bounds}
                        timezone={live.timezone}
                        selezionato={selezionato === t.id}
                        onSelect={() => setSelezionato(selezionato === t.id ? null : t.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ELENCO — su telefono, e sotto la mappa come dettaglio */}
          <div className="fill-scroll space-y-4 pr-0.5 lg:hidden">
            {LIVE_STATUS_ORDER.filter((s) => (perStato.get(s)?.length ?? 0) > 0).map((stato) => (
              <section key={stato} className="space-y-2">
                <h2 className="flex items-center gap-2 t-etichetta font-medium">
                  {TABLE_LIVE_LABELS[stato]}
                  <span className="rounded-full bg-current/10 px-2 py-0.5 text-[11px]">
                    {perStato.get(stato)?.length}
                  </span>
                </h2>
                {perStato.get(stato)!.map((t) => (
                  <TavoloRiga
                    key={t.id}
                    table={t}
                    info={live.byTableId[t.id]}
                    timezone={live.timezone}
                    canManage={canManage}
                    onChanged={dopoAzione}
                    onApri={() => setSelezionato(t.id)}
                    evidenziato={selezionato === t.id}
                    durataLocale={live.durata}
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      )}

      {/*
        Il dettaglio del tavolo scelto.

        Era una riga in fondo alla pagina: si toccava un tavolo in alto a
        sinistra e la risposta compariva sotto la mappa, fuori dallo sguardo.
        Adesso è **lo stesso pannello della Sala** — stesso componente, stessa
        logica — e arriva da destra accanto al tavolo che l'ha aperto.
      */}
      <TableProfileDrawer
        tableId={selezionato}
        onOpenChange={(aperto) => !aperto && setSelezionato(null)}
        permessi={permessi}
        onDatiCambiati={dopoAzione}
      />
    </div>
  );
}

/**
 * Quanto è largo un tavolo sulla mappa, secondo i posti.
 *
 * Prima erano tutti larghi uguale, e una mappa in cui il due posti e il dieci
 * posti sono identici non è una mappa: è un elenco disposto male. La
 * larghezza cresce con i posti, ma **non in proporzione esatta** — dentro il
 * riquadro ci sta il nome di chi è seduto, e un due posti largo la metà lo
 * taglierebbe a metà parola. Serve a ordinare il colpo d'occhio, non a
 * misurare la sala in scala.
 */
function larghezzaTavolo(seats: number): number {
  return Math.min(100 + seats * 7, 170);
}

/** Un tavolo sulla mappa. */
function TavoloMappa({
  table,
  info,
  bounds,
  timezone,
  selezionato,
  onSelect,
}: {
  table: RoomTable;
  info: TableLiveInfo | undefined;
  bounds: { w: number; h: number };
  timezone: string;
  selezionato: boolean;
  onSelect: () => void;
}) {
  const stato = info?.status ?? "LIBERO";
  const stile = STILE_STATO[stato];
  const Icona = stile.icona;
  const corrente = info?.current;

  const ora = corrente ? oraInVenue(corrente.startsAt, timezone) : null;

  const oltre = corrente?.liberoVerso != null && corrente.liberoVerso.minuti < 0;

  // Le due righe nuove del riquadro: quando si libera e a quanto sta il
  // conto. Il riquadro cresce solo se ha qualcosa da dire.
  const previsione = corrente?.liberoVerso ? frasePrevisione(corrente.liberoVerso, timezone) : null;
  const oraLibero = corrente?.liberoVerso ? oraInVenue(corrente.liberoVerso.fine, timezone) : null;
  const soldi =
    corrente?.conto && corrente.conto.righe > 0 ? formatCurrency(corrente.conto.totalCents) : null;

  /*
    Il tavolo che ha pagato da solo.

    È l'informazione che cambia un gesto: un tavolo saldato col QR **non deve
    passare in cassa**, e senza questo segno il cameriere ci va lo stesso — o
    va a chiedere il conto a chi l'ha già pagato. Sta sul tavolo e non in un
    elenco a parte perché è lì che si guarda mentre si attraversa la sala.

    Tre stati e non uno: saldato (non serve fare niente), in parte (ne manca un
    pezzo), in corso (aspetta un attimo prima di andare).
  */
  const qr = corrente?.conto
    ? corrente.conto.residuoCents === 0 && corrente.conto.pagatoCents > 0
      ? { segno: "✓ saldato", tono: "text-sage-strong" }
      : corrente.conto.pagatoCents > 0
        ? { segno: `resta ${formatCurrency(corrente.conto.residuoCents)}`, tono: "text-accent-strong" }
        : corrente.conto.pagamentoInCorso
          ? { segno: "sta pagando", tono: "text-accent-strong" }
          : null
    : null;
  const rigaExtra = !!(oraLibero || soldi || info?.next);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selezionato}
      title={[
        `${table.label} · ${TABLE_LIVE_LABELS[stato]} — ${TABLE_LIVE_HINTS[stato]}`,
        previsione && `${previsione.testo}. ${previsione.dettaglio}`,
        corrente?.conto && `Conto: ${fraseConto(corrente.conto)}.`,
        info?.next &&
          `Poi ${info.next.guestName} alle ${oraInVenue(info.next.startsAt, timezone)}, ${info.next.partySize}p.`,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Tavolo ${table.label}, ${table.seats} posti, ${TABLE_LIVE_LABELS[stato]}${
        corrente ? `, ${corrente.guestName}, ${corrente.partySize} persone` : ""
      }`}
      className={cn(
        // Le posizioni sono percentuali dei limiti del disegno: nessuna
        // sovrapposizione di etichette, perché il testo sta *dentro* il
        // riquadro e non in una pillola appesa sotto — era il difetto della
        // pianta precedente, dove le pillole dei tavoli vicini si
        // accavallavano.
        "absolute flex flex-col items-start justify-center overflow-hidden rounded-md border px-2 py-1.5 text-left transition-transform",
        stile.classe,
        selezionato && "ring-2 ring-cream",
      )}
      style={{
        left: `${(table.posX / bounds.w) * 100}%`,
        top: `${(table.posY / bounds.h) * 100}%`,
        width: `${(larghezzaTavolo(table.seats) / bounds.w) * 100}%`,
        minHeight: `${((rigaExtra ? 70 : 58) / bounds.h) * 100}%`,
      }}
    >
      <span className="flex w-full items-center gap-1">
        <Icona className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate text-xs font-semibold">{table.label}</span>
        <span className="ml-auto shrink-0 text-[10px] opacity-70">{table.seats}p</span>
      </span>

      {corrente ? (
        <>
          <span className="w-full truncate text-[11px] leading-tight">{corrente.guestName}</span>
          <span className="flex w-full items-center gap-1 text-[10px] leading-tight opacity-80">
            {ora} · {corrente.partySize}p
            {/* «+397′» è esatto e illeggibile: sopra l'ora si dice in ore. */}
            {oltre && (
              <span className="font-semibold">+{durataUmana(Math.abs(corrente.liberoVerso!.minuti))}</span>
            )}
            {corrente.combinedWith.length > 0 && <Link2 className="h-2.5 w-2.5" aria-hidden="true" />}
            {corrente.allergies && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
          </span>

          {/*
            L'ora di liberazione e il conto, sul tavolo.
            
            L'ora sta a sinistra perché è quella che si confronta con
            l'orologio; i soldi a destra, dove l'occhio li cerca. Se il conto è
            aperto e vuoto si mette un trattino: dire «0,00 €» sarebbe un
            numero al posto di un fatto.
          */}
          {rigaExtra && (
            <span className="flex w-full items-center gap-1 text-[10px] leading-tight opacity-80">
              {oraLibero && !oltre && <span>→ {oraLibero}</span>}
              {corrente.conto && (
                <span className="ml-auto font-semibold">{soldi ?? "conto aperto"}</span>
              )}
            </span>
          )}

          {/* Il pagamento dal tavolo, quando c'è: una riga sua, perché non è
              un dettaglio del conto ma un'istruzione per chi cammina. */}
          {qr && (
            <span className={cn("w-full text-[10px] font-semibold leading-tight", qr.tono)}>
              {qr.segno}
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-[10px] leading-tight opacity-70">{TABLE_LIVE_LABELS[stato]}</span>
          {/*
            Un tavolo libero con qualcuno in arrivo non è un tavolo libero.
            Qui si dice «alle» e non «poi»: «poi» ha senso dopo qualcuno, e su
            questo tavolo non c'è nessuno.
          */}
          {info?.next && (
            <span className="w-full truncate text-[10px] leading-tight opacity-70">
              alle {oraInVenue(info.next.startsAt, timezone)} · {info.next.partySize}p
            </span>
          )}
        </>
      )}
    </button>
  );
}

/**
 * Un tavolo in elenco — la forma che la mappa prende sul telefono.
 *
 * La riga **si tocca**, e apre il profilo del tavolo: è la stessa promessa dei
 * riquadri della mappa, e su telefono la mappa non c'è. I due o tre pulsanti a
 * destra restano dove sono e fermano il tocco prima che arrivi alla riga:
 * «Arrivato» e «Accomoda» si premono cinquanta volte a sera, e farli passare
 * per un pannello sarebbe stato togliere per aggiungere.
 */
function TavoloRiga({
  table,
  info,
  timezone,
  canManage,
  onChanged,
  onApri,
  evidenziato = false,
  durataLocale = null,
}: {
  table: RoomTable;
  info: TableLiveInfo | undefined;
  timezone: string;
  canManage: boolean;
  /** La durata misurata del locale, se c'è: serve a capire se questa riga si scosta. */
  durataLocale?: FloorLive["durata"];
  onChanged: () => void;
  /** Apre il profilo del tavolo. */
  onApri?: () => void;
  evidenziato?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);

  const stato = info?.status ?? "LIBERO";
  const stile = STILE_STATO[stato];
  const Icona = stile.icona;
  const corrente = info?.current;

  const fmt = (iso: string) => oraInVenue(iso, timezone);

  async function cambiaStato(nome: string, status: string) {
    if (!corrente) return;
    setBusy(nome);
    setError(null);
    const res = await fetch(`/api/bookings/${corrente.bookingId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await readApiError(res, "Non siamo riusciti ad aggiornare. Riprova."));
      return;
    }
    onChanged();
  }

  return (
    <article
      role={onApri ? "button" : undefined}
      tabIndex={onApri ? 0 : undefined}
      aria-label={onApri ? `Apri il profilo del tavolo ${table.label}` : undefined}
      onClick={onApri}
      onKeyDown={
        onApri
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onApri();
              }
            }
          : undefined
      }
      className={cn(
        "surface rounded-md border p-3",
        evidenziato ? "border-cream" : "border-border",
        onApri && "cursor-pointer transition-colors hover:border-cream/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", stile.classe)}
            >
              <Icona className="h-3 w-3" aria-hidden="true" />
              {TABLE_LIVE_LABELS[stato]}
            </span>
            {/* L'etichetta del tavolo si legge da un metro di distanza: sans
                semibold, non serif. */}
            <span className="text-base font-semibold">{table.label}</span>
            <span className="text-xs text-muted-foreground">{table.seats} posti</span>
          </div>

          {corrente ? (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{corrente.guestName}</span>
              {corrente.isVip && (
                <span className="ml-1.5 rounded-full bg-accent/20 px-2 py-0.5 text-[11px]">VIP</span>
              )}
              {" · "}
              {fmt(corrente.startsAt)} · {corrente.partySize}{" "}
              {corrente.partySize === 1 ? "persona" : "persone"}
              {corrente.liberoVerso && (
                <>
                  {" · "}
                  <span
                    className={cn(corrente.liberoVerso.minuti < 0 && "text-accent-strong")}
                    title={frasePrevisione(corrente.liberoVerso, timezone).dettaglio}
                  >
                    {frasePrevisione(corrente.liberoVerso, timezone).testo}
                    {/*
                      L'etichetta compare solo quando **questa** prenotazione
                      si scosta da ciò che dice la riga in testa alla pagina:
                      il locale ha una durata misurata, ma qui qualcuno ne ha
                      decisa una a mano. Altrimenti sarebbe la stessa frase
                      ripetuta su ogni tavolo.
                    */}
                    {durataLocale && corrente.liberoVerso.fonte === "PREVISTO" && (
                      <span className="ml-1 text-[10px] uppercase tracking-wide opacity-60">
                        durata decisa
                      </span>
                    )}
                  </span>
                </>
              )}
              {corrente.minutesToArrival != null && corrente.status !== "SEATED" && (
                <>
                  {" · "}
                  {corrente.minutesToArrival >= 0
                    ? `fra ${durataUmana(corrente.minutesToArrival)}`
                    : `in ritardo di ${durataUmana(Math.abs(corrente.minutesToArrival))}`}
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {info?.next
                ? `Prossimo: ${info.next.guestName} alle ${fmt(info.next.startsAt)} · ${info.next.partySize}p`
                : TABLE_LIVE_HINTS[stato]}
            </p>
          )}

          {/*
            Il conto aperto sul tavolo.

            Era la cosa che chi sta in sala doveva andare a cercare altrove:
            il tavolo diceva chi c'è e da quando, non a che punto è la cena.
            Un tavolo oltre la durata con settanta euro battuti è una serata
            che va bene; con il conto vuoto è un tavolo che non sta girando.
          */}
          {corrente?.conto && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Receipt className="h-3 w-3" aria-hidden="true" />
              {fraseConto(corrente.conto)}
            </p>
          )}

          {/*
            Chi arriva dopo, **anche mentre il tavolo è occupato**: è la metà
            della decisione. Sapere che si libera verso le 22:30 serve a poco
            se non si sa che alle 22:15 arriva qualcuno su questo tavolo.
          */}
          {corrente && info?.next && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              poi {info.next.guestName} alle {fmt(info.next.startsAt)} · {info.next.partySize}p
              {corrente.liberoVerso &&
                new Date(corrente.liberoVerso.fine).getTime() > new Date(info.next.startsAt).getTime() && (
                  <span className="text-accent-strong">— non fa in tempo</span>
                )}
            </p>
          )}

          {/*
            Cosa sapere di chi è a questo tavolo: l'allergia stava già qui da
            sola, ora è la prima riga di un elenco che dice anche l'occasione,
            la nota scritta dal personale e chi è. Lo stesso componente della
            modalità Servizio.
          */}
          {corrente && <CosaSapere righe={corrente.daSapere} className="mt-1" />}
          {corrente && corrente.combinedWith.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Link2 className="h-3 w-3" aria-hidden="true" />
              unito ad altri {corrente.combinedWith.length}{" "}
              {corrente.combinedWith.length === 1 ? "tavolo" : "tavoli"}
            </p>
          )}
        </div>

        {canManage && corrente && (
          // Il tocco si ferma qui: la riga apre il pannello, questi pulsanti
          // fanno la loro cosa.
          <div
            className="flex flex-wrap items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {(corrente.status === "CONFIRMED" || corrente.status === "PENDING") && (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => cambiaStato("arr", "ARRIVED")}>
                <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "arr" ? "…" : "Arrivato"}
              </Button>
            )}
            {corrente.status === "ARRIVED" && (
              <Button size="sm" variant="accent" disabled={busy !== null} onClick={() => cambiaStato("sit", "SEATED")}>
                <UtensilsCrossed className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "sit" ? "…" : "Accomoda"}
              </Button>
            )}
            {corrente.status === "SEATED" && (
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => cambiaStato("done", "COMPLETED")}>
                <Timer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {busy === "done" ? "…" : "Libera tavolo"}
              </Button>
            )}
            <button
              type="button"
              onClick={() => setMoveOpen(true)}
              aria-label={`Sposta la prenotazione del tavolo ${table.label}`}
              title="Sposta su un altro tavolo"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-current/10"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {moveOpen && corrente && (
        <TablePickerDialog
          open
          onOpenChange={setMoveOpen}
          bookingId={corrente.bookingId}
          partySize={corrente.partySize}
          startsAt={corrente.startsAt}
          titolo={`Sposta ${corrente.guestName}`}
          seatAfter={false}
          onDone={onChanged}
        />
      )}
    </article>
  );
}
