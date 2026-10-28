"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { RoomLayoutMode, Table } from "@prisma/client";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  MoreVertical,
  PanelLeftClose,
  PanelRightClose,
  Pencil,
  Plus,
  Receipt,
  Save,
  UserCheck,
} from "lucide-react";
import { NomeEspandibile } from "@/components/floor/nome-espandibile";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvvisi } from "@/components/ui/avvisi";
import { cn } from "@/lib/utils";
import { isTableRef, type RoomElement, type RoomInventory, type RoomLayers, type RoomMeta } from "@/lib/room-layout";
import type { TableOperationalStatus } from "@/lib/table-status";
import type { TableStaffMap } from "@/components/floor/table-node";
import { TableDialog } from "@/components/floor/table-dialog";
import { FloorServiceFilter } from "@/components/floor/floor-service-filter";
import { TableProfileDrawer, type PermessiTavolo } from "@/components/tables/table-profile-drawer";
import { CanvasSala, type ModalitaCanvas } from "./canvas-sala";
import { GestisciPiantinaDialog } from "./gestisci-piantina-dialog";
import { LibreriaElementi } from "./libreria-elementi";
import { PannelloInformazioni, PannelloLivelli, PannelloOriginale, PannelloProprieta } from "./pannelli-destra";
import { useEditorSala, type EsitoSalvataggio, type TipoTrascinabile } from "./use-editor-sala";
import { BookingsFloorView } from "@/components/bookings/floor/bookings-floor-view";
import type { Row } from "@/components/bookings/bookings-page-client";

export type SalaPerEditor = {
  id: string;
  name: string;
  width: number;
  height: number;
  floorPlanUrl: string | null;
  elements: RoomElement[];
  layers: RoomLayers;
  inventory: RoomInventory;
  meta: RoomMeta;
  riassuntoAnalisi: string | null;
  /** Per la mappa delle prenotazioni: la modalità attiva della sala e la
   * piantina com'è salvata. */
  activeLayoutMode: RoomLayoutMode | null;
  roomLayoutElements: unknown;
};

/**
 * Le due cose che si fanno in questa pagina, e sono due lavori diversi:
 * **disegnare** la sala (una volta, con calma) e **riempirla** di prenotazioni
 * (ogni giorno, di corsa). Per questo sono due linguette e non tre livelli
 * dello stesso disegno: chi assegna i tavoli non deve vedere la colonna degli
 * elementi, e chi disegna non ha bisogno dell'elenco degli ospiti.
 */
type Vista = "modifica" | "prenotazioni";
const VISTE: { chiave: Vista; etichetta: string; icona: React.ComponentType<{ className?: string }> }[] = [
  { chiave: "modifica", etichetta: "Modifica", icona: Pencil },
  { chiave: "prenotazioni", etichetta: "Gestisci prenotazioni", icona: Receipt },
];

/** Un tavolo tondo con quattro sedie: lucide ha solo tabelle da foglio di
 * calcolo, e qui «tavolo» vuol dire questo. */
function IconaTavolo() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="3.6" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.3" />
      <g fill="currentColor">
        <rect x="6.6" y="0.8" width="2.8" height="1.8" rx="0.9" />
        <rect x="6.6" y="13.4" width="2.8" height="1.8" rx="0.9" />
        <rect x="0.8" y="6.6" width="1.8" height="2.8" rx="0.9" />
        <rect x="13.4" y="6.6" width="1.8" height="2.8" rx="0.9" />
      </g>
    </svg>
  );
}

function Divisore() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />;
}

/**
 * Mette il contenuto nella testata dell'app, nel posto del titolo della
 * pagina (`#titolo-su-misura`, nel VenueSwitcher). Finché il posto non c'è
 * — il primo passaggio sul server — non mostra niente: il titolo di sempre
 * resta lì e viene sostituito appena la pagina si monta.
 */
function TitoloInTestata({ children }: { children: React.ReactNode }) {
  const [posto, setPosto] = useState<HTMLElement | null>(null);
  useEffect(() => setPosto(document.getElementById("titolo-su-misura")), []);
  return posto ? createPortal(children, posto) : null;
}

