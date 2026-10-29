"use client";

import { useState } from "react";
import type { TableShape } from "@prisma/client";
import {
  Box,
  Check,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Link2,
  Lock,
  LockOpen,
  Minus,
  Pencil,
  Plus,
  Ruler,
  Trash2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAvvisi } from "@/components/ui/avvisi";
import {
  AREA_LABELS,
  ROOM_LAYER_KEYS,
  estimateAreaSqm,
  formatMeters,
  isArea,
  isColumn,
  isDoor,
  isFree,
  isSegment,
  isText,
  isWindow,
  boundingBox,
  metersToPx,
  pxToMeters,
  wallLength,
  type RoomElement,
  type RoomLayerKey,
} from "@/lib/room-layout";
import { ETICHETTE_FORMA, dimensioneDisegnata, SPAZIO_MINIMO_PASSAGGIO_PX } from "@/lib/tavolo-geometria";
import { TABLE_ROLE_LABELS } from "@/lib/staff-roles";
import { TABLE_ROLE_ICONS } from "@/components/floor/staff-role-icons";
import type { TableStaffMap } from "@/components/floor/table-node";
import type { EditorSala } from "./use-editor-sala";

const ETICHETTE_LAYER: Record<RoomLayerKey, string> = {
  tables: "Tavoli",
  structure: "Elementi strutturali",
  areas: "Aree e zone",
  texts: "Testi",
  original: "Immagine originale",
};

/* ══════════════════════════ SCHEDA ══════════════════════════ */

export function SchedaPannello({
  icona: Icona,
  titolo,
  azione,
  children,
}: {
  icona: React.ComponentType<{ className?: string }>;
  titolo: string;
  azione?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Una scheda da sito, non da gestionale: niente fascia né filo sotto la
  // testata, il titolo nel serif e l'icona nella cupola verde delle tessere
  // della Panoramica. Una velatura d'oro scende dall'alto e si spegne a metà:
  // è quello che separa la colonna di chi regola da quella degli elementi,
  // che resta crema piena. `shrink-0`: con `overflow-hidden` la scheda, in
  // una colonna che scorre, si lascerebbe schiacciare e taglierebbe le ultime
  // righe invece di far scorrere la colonna.
  return (
    <section className="riquadro shrink-0 overflow-hidden bg-card bg-gradient-to-b from-accent/[0.07] via-transparent to-transparent text-card-foreground">
      <header className="flex items-center gap-2.5 px-3.5 pb-1 pt-2.5">
        <span className="vetro kpi-pastiglia grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--control-ink)]">
          <Icona className="h-3.5 w-3.5" />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-display text-[15px] leading-tight tracking-[-0.01em]">{titolo}</h3>
        {azione}
      </header>
      <div className="mx-3.5 h-px bg-gradient-to-r from-accent/30 via-accent/10 to-transparent" aria-hidden="true" />
      <div className="px-3.5 pb-3 pt-2.5">{children}</div>
    </section>
  );
}

/* ══════════════════════════ PROPRIETÀ ══════════════════════════ */

export function PannelloProprieta({
  editor,
  staffByTableId,
  modificabile,
}: {
  editor: EditorSala;
  staffByTableId?: Record<string, TableStaffMap>;
  /** In anteprima le proprietà si leggono e non si toccano: è la stessa
   * scheda, ma la sala in quel momento è un disegno. */
  modificabile: boolean;
}) {
  const tavolo = editor.tavoliSelezionati[0] ?? null;
  const elemento = editor.elementiSelezionati[0] ?? null;
  const totale = editor.selectedIds.size;

  return (
    <SchedaPannello icona={Box} titolo="Proprietà">
      {totale > 1 ? (
        <SelezioneMultipla editor={editor} totale={totale} modificabile={modificabile} />
      ) : tavolo ? (
        <ProprietaTavolo editor={editor} tavolo={tavolo} staff={staffByTableId?.[tavolo.id]} modificabile={modificabile} />
      ) : elemento ? (
        <ProprietaElemento editor={editor} elemento={elemento} modificabile={modificabile} />
      ) : (
        // Una riga e non un riquadro centrato: è lo stato di riposo della
        // scheda, e la colonna deve starci tutta senza scorrere.
        <p className="text-[11px] leading-snug text-tertiary-foreground">
          <span className="font-medium text-foreground">Nessun elemento selezionato.</span> Clicca un elemento sulla
          piantina per modificarlo.
        </p>
      )}
    </SchedaPannello>
  );
}

function SelezioneMultipla({ editor, totale, modificabile }: { editor: EditorSala; totale: number; modificabile: boolean }) {
  const tavoli = editor.tavoliSelezionati;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs">
        <span className="font-semibold tabular-nums">{totale}</span> elementi selezionati.
      </p>
      <p className="text-[11px] text-tertiary-foreground">
        Le frecce li spostano insieme. Per modificarne le proprietà selezionane uno solo.
      </p>
      {modificabile && tavoli.length >= 2 && <UnisciTavoli editor={editor} tavoli={tavoli} />}
      {modificabile && (
        <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={editor.eliminaSelezione}>
          <Trash2 className="h-3.5 w-3.5" /> Rimuovi dalla piantina
        </Button>
      )}
    </div>
  );
}

