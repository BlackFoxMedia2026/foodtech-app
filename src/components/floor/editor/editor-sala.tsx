"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Table } from "@prisma/client";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Map as MapIcon,
  MoreVertical,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAvvisi } from "@/components/ui/avvisi";
import { cn } from "@/lib/utils";
import type { RoomElement, RoomInventory, RoomLayers, RoomMeta } from "@/lib/room-layout";
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
};

const LINGUETTE: { chiave: ModalitaCanvas; etichetta: string }[] = [
  { chiave: "modifica", etichetta: "Modifica" },
  { chiave: "anteprima", etichetta: "Anteprima" },
  { chiave: "originale", etichetta: "Vedi originale" },
];

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
}) {
  const router = useRouter();
  const avvisi = useAvvisi();
  const [modalita, setModalita] = useState<ModalitaCanvas>("modifica");
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
    abilitato: modalita === "modifica",
    onSalvato: () => router.refresh(),
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
      const esito = await editor.piazzaTavolo(tipo.shape, punto);
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ══════════════════ TESTATA ══════════════════ */}
      <header className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-etichetta">Sala</p>
          <div className="flex min-w-0 items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onCambiaSala(-1)}
              disabled={totaleSale <= 1}
              aria-label="Sala precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="min-w-0 truncate text-display text-xl leading-none sm:text-2xl">{sala.name}</h1>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => onCambiaSala(1)}
              disabled={totaleSale <= 1}
              aria-label="Sala successiva"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Azioni sala">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setGestisciAperto(true)}>
                  <MapIcon className="h-4 w-4" /> Gestisci piantina
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setNuovoTavoloAperto(true)}>
                  <Plus className="h-4 w-4" /> Nuovo tavolo
                </DropdownMenuItem>
                {vociMenuSala}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="mt-0.5 text-xs text-tertiary-foreground">
            <span className="tabular-nums">{editor.tavoliSullaPiantina.length}</span> tavoli ·{" "}
            <span className="tabular-nums">{postiTotali}</span> posti totali
            {totaleSale > 1 && (
              <span className="ml-1.5 tabular-nums">
                · sala {indiceSala + 1} di {totaleSale}
              </span>
            )}
            {editor.sporco && <span className="ml-1.5 text-accent">· non salvata</span>}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <FloorServiceFilter date={date} service={service} serviceOptions={serviceOptions} variante="barra" />
            {assegnati && (
              <span className="riquadro bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
                <span className="tabular-nums text-card-foreground">{assegnati.assegnati}</span> di{" "}
                <span className="tabular-nums text-card-foreground">{assegnati.totale}</span> tavoli assegnati
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="subtle" size="sm" onClick={() => setGestisciAperto(true)}>
              <MapIcon className="h-4 w-4" /> Gestisci piantina
            </Button>
            <Button type="button" variant="subtle" size="sm" onClick={() => setNuovoTavoloAperto(true)}>
              <Plus className="h-4 w-4" /> Nuovo tavolo
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={salva}
              disabled={editor.salvando || !editor.sporco}
              className={cn("transition-colors duration-300", editor.appenaSalvato && "bg-sage text-forest hover:bg-sage")}
            >
              {editor.appenaSalvato ? (
                <>
                  <Check className="h-4 w-4" /> Sala salvata
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {editor.salvando ? "Salvataggio…" : "Salva sala"}
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* ══════════════════ TRE COLONNE ══════════════════ */}
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
          <div className="flex shrink-0 items-center gap-2">
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

            <div role="tablist" aria-label="Modalità della piantina" className="flex items-center gap-0.5 rounded-lg bg-secondary/50 p-0.5">
              {LINGUETTE.map(({ chiave, etichetta }) => {
                const attiva = modalita === chiave;
                const indisponibile = chiave === "originale" && !sala.floorPlanUrl;
                return (
                  <button
                    key={chiave}
                    type="button"
                    role="tab"
                    aria-selected={attiva}
                    disabled={indisponibile}
                    title={indisponibile ? "Nessuna piantina caricata per questa sala" : undefined}
                    onClick={() => setModalita(chiave)}
                    className={cn(
                      "tocco-comodo rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      attiva ? "bg-segment text-segment-ink-forest shadow-sm" : "text-muted-foreground hover:text-foreground",
                      indisponibile && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                    )}
                  >
                    {etichetta}
                  </button>
                );
              })}
            </div>

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

          <div className="surface min-h-0 flex-1 overflow-hidden rounded-xl p-0">
            <CanvasSala
              editor={editor}
              modalita={modalita}
              urlOriginale={sala.floorPlanUrl}
              nomeSala={sala.name}
              staffByTableId={staffByTableId}
              statusByTableId={statusByTableId}
              onApriProfilo={setProfiloTableId}
            />
          </div>
        </div>

        <aside
          className={cn(
            "z-20 w-[268px] shrink-0 flex-col gap-3 overflow-y-auto xl:static xl:flex",
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
