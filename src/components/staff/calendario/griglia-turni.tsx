"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { CartaGiornata, CartaTurno } from "@/components/staff/calendario/carta-turno";
import type { TurnoConPersona, TurnoOrario } from "@/components/staff/calendario/tipi";
import { minutiAOrario, nomeGiornoBreve, numeroGiorno } from "@/lib/turni";
import { usePuntatoreFine } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/*
  LA GRIGLIA.

  Righe = ore, colonne = giorni, e dentro ogni casella le card di chi comincia
  a quell'ora, impilate.

    ┌─ Ore ─┬─ LUN 7 ──┬─ MAR 8 ──┬ …
    │ t.g.  │ ▢ Ferie  │          │   ← tutto il giorno (solo se serve)
    │ 08:00 │          │          │
    │ 09:00 │ ▢ Nicola │ ▢ Luca   │
    │ 12:00 │ ▢ Sara   │ ▢ Davide │
    └───────┴──────────┴──────────┴ …

  **Le righe hanno altezza variabile.** È la scelta che tiene insieme le due
  cose che si contendevano: card larghe quanto la colonna (quindi leggibili) e
  nessuna sovrapposizione. Una riga oraria è alta quanto il giorno più pieno a
  quell'ora — quaranta pixel se non c'è nessuno, quattrocento se alle 18 ne
  entrano quattro. Le card restano allineate alla loro ora su tutti e sette i
  giorni, e la colonna delle ore continua a dire il vero.

  L'alternativa — posizionamento assoluto proporzionale alla durata — è quella
  di prima, ed è quella che con undici persone in servizio produceva undici
  strisce da settanta pixel. La durata adesso è scritta dentro la card.

  Le sovrapposizioni z: angolo 40 > testata 30 > colonna ore 20 > card.
*/

const LARGHEZZA_ORE = 70;
/** Sotto questa larghezza una card non contiene più un nome e cognome su due
 * righe: da qui in giù si scorre in orizzontale invece di comprimere. */
const MIN_COLONNA = 150;
/** L'altezza di un'ora vuota. Sedici ore vuote fanno 640 px: una giornata
 * intera che entra in uno schermo senza scorrere. */
const ALTEZZA_ORA_MIN = 40;
const ALTEZZA_TESTATA = 58;

export type SpostamentoTurno = { date: string; startMinute: number; endMinute: number };