/**
 * Unire i tavoli selezionati in un'unione prevista.
 *
 * Non li sposta e non li fonde: dice che **questi** si accostano per un
 * gruppo grande, così prenotazioni e Servizio li propongono insieme. I
 * tavoli restano tavoli da due per il pranzo.
 */
function UnisciTavoli({ editor, tavoli }: { editor: EditorSala; tavoli: EditorSala["tables"] }) {
  const avvisi = useAvvisi();
  const [nome, setNome] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const posti = tavoli.reduce((somma, t) => somma + t.seats, 0);
  const chiave = tavoli
    .map((t) => t.id)
    .sort()
    .join("|");
  const giaUnite = editor.unioni.find((u) => [...u.tableIds].sort().join("|") === chiave);

  if (giaUnite) {
    return (
      <div className="riquadro flex items-center gap-2 bg-secondary/30 p-2 text-[11px]">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
        <span className="min-w-0 flex-1">Questi tavoli sono già un&apos;unione da {giaUnite.posti} posti.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <p className="text-[11px] leading-snug">
        <span className="font-medium">{tavoli.map((t) => t.label).join(" + ")}</span>
        <span className="text-tertiary-foreground"> · {posti} posti insieme</span>
      </p>
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome (facoltativo), es. Tavolata finestra"
        maxLength={60}
        className="h-8 text-xs"
      />
      <Button
        type="button"
        size="sm"
        disabled={inCorso}
        onClick={async () => {
          setInCorso(true);
          const esito = await editor.creaUnione(
            tavoli.map((t) => t.id),
            nome,
          );
          setInCorso(false);
          if (!esito.ok) {
            avvisi.problema(esito.messaggio);
            return;
          }
          // Uniti vuol dire attaccati: si accostano subito, piano contro
          // piano. Le nuove posizioni si salvano col resto della piantina.
          editor.accostaTavoli(tavoli.map((t) => t.id));
          setNome("");
        }}
      >
        <Link2 className="h-3.5 w-3.5" /> {inCorso ? "Unisco…" : `Unisci ${tavoli.length} tavoli`}
      </Button>
      <p className="text-[10px] leading-snug text-tertiary-foreground">
        Si accostano in fila e si spostano insieme (Alt per spostarne uno solo). L&apos;unione si propone da sola
        per i gruppi da {posti} persone.
      </p>
    </div>
  );
}

/** Le unioni di cui fa parte un tavolo, con il gesto per separarle. */
function UnioniDelTavolo({
  editor,
  tavolo,
  modificabile,
}: {
  editor: EditorSala;
  tavolo: EditorSala["tables"][number];
  modificabile: boolean;
}) {
  const avvisi = useAvvisi();
  const sue = editor.unioni.filter((u) => u.tableIds.includes(tavolo.id));
  if (sue.length === 0) {
    return modificabile ? (
      <p className="text-[10px] leading-snug text-tertiary-foreground">
        Per unirlo ad altri tavoli selezionali insieme (Shift + clic).
      </p>
    ) : null;
  }
  return (
    <Campo etichetta="Unioni">
      <ul className="flex flex-col gap-1">
        {sue.map((u) => (
          <li key={u.id} className="riquadro flex items-center gap-2 bg-secondary/30 px-2 py-1.5 text-[11px]">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
            <span className="min-w-0 flex-1 truncate">
              {u.label ? <span className="font-medium">{u.label} · </span> : null}
              {u.nomi}
              <span className="text-tertiary-foreground"> · {u.posti} posti</span>
            </span>
            {modificabile && (
              <button
                type="button"
                title="Separa: i tavoli restano, sparisce l'unione"
                aria-label={`Separa ${u.nomi}`}
                onClick={async () => {
                  const ok = await editor.separaUnione(u.id);
                  if (!ok) avvisi.problema("Unione non separata. Riprova fra un momento.");
                }}
                className="grid h-6 w-6 shrink-0 place-items-center rounded text-tertiary-foreground hover:bg-secondary hover:text-foreground"
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Campo>
  );
}

/** Lo stesso lucchetto che compare sulla piantina, per chi usa la tastiera. */
function BloccaPosizione({ editor, id }: { editor: EditorSala; id: string }) {
  const bloccato = editor.idBloccati.has(id);
  return (
    <Button
      type="button"
      variant={bloccato ? "default" : "outline"}
      size="sm"
      aria-pressed={bloccato}
      onClick={() => editor.bloccaOggetto(id)}
    >
      {bloccato ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
      {bloccato ? "Posizione bloccata · sblocca" : "Blocca posizione"}
    </Button>
  );
}

const FORME_SCEGLIBILI: TableShape[] = ["SQUARE", "ROUND", "RECT", "OVAL", "CUSTOM"];

function ProprietaTavolo({
  editor,
  tavolo,
  staff,
  modificabile,
}: {
  editor: EditorSala;
  tavolo: EditorSala["tables"][number];
  staff?: TableStaffMap;
  modificabile: boolean;
}) {
  const [confermaEliminazione, setConfermaEliminazione] = useState(false);
  const avvisi = useAvvisi();
  const misura = dimensioneDisegnata(tavolo);
  const zona = zonaDelTavolo(editor.elements, tavolo.posX + misura.w / 2, tavolo.posY + misura.h / 2);
  const assegnati = staff
    ? (Object.entries(staff) as [keyof TableStaffMap, NonNullable<TableStaffMap[keyof TableStaffMap]>][]).filter(([, p]) => p)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="t-etichetta">Tavolo</p>
        <p className="text-display text-lg leading-tight">{tavolo.label}</p>
      </div>

      <Campo etichetta="Nome tavolo">
        <Input
          key={`${tavolo.id}-label`}
          defaultValue={tavolo.label}
          disabled={!modificabile}
          className="h-8 text-xs"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== tavolo.label) editor.aggiornaTavolo(tavolo.id, { label: v }, true);
          }}
        />
      </Campo>

      <Campo etichetta="Tipo">
        <select
          value={tavolo.shape}
          disabled={!modificabile}
          onChange={(e) => editor.aggiornaTavolo(tavolo.id, { shape: e.target.value as TableShape }, true)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
        >
          {FORME_SCEGLIBILI.map((f) => (
            <option key={f} value={f}>
              {ETICHETTE_FORMA[f]}
            </option>
          ))}
          {!FORME_SCEGLIBILI.includes(tavolo.shape) && (
            <option value={tavolo.shape}>{ETICHETTE_FORMA[tavolo.shape]}</option>
          )}
        </select>
      </Campo>

      {tavolo.shape !== "ROUND" && (
        <Campo etichetta="Sedie">
          <select
            value={tavolo.chairSides}
            disabled={!modificabile}
            onChange={(e) => editor.aggiornaTavolo(tavolo.id, { chairSides: e.target.value as "ALL" | "LONG" }, true)}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
          >
            <option value="ALL">Su tutti i lati</option>
            <option value="LONG">Solo su due lati</option>
          </select>
        </Campo>
      )}

      <Campo etichetta="Posti">
        <Stepper
          valore={tavolo.seats}
          min={1}
          max={40}
          disabilitato={!modificabile}
          onCambia={(v) => editor.aggiornaTavolo(tavolo.id, { seats: v }, true)}
        />
      </Campo>

      {/*
        La misura del piano. Vuota segue i posti (la misura standard); scritta
        fa un tavolo su misura, come un imperiale da sei metri. Non c'è una
        maniglia da tirare sulla piantina di proposito: un numero si scrive
        giusto al primo colpo, una maniglia no.
      */}
      <Campo etichetta="Misura (cm)">
        <div className="grid grid-cols-2 gap-2">
          {(["width", "height"] as const).map((lato) => {
            const standard = dimensioneDisegnata({ shape: tavolo.shape, seats: tavolo.seats });
            const valore = tavolo[lato];
            return (
              <Input
                key={`${tavolo.id}-${lato}-${valore ?? "std"}`}
                type="number"
                inputMode="numeric"
                min={20}
                max={1200}
                aria-label={lato === "width" ? "Lunghezza in centimetri" : "Profondità in centimetri"}
                placeholder={String(Math.round(pxToMeters(lato === "width" ? standard.w : standard.h) * 100))}
                defaultValue={valore ? Math.round(pxToMeters(valore) * 100) : ""}
                disabled={!modificabile}
                className="h-8 text-xs"
                onBlur={(e) => {
                  const testo = e.target.value.trim();
                  const attuale = dimensioneDisegnata(tavolo);
                  const px = testo ? Math.max(20, Math.min(1200, Math.round(metersToPx(Number(testo) / 100)))) : null;
                  if (testo && !Number.isFinite(px)) return;
                  // Una misura sola non basta a disegnare il piano: l'altra si
                  // prende da quella che si vede adesso. Svuotare un campo
                  // riporta il tavolo alla misura dei suoi posti.
                  const altro = lato === "width" ? "height" : "width";
                  const patch =
                    px === null
                      ? { width: null, height: null }
                      : { [lato]: px, [altro]: tavolo[altro] ?? attuale[altro === "width" ? "w" : "h"] };
                  editor.aggiornaTavolo(tavolo.id, patch, true);
                }}
              />
            );
          })}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-tertiary-foreground">
          Lunghezza × profondità. Svuota per tornare alla misura standard per {tavolo.seats} posti.
        </p>
      </Campo>

      <Campo etichetta="Rotazione">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={345}
            step={15}
            value={tavolo.rotation}
            disabled={!modificabile}
            onChange={(e) => editor.aggiornaTavolo(tavolo.id, { rotation: Number(e.target.value) })}
            onPointerUp={() => editor.aggiornaTavolo(tavolo.id, { rotation: tavolo.rotation }, true)}
            // TODO(carta) accent-[#B07A45] va tokenizzato, altrimenti lo slider resta marrone sulla carta.
            className="h-1.5 flex-1 accent-[#B07A45]"
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums">{tavolo.rotation}°</span>
        </div>
      </Campo>

      <UnioniDelTavolo editor={editor} tavolo={tavolo} modificabile={modificabile} />

      <Riga etichetta="Zona" valore={zona ?? "Sala"} />
      <Campo etichetta="Stato">
        <select
          value={tavolo.active ? "attivo" : "sospeso"}
          disabled={!modificabile}
          onChange={(e) => editor.aggiornaTavolo(tavolo.id, { active: e.target.value === "attivo" }, true)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
        >
          <option value="attivo">Attivo</option>
          <option value="sospeso">Fuori servizio</option>
        </select>
      </Campo>

      {/*
        Il personale sta **qui**, e non sotto il tavolo sulla piantina: una
        targa per ogni tavolo copriva la sala che si era appena disegnata.
        Chi vuole sapere chi copre un tavolo lo seleziona, e lo legge.
      */}
      {assegnati.length > 0 && (
        <div className="riquadro bg-secondary/30 p-2">
          <p className="t-etichetta mb-1">Personale</p>
          <ul className="flex flex-col gap-1">
            {assegnati.map(([ruolo, persona]) => {
              const Icona = TABLE_ROLE_ICONS[ruolo];
              return (
                <li key={ruolo} className="flex items-center gap-1.5 text-[11px]">
                  <Icona className="h-3 w-3 shrink-0 text-accent-strong" />
                  <span className="truncate">{persona.name}</span>
                  <span className="ml-auto shrink-0 text-tertiary-foreground">{TABLE_ROLE_LABELS[ruolo]}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {modificabile && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <BloccaPosizione editor={editor} id={tavolo.id} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={editor.idBloccati.has(tavolo.id)}
            onClick={editor.eliminaSelezione}
          >
            Rimuovi dalla piantina
          </Button>
          {!confermaEliminazione ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start text-destructive hover:text-destructive"
              onClick={() => setConfermaEliminazione(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> Elimina tavolo
            </Button>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="text-[11px] text-destructive">
                Il tavolo esce dal gestionale: prenotazioni e assegnazioni collegate andranno perse.
              </p>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={async () => {
                    const ok = await editor.eliminaTavoloDavvero(tavolo.id);
                    if (!ok) avvisi.problema(`${tavolo.label} non è stato eliminato. Riprova fra un momento.`);
                  }}
                >
                  Conferma
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfermaEliminazione(false)}>
                  Annulla
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProprietaElemento({
  editor,
  elemento,
  modificabile,
}: {
  editor: EditorSala;
  elemento: RoomElement;
  modificabile: boolean;
}) {
  const nome = isArea(elemento)
    ? AREA_LABELS[elemento.type]
    : elemento.type === "WALL"
      ? "Parete"
      : elemento.type === "DIVIDER"
        ? "Divisorio"
        : elemento.type === "DOOR"
          ? "Porta"
          : elemento.type === "WINDOW"
            ? "Finestra"
            : elemento.type === "COLUMN"
              ? "Colonna"
              : elemento.type === "TEXT"
                ? "Testo"
                : elemento.type === "CHAIR"
                  ? "Sedia"
                  : "Elemento libero";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="t-etichetta">Elemento</p>
        <p className="text-display text-lg leading-tight">{nome}</p>
      </div>

      {isSegment(elemento) && (
        <>
          <Riga etichetta="Lunghezza" valore={formatMeters(wallLength(elemento))} />
          <Campo etichetta="Spessore (cm)">
            <Input
              key={`${elemento.id}-t`}
              type="number"
              defaultValue={Math.round(pxToMeters(elemento.thickness) * 100)}
              disabled={!modificabile}
              className="h-8 text-xs"
              onBlur={(e) => {
                const cm = Number(e.target.value);
                if (cm > 0) editor.aggiornaElemento(elemento.id, { thickness: Math.max(2, Math.min(60, metersToPx(cm / 100))) }, true);
              }}
            />
          </Campo>
        </>
      )}

      {(isDoor(elemento) || isWindow(elemento)) && (
        <Campo etichetta="Larghezza (cm)">
          <Input
            key={`${elemento.id}-w-${elemento.width}`}
            type="number"
            defaultValue={Math.round(pxToMeters(elemento.width) * 100)}
            disabled={!modificabile}
            className="h-8 text-xs"
            onBlur={(e) => editor.aggiornaElemento(elemento.id, { width: metersToPx(Number(e.target.value) / 100) }, true)}
          />
        </Campo>
      )}

      {(isArea(elemento) || isColumn(elemento) || isFree(elemento)) && (
        <div className="grid grid-cols-2 gap-2">
          <Campo etichetta="Larghezza (cm)">
            <Input
              key={`${elemento.id}-w-${elemento.width}`}
              type="number"
              defaultValue={Math.round(pxToMeters(elemento.width) * 100)}
              disabled={!modificabile}
              className="h-8 text-xs"
              onBlur={(e) => editor.aggiornaElemento(elemento.id, { width: metersToPx(Number(e.target.value) / 100) }, true)}
            />
          </Campo>
          <Campo etichetta="Profondità (cm)">
            <Input
              key={`${elemento.id}-h-${elemento.height}`}
              type="number"
              defaultValue={Math.round(pxToMeters(elemento.height) * 100)}
              disabled={!modificabile}
              className="h-8 text-xs"
              onBlur={(e) => editor.aggiornaElemento(elemento.id, { height: metersToPx(Number(e.target.value) / 100) }, true)}
            />
          </Campo>
        </div>
      )}

      {(isArea(elemento) || isFree(elemento)) && (
        <Campo etichetta="Etichetta">
          <Input
            key={`${elemento.id}-l`}
            defaultValue={elemento.label ?? ""}
            placeholder={isArea(elemento) ? AREA_LABELS[elemento.type] : "Senza nome"}
            disabled={!modificabile}
            className="h-8 text-xs"
            onBlur={(e) => editor.aggiornaElemento(elemento.id, { label: e.target.value.trim() || null }, true)}
          />
        </Campo>
      )}

      {isText(elemento) && (
        <>
          <Campo etichetta="Testo">
            <Input
              key={`${elemento.id}-t`}
              defaultValue={elemento.text}
              disabled={!modificabile}
              className="h-8 text-xs"
              onBlur={(e) => editor.aggiornaElemento(elemento.id, { text: e.target.value || "Testo" }, true)}
            />
          </Campo>
          <Campo etichetta="Dimensione">
            <Stepper
              valore={elemento.fontSize}
              min={8}
              max={48}
              disabilitato={!modificabile}
              onCambia={(v) => editor.aggiornaElemento(elemento.id, { fontSize: v }, true)}
            />
          </Campo>
        </>
      )}

      {"rotation" in elemento && (
        <Campo etichetta="Rotazione">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={345}
              step={15}
              value={elemento.rotation}
              disabled={!modificabile}
              onChange={(e) => editor.aggiornaElemento(elemento.id, { rotation: Number(e.target.value) })}
              onPointerUp={() => editor.aggiornaElemento(elemento.id, { rotation: elemento.rotation }, true)}
              className="h-1.5 flex-1"
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums">{elemento.rotation}°</span>
          </div>
        </Campo>
      )}

      {modificabile && (
        <div className="mt-1 flex flex-col gap-1.5">
          <BloccaPosizione editor={editor} id={elemento.id} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={editor.idBloccati.has(elemento.id)}
            className="justify-start text-destructive hover:text-destructive"
            onClick={editor.eliminaSelezione}
          >
            <Trash2 className="h-3.5 w-3.5" /> Elimina elemento
          </Button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ INFORMAZIONI SALA ══════════════════════════ */

export function PannelloInformazioni({
  editor,
  nomeSala,
  modificabile,
}: {
  editor: EditorSala;
  nomeSala: string;
  modificabile: boolean;
}) {
  const [apertaModifica, setApertaModifica] = useState(false);

  const stimata = estimateAreaSqm(editor.elements);
  const superficie = editor.meta.areaSqm ?? stimata;

  const box = boundingBox(editor.elements);
  const larghezzaM = editor.meta.widthM ?? (Number.isFinite(box.maxX) ? pxToMeters(box.maxX - box.minX) : null);
  const profonditaM = editor.meta.depthM ?? (Number.isFinite(box.maxY) ? pxToMeters(box.maxY - box.minY) : null);

  return (
    <SchedaPannello
      icona={Ruler}
      titolo="Informazioni sala"
      azione={
        modificabile ? (
          <button
            type="button"
            onClick={() => setApertaModifica((v) => !v)}
            // Una matita e non la parola: accanto al titolo nel serif, la
            // parola gli rubava metà della riga.
            aria-label={apertaModifica ? "Fatto" : "Modifica informazioni sala"}
            title={apertaModifica ? "Fatto" : "Modifica"}
            aria-pressed={apertaModifica}
            className="pastiglia grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-accent-strong transition-colors hover:border-accent/50"
          >
            {apertaModifica ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        ) : undefined
      }
    >
      <div className={cn("flex flex-col", apertaModifica && "gap-2")}>
        <Riga fila etichetta="Nome" valore={nomeSala} />

        {apertaModifica ? (
          <>
            <Campo etichetta="Superficie (m²)">
              <Input
                type="number"
                step="0.1"
                defaultValue={superficie ? superficie.toFixed(1) : ""}
                placeholder={stimata ? stimata.toFixed(1) : "—"}
                className="h-8 text-xs"
                onBlur={(e) => editor.cambiaMeta({ areaSqm: e.target.value ? Number(e.target.value) : null })}
              />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo etichetta="Larghezza (m)">
                <Input
                  type="number"
                  step="0.1"
                  defaultValue={larghezzaM ? larghezzaM.toFixed(1) : ""}
                  className="h-8 text-xs"
                  onBlur={(e) => editor.cambiaMeta({ widthM: e.target.value ? Number(e.target.value) : null })}
                />
              </Campo>
              <Campo etichetta="Profondità (m)">
                <Input
                  type="number"
                  step="0.1"
                  defaultValue={profonditaM ? profonditaM.toFixed(1) : ""}
                  className="h-8 text-xs"
                  onBlur={(e) => editor.cambiaMeta({ depthM: e.target.value ? Number(e.target.value) : null })}
                />
              </Campo>
            </div>
            <Campo etichetta="Spazio minimo fra tavoli (cm)">
              <Input
                type="number"
                step="5"
                min={0}
                max={300}
                defaultValue={editor.meta.spazioMinimoPassaggioCm ?? ""}
                placeholder={String(Math.round(pxToMeters(SPAZIO_MINIMO_PASSAGGIO_PX) * 100))}
                className="h-8 text-xs"
                onBlur={(e) =>
                  editor.cambiaMeta({ spazioMinimoPassaggioCm: e.target.value ? Number(e.target.value) : null })
                }
              />
            </Campo>
            <p className="text-[10px] leading-snug text-tertiary-foreground">
              Lasciando un campo vuoto il valore torna a essere calcolato dalla piantina (o lo standard, per lo spazio fra i
              tavoli).
            </p>
          </>
        ) : (
          <>
            <Riga
              fila
              etichetta="Superficie stimata"
              valore={superficie ? `~ ${Math.round(superficie)} m²` : "—"}
              nota={editor.meta.areaSqm != null ? "inserita a mano" : undefined}
            />
            <Riga
              fila
              etichetta="Dimensioni"
              valore={
                larghezzaM && profonditaM
                  ? `${larghezzaM.toFixed(1).replace(".", ",")} m × ${profonditaM.toFixed(1).replace(".", ",")} m`
                  : "—"
              }
            />
            <Riga
              fila
              etichetta="Spazio minimo fra tavoli"
              valore={`${
                editor.meta.spazioMinimoPassaggioCm ?? Math.round(pxToMeters(SPAZIO_MINIMO_PASSAGGIO_PX) * 100)
              } cm`}
              nota={editor.meta.spazioMinimoPassaggioCm != null ? "inserita a mano" : "standard"}
            />
          </>
        )}

        <Riga
          fila
          etichetta="Tavoli"
          valore={`${editor.tavoliSullaPiantina.length} · ${editor.tavoliSullaPiantina.reduce((s, t) => s + t.seats, 0)} posti`}
        />
      </div>
    </SchedaPannello>
  );
}

/* ══════════════════════════ LIVELLI ══════════════════════════ */

export function PannelloLivelli({ editor, haOriginale }: { editor: EditorSala; haOriginale: boolean }) {
  return (
    <SchedaPannello icona={Layers} titolo="Livelli">
      {/* Pastiglie su due colonne e non un elenco: cinque righe costavano
          metà della colonna per cinque interruttori. L'immagine originale
          compare solo quando c'è una piantina caricata. */}
      <ul className="grid grid-cols-2 gap-1.5">
        {ROOM_LAYER_KEYS.filter((chiave) => chiave !== "original" || haOriginale).map((chiave) => {
          const acceso = editor.layers[chiave];
          return (
            <li key={chiave}>
              <button
                type="button"
                onClick={() => editor.cambiaLayer(chiave, !acceso)}
                aria-pressed={acceso}
                title={ETICHETTE_LAYER[chiave]}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-full border px-2 py-1 text-left text-[11px] transition-colors",
                  acceso
                    ? "border-accent/30 bg-accent/[0.08] hover:bg-accent/15"
                    : "border-border text-tertiary-foreground hover:bg-secondary",
                )}
              >
                {acceso ? (
                  <Eye className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">{ETICHETTE_LAYER[chiave]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </SchedaPannello>
  );
}

/* ══════════════════════════ IMMAGINE ORIGINALE ══════════════════════════ */

export function PannelloOriginale({
  url,
  nomeSala,
  riassuntoAnalisi,
  onMostra,
}: {
  url: string | null;
  nomeSala: string;
  riassuntoAnalisi?: string | null;
  onMostra: () => void;
}) {
  const isPdf = url?.split("?")[0].toLowerCase().endsWith(".pdf") ?? false;

  // Senza piantina caricata la scheda diceva solo «usa Gestisci piantina»:
  // quel bottone è già nella barra degli strumenti, e la colonna ha bisogno
  // dello spazio.
  if (!url) return null;

  return (
    <SchedaPannello icona={ImageIcon} titolo="Immagine originale">
      {url ? (
        <div className="flex flex-col gap-2">
          <div className="grid place-items-center overflow-hidden rounded-md border border-border bg-cream/95 p-1.5">
            {isPdf ? (
              <div className="flex h-24 w-full flex-col items-center justify-center gap-1 text-clay-ink">
                <ImageIcon className="h-5 w-5" />
                <span className="text-[10px] font-medium">Documento PDF</span>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={url} alt={`Piantina caricata di ${nomeSala}`} className="max-h-28 w-full object-contain" />
            )}
          </div>
          {riassuntoAnalisi && <p className="text-[10px] text-tertiary-foreground">Riconosciuti: {riassuntoAnalisi}.</p>}
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={onMostra}>
            Mostra originale
          </Button>
        </div>
      ) : (
        <p className="py-2 text-[11px] leading-snug text-tertiary-foreground">
          Nessuna piantina caricata. Usa «Gestisci piantina» per caricarne una e farla riconoscere.
        </p>
      )}
    </SchedaPannello>
  );
}

/* ══════════════════════════ ATOMI ══════════════════════════ */

function Campo({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      {/* truncate invece di lasciarla andare a capo: un'etichetta più lunga
          delle altre (es. «Profondità» contro «Larghezza») non deve spostare
          in basso solo il proprio campo rispetto a quelli accanto. */}
      <span className="t-etichetta truncate">{etichetta}</span>
      {children}
    </label>
  );
}

/** Etichetta a sinistra, valore a destra. La nota («standard», «inserita a
 * mano») va sotto il valore e non accanto: accanto lo troncava a metà.
 * `fila` è la riga di un elenco: più aria, e nessun filo fra una riga e
 * l'altra — in una scheda così piccola i fili diventavano una griglia. */
function Riga({ etichetta, valore, nota, fila }: { etichetta: string; valore: string; nota?: string; fila?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3 text-xs",
        fila ? "items-start py-1.5 first:pt-0 last:pb-0" : "items-baseline",
      )}
    >
      <span className="min-w-0 leading-snug text-tertiary-foreground">{etichetta}</span>
      <span className="flex max-w-[60%] shrink-0 flex-col items-end text-right leading-snug">
        <span className="break-words font-medium tabular-nums">{valore}</span>
        {nota && <span className="text-[10px] text-tertiary-foreground">{nota}</span>}
      </span>
    </div>
  );
}

function Stepper({
  valore,
  min,
  max,
  disabilitato,
  onCambia,
}: {
  valore: number;
  min: number;
  max: number;
  disabilitato?: boolean;
  onCambia: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        disabled={disabilitato || valore <= min}
        aria-label="Diminuisci"
        onClick={() => onCambia(Math.max(min, valore - 1))}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="flex-1 text-center text-sm font-medium tabular-nums">{valore}</span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-8 w-8 shrink-0"
        disabled={disabilitato || valore >= max}
        aria-label="Aumenta"
        onClick={() => onCambia(Math.min(max, valore + 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * In quale ambiente sta un tavolo.
 *
 * Non è un campo salvato ed è una scelta: una zona memorizzata sul tavolo
 * mente il giorno in cui qualcuno sposta il tavolo o la zona, e mente in
 * silenzio. Calcolarla dalla geometria dà sempre la risposta vera — quella
 * che chi guarda la piantina vede con i propri occhi.
 */
function zonaDelTavolo(elements: RoomElement[], cx: number, cy: number): string | null {
  let migliore: { area: number; nome: string } | null = null;
  for (const el of elements) {
    if (!isArea(el)) continue;
    if (cx < el.x || cx > el.x + el.width || cy < el.y || cy > el.y + el.height) continue;
    const area = el.width * el.height;
    // La più piccola che lo contiene: se un privé sta dentro la sala, il
    // tavolo è nel privé.
    if (!migliore || area < migliore.area) migliore = { area, nome: el.label || AREA_LABELS[el.type] };
  }
  return migliore?.nome ?? null;
}
