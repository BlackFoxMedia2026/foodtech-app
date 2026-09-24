"use client";

import { useState } from "react";
import type { TableShape } from "@prisma/client";
import { Box, Eye, EyeOff, Image as ImageIcon, Layers, Minus, Plus, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
import { ETICHETTE_FORMA, dimensioneDisegnata } from "@/lib/tavolo-geometria";
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
  return (
    <section className="riquadro bg-card text-card-foreground">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Icona className="h-4 w-4 shrink-0 text-accent-strong" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{titolo}</h3>
        {azione}
      </header>
      <div className="p-3">{children}</div>
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
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary/60">
            <Box className="h-5 w-5 text-tertiary-foreground" />
          </span>
          <p className="text-xs font-medium">Nessun elemento selezionato</p>
          <p className="text-[11px] leading-snug text-tertiary-foreground">
            Seleziona un elemento sulla piantina per modificarne le proprietà.
          </p>
        </div>
      )}
    </SchedaPannello>
  );
}

function SelezioneMultipla({ editor, totale, modificabile }: { editor: EditorSala; totale: number; modificabile: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs">
        <span className="font-semibold tabular-nums">{totale}</span> elementi selezionati.
      </p>
      <p className="text-[11px] text-tertiary-foreground">
        Le frecce li spostano insieme. Per modificarne le proprietà selezionane uno solo.
      </p>
      {modificabile && (
        <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={editor.eliminaSelezione}>
          <Trash2 className="h-3.5 w-3.5" /> Rimuovi dalla piantina
        </Button>
      )}
    </div>
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

      <Campo etichetta="Posti">
        <Stepper
          valore={tavolo.seats}
          min={1}
          max={40}
          disabilitato={!modificabile}
          onCambia={(v) => editor.aggiornaTavolo(tavolo.id, { seats: v }, true)}
        />
      </Campo>

      <div className="grid grid-cols-2 gap-2">
        <Campo etichetta="Larghezza (cm)">
          <Input
            key={`${tavolo.id}-w-${misura.w}`}
            type="number"
            inputMode="numeric"
            defaultValue={Math.round(pxToMeters(misura.w) * 100)}
            disabled={!modificabile}
            className="h-8 text-xs"
            onBlur={(e) => {
              const cm = Number(e.target.value);
              if (cm > 0) editor.aggiornaTavolo(tavolo.id, { width: metersToPx(cm / 100), height: tavolo.height ?? misura.h }, true);
            }}
          />
        </Campo>
        <Campo etichetta="Altezza (cm)">
          <Input
            key={`${tavolo.id}-h-${misura.h}`}
            type="number"
            inputMode="numeric"
            defaultValue={Math.round(pxToMeters(misura.h) * 100)}
            disabled={!modificabile}
            className="h-8 text-xs"
            onBlur={(e) => {
              const cm = Number(e.target.value);
              if (cm > 0) editor.aggiornaTavolo(tavolo.id, { height: metersToPx(cm / 100), width: tavolo.width ?? misura.w }, true);
            }}
          />
        </Campo>
      </div>

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
          <Button type="button" variant="outline" size="sm" onClick={editor.eliminaSelezione}>
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
                  onClick={() => editor.eliminaTavoloDavvero(tavolo.id)}
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
            key={`${elemento.id}-w`}
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
              key={`${elemento.id}-w`}
              type="number"
              defaultValue={Math.round(pxToMeters(elemento.width) * 100)}
              disabled={!modificabile}
              className="h-8 text-xs"
              onBlur={(e) => editor.aggiornaElemento(elemento.id, { width: metersToPx(Number(e.target.value) / 100) }, true)}
            />
          </Campo>
          <Campo etichetta="Profondità (cm)">
            <Input
              key={`${elemento.id}-h`}
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 justify-start text-destructive hover:text-destructive"
          onClick={editor.eliminaSelezione}
        >
          <Trash2 className="h-3.5 w-3.5" /> Elimina elemento
        </Button>
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
            className="shrink-0 text-[10px] font-medium text-accent-strong hover:underline"
          >
            {apertaModifica ? "Fatto" : "Modifica"}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <Riga etichetta="Nome" valore={nomeSala} />

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
            <p className="text-[10px] leading-snug text-tertiary-foreground">
              Lasciando un campo vuoto il valore torna a essere calcolato dalla piantina.
            </p>
          </>
        ) : (
          <>
            <Riga
              etichetta="Superficie stimata"
              valore={superficie ? `~ ${Math.round(superficie)} m²` : "—"}
              nota={editor.meta.areaSqm != null ? "inserita a mano" : undefined}
            />
            <Riga
              etichetta="Dimensioni"
              valore={
                larghezzaM && profonditaM
                  ? `${larghezzaM.toFixed(1).replace(".", ",")} m × ${profonditaM.toFixed(1).replace(".", ",")} m`
                  : "—"
              }
            />
          </>
        )}

        <Riga
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
      <ul className="flex flex-col">
        {ROOM_LAYER_KEYS.map((chiave) => {
          const acceso = editor.layers[chiave];
          const indisponibile = chiave === "original" && !haOriginale;
          return (
            <li key={chiave}>
              <button
                type="button"
                disabled={indisponibile}
                onClick={() => editor.cambiaLayer(chiave, !acceso)}
                aria-pressed={acceso}
                title={indisponibile ? "Nessuna piantina caricata per questa sala" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-xs transition-colors",
                  indisponibile ? "cursor-not-allowed opacity-40" : "hover:bg-secondary",
                  !acceso && !indisponibile && "text-tertiary-foreground",
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
      <span className="t-etichetta">{etichetta}</span>
      {children}
    </label>
  );
}

function Riga({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-tertiary-foreground">{etichetta}</span>
      <span className="min-w-0 truncate text-right font-medium">
        {valore}
        {nota && <span className="ml-1 text-[10px] font-normal text-tertiary-foreground">({nota})</span>}
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