export function GrigliaTurni({
  giorni,
  oggi,
  giornoSelezionato,
  turniOrario,
  turniGiornata,
  fascia,
  canManage,
  oraCorrente,
  onApri,
  onNuovo,
  onSelezionaGiorno,
  onSposta,
}: {
  giorni: string[];
  oggi: string;
  giornoSelezionato: string;
  turniOrario: TurnoOrario[];
  turniGiornata: TurnoConPersona[];
  fascia: { da: number; a: number };
  canManage: boolean;
  /** Minuti da mezzanotte nel fuso del locale, o null se non ancora noto. */
  oraCorrente: number | null;
  onApri: (turno: TurnoConPersona) => void;
  onNuovo: (dateKey: string, minuto: number) => void;
  onSelezionaGiorno: (dateKey: string) => void;
  onSposta: (turno: TurnoOrario, destinazione: SpostamentoTurno) => void;
}) {
  const puntatoreFine = usePuntatoreFine();
  const trascinabile = canManage && puntatoreFine;
  const [inMano, setInMano] = useState<TurnoOrario | null>(null);

  /*
    Otto pixel prima che un clic diventi un trascinamento.

    Senza vincolo di attivazione, dnd-kit considera trascinamento anche il
    micro-movimento che ogni clic col trackpad porta con sé, e aprire il
    dettaglio di un turno diventerebbe questione di quanto si ha la mano
    ferma.
  */
  const sensori = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const ore = useMemo(() => {
    const lista: number[] = [];
    for (let m = fascia.da; m < fascia.a; m += 60) lista.push(m);
    return lista;
  }, [fascia.da, fascia.a]);

  /** `giorno|ora` → i turni che cominciano in quella fascia, in ordine di
   * orario e poi di cognome: due card affiancate nella stessa ora devono
   * stare nello stesso ordine ogni volta che si ricarica. */
  const perCasella = useMemo(() => {
    const m = new Map<string, TurnoOrario[]>();
    for (const t of turniOrario) {
      const ora = fascia.da + Math.floor((t.startMinute - fascia.da) / 60) * 60;
      const chiave = `${t.dateKey}|${ora}`;
      const lista = m.get(chiave);
      if (lista) lista.push(t);
      else m.set(chiave, [t]);
    }
    for (const lista of m.values()) {
      lista.sort(
        (a, b) =>
          a.startMinute - b.startMinute ||
          `${a.persona.lastName} ${a.persona.firstName}`.localeCompare(
            `${b.persona.lastName} ${b.persona.firstName}`,
            "it",
          ),
      );
    }
    return m;
  }, [turniOrario, fascia.da]);

  const giornataPerGiorno = useMemo(() => {
    const m = new Map<string, TurnoConPersona[]>();
    for (const t of turniGiornata) {
      const lista = m.get(t.dateKey);
      if (lista) lista.push(t);
      else m.set(t.dateKey, [t]);
    }
    return m;
  }, [turniGiornata]);

  const conteggi = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of turniOrario) m.set(t.dateKey, (m.get(t.dateKey) ?? 0) + 1);
    return m;
  }, [turniOrario]);

  const oraDiAdesso = oraCorrente == null ? null : fascia.da + Math.floor((oraCorrente - fascia.da) / 60) * 60;

  /*
    All'apertura si scende dove succede qualcosa.

    La griglia parte dalle 8 perché in un ristorante *può* esserci un turno
    alle 8 — ma in quasi nessuno c'è. Lasciata in cima, la schermata si apriva
    su otto righe vuote con il servizio della sera sotto il bordo. Accorciare
    la fascia sarebbe peggio: toglie la possibilità di assegnare un pranzo
    cliccando sulla sua riga. Quindi la fascia resta intera e si scorre, una
    volta sola per periodo — `giaScorso` evita che un `refresh` riporti su una
    schermata che l'utente aveva già portato altrove.
  */
  const primaOra = useMemo(() => {
    if (turniOrario.length === 0) return null;
    return Math.min(...turniOrario.map((t) => fascia.da + Math.floor((t.startMinute - fascia.da) / 60) * 60));
  }, [turniOrario, fascia.da]);

  const contenitoreRef = useRef<HTMLDivElement>(null);
  const primaRigaRef = useRef<HTMLDivElement>(null);
  const fasciaGiornataRef = useRef<HTMLDivElement>(null);
  const giaScorso = useRef<string | null>(null);
  useEffect(() => {
    const contenitore = contenitoreRef.current;
    const riga = primaRigaRef.current;
    const chiave = `${giorni[0]}|${primaOra}`;
    if (!contenitore || !riga || giaScorso.current === chiave) return;
    giaScorso.current = chiave;
    // La fascia «tutto il giorno» è anch'essa appesa in alto: se non la si
    // scala, lo scorrimento porta la prima ora **sotto** di lei.
    const altezzaFascia = fasciaGiornataRef.current?.offsetHeight ?? 0;
    contenitore.scrollTop = Math.max(0, riga.offsetTop - ALTEZZA_TESTATA - altezzaFascia - 6);
  }, [giorni, primaOra]);

  function concludi(evento: DragEndEvent) {
    setInMano(null);
    const turno = inMano;
    const sopra = evento.over?.id;
    if (!turno || typeof sopra !== "string") return;

    const [giorno, oraTesto] = sopra.split("|");
    const ora = Number(oraTesto);
    if (!giorno || Number.isNaN(ora)) return;

    // I minuti dentro l'ora si conservano: un turno che comincia alle 17:30,
    // portato sulla riga delle 19, comincia alle 19:30 — non alle 19 tonde.
    const nuovoInizio = ora + (turno.startMinute % 60);
    const durata = turno.endMinute - turno.startMinute;
    if (giorno === turno.dateKey && nuovoInizio === turno.startMinute) return;

    onSposta(turno, { date: giorno, startMinute: nuovoInizio, endMinute: nuovoInizio + durata });
  }

  const colonne = `${LARGHEZZA_ORE}px repeat(${giorni.length}, minmax(${
    giorni.length > 1 ? MIN_COLONNA : 0
  }px, 1fr))`;
  const haGiornata = turniGiornata.length > 0;

  return (
    <DndContext
      sensors={sensori}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setInMano(turniOrario.find((t) => t.id === e.active.id) ?? null)}
      onDragCancel={() => setInMano(null)}
      onDragEnd={concludi}
    >
      <div ref={contenitoreRef} className="fill-scroll riquadro relative overflow-auto bg-[#0c1a14]">
        <div className="grid min-w-full" style={{ gridTemplateColumns: colonne }}>
          {/* ── testata ────────────────────────────────────────────── */}
          <div
            className="sticky left-0 top-0 z-40 flex items-center justify-center border-b border-r border-border/50 bg-[color:var(--grid-header)]"
            style={{ height: ALTEZZA_TESTATA }}
          >
            <span className="t-etichetta text-[0.62rem]">Ore</span>
          </div>
          {giorni.map((g) => (
            <IntestazioneGiorno
              key={g}
              giorno={g}
              oggi={g === oggi}
              selezionato={g === giornoSelezionato && giorni.length > 1}
              inTurno={conteggi.get(g) ?? 0}
              onSeleziona={() => onSelezionaGiorno(g)}
            />
          ))}

          {/* ── tutto il giorno ────────────────────────────────────── */}
          {haGiornata && (
            <>
              {/*
                La fascia resta **appesa sotto la testata**.

                Non lo era, e il difetto si vedeva solo insieme all'altra cosa
                giusta: la griglia si apre scorrendo fino alla prima ora con
                dei turni, e in un locale che apre alle cinque quello vuol dire
                saltare otto righe vuote — e con loro la fascia, cioè proprio
                la risposta a «chi manca oggi». O si rinunciava allo
                scorrimento automatico, o la fascia si ancora. Si ancora.
              */}
              <div
                ref={fasciaGiornataRef}
                className="sticky left-0 z-40 border-b border-r border-border/40 bg-[#0c1a14] px-2 py-1.5"
                style={{ top: ALTEZZA_TESTATA }}
              >
                <span className="block text-[0.58rem] uppercase leading-[1.15] tracking-wide text-tertiary-foreground">
                  tutto
                  <br />
                  il giorno
                </span>
              </div>
              {giorni.map((g) => (
                <div
                  key={g}
                  style={{ top: ALTEZZA_TESTATA }}
                  className={cn(
                    "sticky z-30 space-y-1 border-b border-r border-border/40 bg-[#0c1a14] p-1.5",
                    g === oggi && "bg-[#132a20]",
                  )}
                >
                  {(giornataPerGiorno.get(g) ?? []).map((t) => (
                    <CartaGiornata key={t.id} turno={t} interattiva={canManage} onApri={() => onApri(t)} />
                  ))}
                </div>
              ))}
            </>
          )}

          {/* ── le ore ─────────────────────────────────────────────── */}
          {ore.map((ora) => (
            <Fragment key={ora}>
              <div
                ref={ora === primaOra ? primaRigaRef : undefined}
                className="sticky left-0 z-20 border-r border-border/40 bg-[#0c1a14] pt-1.5 text-center"
                style={{ minHeight: ALTEZZA_ORA_MIN }}
              >
                <span
                  className={cn(
                    "text-[0.68rem] tabular-nums",
                    ora === oraDiAdesso ? "font-medium text-accent-strong" : "text-tertiary-foreground",
                  )}
                >
                  {minutiAOrario(ora)}
                </span>
              </div>
              {giorni.map((g) => (
                <CasellaOra
                  key={`${g}|${ora}`}
                  giorno={g}
                  ora={ora}
                  oggi={g === oggi}
                  selezionato={g === giornoSelezionato && giorni.length > 1}
                  adesso={g === oggi && ora === oraDiAdesso}
                  turni={perCasella.get(`${g}|${ora}`) ?? []}
                  canManage={canManage}
                  trascinabile={trascinabile}
                  onApri={onApri}
                  onNuovo={onNuovo}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Il fantasma che segue il puntatore. Senza, si trascina un buco. */}
      <DragOverlay dropAnimation={null}>
        {inMano && (
          <div style={{ width: MIN_COLONNA - 12 }} className="rotate-[1.5deg] opacity-95 shadow-2xl">
            <CartaTurno turno={inMano} interattiva={false} trascinabile={false} onApri={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function CasellaOra({
  giorno,
  ora,
  oggi,
  selezionato,
  adesso,
  turni,
  canManage,
  trascinabile,
  onApri,
  onNuovo,
}: {
  giorno: string;
  ora: number;
  oggi: boolean;
  selezionato: boolean;
  adesso: boolean;
  turni: TurnoOrario[];
  canManage: boolean;
  trascinabile: boolean;
  onApri: (turno: TurnoConPersona) => void;
  onNuovo: (dateKey: string, minuto: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${giorno}|${ora}` });

  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        // Solo lo sfondo: un clic partito da una card ha già fatto la sua cosa.
        if (e.target !== e.currentTarget || !canManage) return;
        onNuovo(giorno, ora);
      }}
      style={{ minHeight: ALTEZZA_ORA_MIN }}
      className={cn(
        "group/cella relative space-y-1.5 border-b border-r border-border/25 p-1.5 transition-colors",
        oggi && "bg-cream/[0.035]",
        !oggi && selezionato && "bg-cream/[0.018]",
        isOver && "bg-[hsl(var(--turno-sera)/0.14)] ring-1 ring-inset ring-[hsl(var(--turno-sera)/0.45)]",
        adesso && "shadow-[inset_0_1.5px_0_0_var(--mark-now)]",
        canManage && "cursor-copy",
      )}
    >
      {turni.map((t) => (
        <CartaTurno
          key={t.id}
          turno={t}
          interattiva={canManage}
          trascinabile={trascinabile}
          onApri={() => onApri(t)}
        />
      ))}

      {canManage && turni.length === 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1.5 top-1.5 text-muted-foreground/0 transition-colors group-hover/cella:text-muted-foreground/40"
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

function IntestazioneGiorno({
  giorno,
  oggi,
  selezionato,
  inTurno,
  onSeleziona,
}: {
  giorno: string;
  oggi: boolean;
  selezionato: boolean;
  inTurno: number;
  onSeleziona: () => void;
}) {
  const data = new Date(`${giorno}T12:00:00`);
  // «7 Settembre», non «7 settembre»: è una testata di colonna, non una frase.
  const lungo = data
    .toLocaleDateString("it-IT", { day: "numeric", month: "long" })
    .replace(/\p{L}+$/u, (mese) => mese.charAt(0).toUpperCase() + mese.slice(1));

  return (
    <button
      type="button"
      onClick={onSeleziona}
      aria-current={selezionato ? "date" : undefined}
      // La copertura non si disegna più nella testata: il conteggio sta qui,
      // dove serve a chi passa il puntatore, e le card sotto si contano a
      // occhio perché adesso sono grandi.
      title={`${lungo} · ${inTurno} in turno`}
      style={{ height: ALTEZZA_TESTATA }}
      className={cn(
        "sticky top-0 z-30 flex flex-col items-center justify-center gap-0.5 border-b border-r border-border/50 bg-[color:var(--grid-header)] px-2 transition-colors hover:bg-[color:var(--grid-header-hover)]",
        oggi && "bg-[color:var(--grid-header-today)]",
        selezionato && "shadow-[inset_0_-2px_0_0_var(--mark-selected)]",
      )}
    >
      <span className="flex items-baseline gap-1.5">
        <span className="t-etichetta text-[0.62rem]">{nomeGiornoBreve(giorno)}</span>
        <span
          className={cn(
            "text-[0.95rem] font-semibold leading-none tabular-nums",
            oggi ? "text-accent-strong" : "text-foreground/90",
          )}
        >
          {numeroGiorno(giorno)}
        </span>
      </span>
      <span className="truncate text-[0.66rem] leading-tight text-muted-foreground">{lungo}</span>
    </button>
  );
}