/**
 * La Sala.
 *
 * Tre colonne e una tela in mezzo, come qualunque strumento che serva a
 * disporre cose in uno spazio. La proporzione non è un gusto: la tela prende
 * tutto quello che avanza, e le due colonne hanno una larghezza fissa perché
 * i loro contenuti non migliorano diventando più larghi — una riga «Tavolo
 * quadrato» larga il doppio resta una riga.
 *
 * Le tre linguette sono **lo stesso disegno con tre livelli di verità**:
 * Modifica mostra anche gli strumenti, Anteprima solo la sala come la vedrà
 * chi lavora, Vedi originale la scansione da cui tutto è partito. Non sono
 * tre schermate e non cambiano i dati: cambiano cosa si può toccare.
 */
export function EditorSala({
  sala,
  tavoli,
  indiceSala,
  totaleSale,
  onCambiaSala,
  vociMenuSala,
  date,
  service,
  serviceOptions,
  staffByTableId,
  statusByTableId,
  permessi,
  onSporcoChange,
  salvaRef,
  prenotazioni,
  finestraServizio,
}: {
  sala: SalaPerEditor;
  tavoli: Table[];
  indiceSala: number;
  totaleSale: number;
  onCambiaSala: (delta: number) => void;
  vociMenuSala?: React.ReactNode;
  date: string;
  service: string;
  serviceOptions: string[];
  staffByTableId?: Record<string, TableStaffMap>;
  statusByTableId?: Record<string, TableOperationalStatus>;
  permessi: PermessiTavolo;
  onSporcoChange?: (sporco: boolean) => void;
  /** La vista delle sale ha bisogno di poter salvare da fuori — quando si
   * cambia sala con modifiche in sospeso. Il salvataggio resta qui, dove
   * sta lo stato che deve salvare; di la' passa solo il permesso di
   * chiamarlo. */
  salvaRef?: React.MutableRefObject<(() => Promise<EsitoSalvataggio>) | null>;
  prenotazioni: Row[];
  finestraServizio: { start: Date; end: Date } | null;
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [vista, setVista] = useState<Vista>("modifica");
  // Dentro «Modifica» resta la possibilità di guardare la scansione
  // originale (dal pannello «Immagine originale»): non è una vista a sé.
  const [modalita, setModalita] = useState<ModalitaCanvas>("modifica");
  // Le prenotazioni cambiano mentre le si assegna: la mappa le aggiorna qui,
  // e alla prossima navigazione la pagina le rilegge dal server.
  const [righe, setRighe] = useState(prenotazioni);
  useEffect(() => setRighe(prenotazioni), [prenotazioni]);
  // Nella mappa delle prenotazioni vanno solo i tavoli **sulla piantina
  // salvata**: quelli della colonna «Non posizionati» esistono, ma non hanno
  // un posto nella sala, e comparivano tutti ammucchiati nelle loro vecchie
  // coordinate. Una piantina senza segnaposti (fatta prima dell'editor)
  // mostra tutti i tavoli della sala, come la mappa ha sempre fatto.
  const tavoliSalvatiSullaPiantina = useMemo(() => {
    const segnaposti = new Set(sala.elements.filter(isTableRef).map((e) => e.tableId));
    return segnaposti.size > 0 ? tavoli.filter((t) => segnaposti.has(t.id)) : tavoli;
  }, [sala.elements, tavoli]);
  const [gestisciAperto, setGestisciAperto] = useState(false);
  const [nuovoTavoloAperto, setNuovoTavoloAperto] = useState(false);
  const [profiloTableId, setProfiloTableId] = useState<string | null>(null);
  const [sinistraAperta, setSinistraAperta] = useState(false);
  const [destraAperta, setDestraAperta] = useState(false);

  const editor = useEditorSala({
    roomId: sala.id,
    elementiIniziali: sala.elements,
    tavoliIniziali: tavoli,
    larghezzaIniziale: sala.width,
    altezzaIniziale: sala.height,
    layersIniziali: sala.layers,
    inventarioIniziale: sala.inventory,
    metaIniziale: sala.meta,
    abilitato: vista === "modifica" && modalita === "modifica",
    onSalvato: () => router.refresh(),
    onAvviso: (testo, tono) => (tono === "fatto" ? avvisi.mostra(testo) : avvisi.problema(testo)),
  });

  useEffect(() => {
    onSporcoChange?.(editor.sporco);
  }, [editor.sporco, onSporcoChange]);

  // Uscendo da Modifica la selezione non ha più un pannello che la spiega, e
  // un contorno arancione su un tavolo che non si può toccare è solo rumore.
  useEffect(() => {
    if (modalita !== "modifica") editor.deseleziona();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalita]);

  const postiTotali = useMemo(
    () => editor.tavoliSullaPiantina.reduce((s, t) => s + t.seats, 0),
    [editor.tavoliSullaPiantina],
  );

  const assegnati = useMemo(() => {
    if (!staffByTableId) return null;
    const conResponsabile = editor.tavoliSullaPiantina.filter((t) => staffByTableId[t.id]?.TABLE_RESPONSIBLE).length;
    return { assegnati: conResponsabile, totale: editor.tavoliSullaPiantina.length };
  }, [staffByTableId, editor.tavoliSullaPiantina]);

  /** Il centro di quello che si sta guardando, in coordinate della piantina:
   * è lì che finisce un elemento aggiunto con un clic invece che trascinato. */
  const centroVista = useCallback(() => {
    const rect = editor.camera.viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: editor.dims.width / 2, y: editor.dims.height / 2 };
    return editor.alMondo(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [editor]);

  const posizionaAlCentro = useCallback(
    async (tipo: TipoTrascinabile) => {
      const punto = editor.puntoLibero(centroVista());
      if (tipo.genere !== "tavolo") {
        editor.creaElementoA(tipo, punto);
        return;
      }
      const esito = await editor.piazzaTavolo(tipo.shape, punto, tipo.modello, tipo.tavoloId);
      if (esito === "esauriti") {
        avvisi.problema(
          "Hai già posizionato tutti i tavoli di questo tipo che hai dichiarato. Cambia la quantità dichiarata per aggiungerne altri.",
        );
      } else if (esito === "errore") {
        avvisi.problema("Non è stato possibile creare il tavolo. Riprova fra un momento.");
      }
    },
    [editor, centroVista, avvisi],
  );

  const salva = useCallback(async () => {
    const esito = await editor.salva();
    if (esito === "errore") {
      avvisi.problema("Sala non salvata: le modifiche sono ancora qui, riprova fra un momento.");
    }
    return esito;
  }, [editor, avvisi]);

  useEffect(() => {
    if (!salvaRef) return;
    salvaRef.current = salva;
    return () => {
      salvaRef.current = null;
    };
  }, [salvaRef, salva]);


  /*
    La barra degli strumenti: una capsula che galleggia in basso al centro,
    sopra la tela, come in qualunque programma per disegnare. Sta in basso
    perché in alto ci sono già annulla/rifai e lo zoom, e perché lì copre la
    parte della sala che si guarda meno; è stretta perché è quasi solo
    icone, e ogni voce mostra il suo nome al passaggio del puntatore.
    Gli avvisi della vista le stanno sopra, solo quando servono.
  */
  const barraStrumenti = (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex flex-col items-center gap-1.5 px-3">
      {vista === "modifica" && modalita === "originale" && (
        <button
          type="button"
          onClick={() => setModalita("modifica")}
          className="vetro fissa pointer-events-auto rounded-full px-3 py-1.5 text-xs font-medium text-accent-strong hover:underline"
        >
          Stai guardando la piantina originale · torna alla modifica
        </button>
      )}
      {/* La mappa delle prenotazioni legge la sala salvata: se ci sono
          modifiche in sospeso, meglio dirlo che mostrarla diversa. */}
      {vista === "prenotazioni" && editor.sporco && (
        <p className="vetro fissa rounded-full px-3 py-1.5 text-xs text-accent-strong">
          La sala ha modifiche non salvate: qui vedi l&apos;ultima versione salvata.
        </p>
      )}

      <div
        role="toolbar"
        aria-label="Strumenti della sala"
        className="vetro fissa pointer-events-auto flex max-w-full items-center gap-1 rounded-full p-1.5"
      >
        {/* Tavoli e posti: il numero sempre, le parole al passaggio. */}
        <span
          tabIndex={0}
          aria-label={`${editor.tavoliSullaPiantina.length} tavoli, ${postiTotali} posti`}
          className="group flex h-8 shrink-0 items-center rounded-full px-2.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconaTavolo />
          <span className="ml-1.5 font-medium tabular-nums text-foreground">{editor.tavoliSullaPiantina.length}</span>
          <NomeEspandibile>
            tavoli · <span className="tabular-nums">{postiTotali}</span> posti
          </NomeEspandibile>
        </span>

        <Divisore />

        {/* Le due viste: matita per disegnare, scontrino per le prenotazioni.
            Quella scelta tiene il nome aperto. */}
        <div role="tablist" aria-label="Cosa fare nella sala" className="flex shrink-0 items-center gap-0.5">
          {VISTE.map(({ chiave, etichetta, icona: Icona }) => {
            const attiva = vista === chiave;
            return (
              <button
                key={chiave}
                type="button"
                role="tab"
                aria-selected={attiva}
                aria-label={etichetta}
                title={etichetta}
                onClick={() => {
                  setVista(chiave);
                  setModalita("modifica");
                }}
                className={cn(
                  "group flex h-8 items-center rounded-full px-2.5 text-xs font-medium transition-colors",
                  attiva
                    ? "bg-segment text-segment-ink-forest shadow-sm"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                )}
              >
                <Icona className="h-4 w-4 shrink-0" />
                <NomeEspandibile aperto={attiva}>{etichetta}</NomeEspandibile>
              </button>
            );
          })}
        </div>

        <Divisore />

        <FloorServiceFilter date={date} service={service} serviceOptions={serviceOptions} variante="compatta" />
        {assegnati && (
          <span
            tabIndex={0}
            aria-label={`${assegnati.assegnati} di ${assegnati.totale} tavoli con un responsabile assegnato`}
            className="group flex h-8 shrink-0 items-center rounded-full px-2.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserCheck className="h-4 w-4 shrink-0" />
            <span className="ml-1.5 font-medium tabular-nums text-foreground">
              {assegnati.assegnati}/{assegnati.totale}
            </span>
            <NomeEspandibile>assegnati</NomeEspandibile>
          </span>
        )}

        <Divisore />

        <button
          type="button"
          onClick={() => setGestisciAperto(true)}
          aria-label="Gestisci piantina"
          title="Gestisci piantina"
          className="group flex h-8 shrink-0 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <MapIcon className="h-4 w-4 shrink-0" />
          <NomeEspandibile>Gestisci piantina</NomeEspandibile>
        </button>
        <button
          type="button"
          onClick={() => setNuovoTavoloAperto(true)}
          aria-label="Nuovo tavolo"
          title="Nuovo tavolo"
          className="group flex h-8 shrink-0 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <NomeEspandibile>Nuovo tavolo</NomeEspandibile>
        </button>
        {/* Il disco: si apre da solo mentre salva e appena salvato, perché
            in quei due momenti è una risposta, non un'offerta. Il punto
            d'oro dice che c'è qualcosa da salvare. */}
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={salva}
          disabled={editor.salvando || !editor.sporco}
          aria-label={editor.appenaSalvato ? "Sala salvata" : editor.salvando ? "Salvataggio in corso" : "Salva sala"}
          title={editor.sporco ? "Salva sala · ci sono modifiche non salvate" : "Salva sala"}
          className={cn(
            "group relative h-8 shrink-0 gap-0 px-2.5 transition-colors duration-300",
            editor.appenaSalvato && "bg-sage text-forest hover:bg-sage",
          )}
        >
          {editor.appenaSalvato ? <Check className="h-4 w-4 shrink-0" /> : <Save className="h-4 w-4 shrink-0" />}
          <NomeEspandibile aperto={editor.salvando || editor.appenaSalvato}>
            {editor.appenaSalvato ? "Sala salvata" : editor.salvando ? "Salvataggio…" : "Salva sala"}
          </NomeEspandibile>
          {editor.sporco && !editor.salvando && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background"
              aria-hidden="true"
            />
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ══════════════════ NOME DELLA SALA ══════════════════ */}
      {/*
        Il nome della sala va nella testata dell'app, al posto di «Sala ·
        nome del locale»: dice la stessa cosa con una parola più utile, e la
        riga che occupava qui torna alla tela.
      */}
      <TitoloInTestata>
        <div className="flex min-w-0 items-center gap-0.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => onCambiaSala(-1)}
            disabled={totaleSale <= 1}
            aria-label="Sala precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1
            className="min-w-0 truncate text-display text-lg leading-none sm:text-xl"
            title={totaleSale > 1 ? `${sala.name} · sala ${indiceSala + 1} di ${totaleSale}` : sala.name}
          >
            {sala.name}
          </h1>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => onCambiaSala(1)}
            disabled={totaleSale <= 1}
            aria-label="Sala successiva"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Azioni sala">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">{vociMenuSala}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TitoloInTestata>

      {vista === "prenotazioni" ? (
        <div className="relative min-h-0 flex-1">
          {barraStrumenti}
          <BookingsFloorView
            rooms={[
              {
                id: sala.id,
                name: sala.name,
                width: sala.width,
                height: sala.height,
                floorPlanUrl: sala.floorPlanUrl,
                activeLayoutMode: sala.activeLayoutMode,
                roomLayoutElements: sala.roomLayoutElements,
                tables: tavoliSalvatiSullaPiantina,
              },
            ]}
            incorporata
            rows={righe}
            shiftWindow={finestraServizio}
            canManage={permessi.prenotazioni}
            onBookingUpdated={(aggiornata) =>
              setRighe((prima) => prima.map((r) => (r.id === aggiornata.id ? aggiornata : r)))
            }
          />
        </div>
      ) : (
      /* ══════════════════ TRE COLONNE ══════════════════ */
      <div className="flex min-h-0 flex-1 gap-3">
        {/*
          Su desktop le colonne stanno: sono strumenti, e uno strumento che si
          apre e si chiude a ogni uso è più lento dello strumento che sta lì.
          Da tablet in giù non ci starebbero senza schiacciare la tela, e
          allora diventano due cassetti che scorrono sopra.
        */}
        <aside
          className={cn(
            "surface z-20 w-[236px] shrink-0 overflow-hidden rounded-xl xl:static xl:block",
            sinistraAperta ? "absolute inset-y-0 left-0 block" : "hidden xl:block",
          )}
        >
          <LibreriaElementi editor={editor} onPosiziona={posizionaAlCentro} />
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-2 xl:hidden">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 xl:hidden"
              onClick={() => setSinistraAperta((v) => !v)}
              aria-label="Mostra elementi"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="ml-auto h-8 w-8 shrink-0 xl:hidden"
              onClick={() => setDestraAperta((v) => !v)}
              aria-label="Mostra proprietà"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>

          <div className="surface relative min-h-0 flex-1 overflow-hidden rounded-xl p-0">
            <CanvasSala
              editor={editor}
              modalita={modalita}
              urlOriginale={sala.floorPlanUrl}
              nomeSala={sala.name}
              staffByTableId={staffByTableId}
              statusByTableId={statusByTableId}
              onApriProfilo={setProfiloTableId}
            />
            {barraStrumenti}
          </div>
        </div>

        <aside
          className={cn(
            "vi-scorre z-20 w-[268px] shrink-0 flex-col gap-3 overflow-y-auto xl:static xl:flex",
            destraAperta ? "absolute inset-y-0 right-0 flex bg-background p-2" : "hidden xl:flex",
          )}
        >
          <PannelloProprieta editor={editor} staffByTableId={staffByTableId} modificabile={modalita === "modifica"} />
          <PannelloInformazioni editor={editor} nomeSala={sala.name} modificabile={modalita === "modifica"} />
          <PannelloLivelli editor={editor} haOriginale={Boolean(sala.floorPlanUrl)} />
          <PannelloOriginale
            url={sala.floorPlanUrl}
            nomeSala={sala.name}
            riassuntoAnalisi={sala.riassuntoAnalisi}
            onMostra={() => setModalita("originale")}
          />
        </aside>
      </div>
      )}

      {/* ══════════════════ FINESTRE ══════════════════ */}
      <GestisciPiantinaDialog
        aperto={gestisciAperto}
        onApertoChange={setGestisciAperto}
        roomId={sala.id}
        nomeSala={sala.name}
        urlCorrente={sala.floorPlanUrl}
        onPiantinaPronta={(elementi, larghezza, altezza) => {
          editor.sostituisciPiantina(elementi, larghezza, altezza);
          setModalita("modifica");
        }}
      />

      <TableDialog
        open={nuovoTavoloAperto}
        onOpenChange={setNuovoTavoloAperto}
        roomId={sala.id}
        roomName={sala.name}
        onSalvato={(t) => {
          editor.aggiungiTavoloEsistente(t, centroVista());
          setNuovoTavoloAperto(false);
        }}
        // Dal modulo si salvano e si cancellano predefiniti: la colonna
        // degli elementi li deve mostrare subito.
        onPredefinitiCambiati={editor.ricaricaPredefiniti}
      />

      {/*
        Il profilo del tavolo: **lo stesso pannello del Servizio**, e si apre
        solo in Anteprima. In Modifica un clic su un tavolo significa
        «selezionalo per spostarlo», e le due cose non possono voler dire lo
        stesso gesto.
      */}
      <TableProfileDrawer
        tableId={profiloTableId}
        onOpenChange={(aperto) => {
          if (!aperto) setProfiloTableId(null);
        }}
        permessi={permessi}
        giorno={date || null}
        servizio={service || null}
        onDatiCambiati={() => router.refresh()}
      />
    </div>
  );
}
