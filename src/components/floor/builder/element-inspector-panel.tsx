"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AREA_LABELS,
  formatMeters,
  isArea,
  isColumn,
  isDoor,
  isTableRef,
  isWall,
  isWindow,
  pxToMeters,
  wallLength,
  metersToPx,
} from "@/lib/room-layout";
import type { PlaceableType, RoomBuilder } from "./use-room-builder";

const STRUCTURE_LABEL: Record<string, string> = { DOOR: "Porta", WINDOW: "Finestra", COLUMN: "Colonna", WALL: "Parete" };

const PLACE_ON_CANVAS_HINT = "Clicca sulla piantina per posizionarla, poi ridimensionala.";

const PLACING_TOOL_COPY: Record<PlaceableType, { title: string; body: string }> = {
  DOOR: { title: "Aggiungi una porta", body: "Clicca o trascinala sopra una parete: si aggancerà automaticamente." },
  WINDOW: { title: "Aggiungi una finestra", body: "Clicca o trascinala sopra una parete: si aggancerà automaticamente." },
  COLUMN: { title: "Aggiungi una colonna", body: "Clicca sulla piantina nel punto in cui vuoi posizionarla." },
  AREA_KITCHEN: { title: "Aggiungi l'area Cucina", body: PLACE_ON_CANVAS_HINT },
  AREA_BAR: { title: "Aggiungi l'area Bancone", body: PLACE_ON_CANVAS_HINT },
  AREA_WC: { title: "Aggiungi l'area WC", body: PLACE_ON_CANVAS_HINT },
  AREA_STORAGE: { title: "Aggiungi l'area Magazzino", body: PLACE_ON_CANVAS_HINT },
  AREA_PRIVATE: { title: "Aggiungi la Zona privata", body: PLACE_ON_CANVAS_HINT },
  AREA_ENTRANCE: { title: "Aggiungi l'Ingresso", body: PLACE_ON_CANVAS_HINT },
  AREA_TERRACE: { title: "Aggiungi la Terrazza / Dehors", body: PLACE_ON_CANVAS_HINT },
};

/** Contextual properties panel for the selected element — minimal fields per
 * type (brief §22), with the destructive table actions kept explicitly apart
 * ("Rimuovi dalla piantina" vs "Elimina tavolo") so a graphic removal never
 * silently deletes gestionale data. When nothing is selected it now doubles
 * as tool guidance (brief §24-27): an idle empty state, or short instructions
 * for whichever tool is currently armed. */
export function ElementInspectorPanel({ builder }: { builder: RoomBuilder }) {
  const el = builder.selectedElement;
  const selectedTable = builder.tables.find((t) => t.id === builder.selectedId) ?? null;

  if (!el && !selectedTable) {
    if (builder.tool.mode === "drawing-wall") {
      return (
        <ToolInstructions
          title="Disegna una parete"
          body="Clicca sulla piantina per iniziare, poi clicca di nuovo per aggiungere ogni segmento. Clicca sul primo punto per chiudere la forma."
        />
      );
    }
    if (builder.tool.mode === "placing") {
      const copy = PLACING_TOOL_COPY[builder.tool.elementType];
      return <ToolInstructions title={copy.title} body={copy.body} />;
    }
    if (builder.tool.mode === "placing-table") {
      return (
        <ToolInstructions
          title="Aggiungi un tavolo"
          body="Clicca sulla piantina per posizionarlo: verrà creato come tavolo reale del gestionale."
        />
      );
    }
    return (
      <div className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Personalizza la tua sala</h3>
          <p className="mt-1 text-xs text-muted-foreground">Seleziona uno strumento a sinistra oppure clicca un elemento della piantina.</p>
        </div>
        <ul className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <li>· Trascina gli elementi direttamente sulla piantina.</li>
          <li>· Clicca un elemento per modificarne le proprietà.</li>
          <li>· Ricorda di salvare la sala al termine.</li>
        </ul>
      </div>
    );
  }

  if (selectedTable) {
    return <TableInspector builder={builder} table={selectedTable} />;
  }

  if (!el) return null;

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{isArea(el) ? AREA_LABELS[el.type] : STRUCTURE_LABEL[el.type] ?? el.type}</h3>

      {isWall(el) && (
        <Field label="Lunghezza">
          <span className="text-sm font-medium">{formatMeters(wallLength(el))}</span>
        </Field>
      )}

      {(isDoor(el) || isWindow(el)) && (
        <Field label="Larghezza (cm)">
          <Input
            key={el.id}
            type="number"
            className="h-8 w-24 text-xs"
            defaultValue={Math.round(pxToMeters(el.width) * 100)}
            onBlur={(e) => builder.updateElementCommit(el.id, { width: metersToPx(Number(e.target.value) / 100) })}
          />
        </Field>
      )}

      {isColumn(el) && (
        <>
          <Field label="Larghezza (cm)">
            <Input
              key={`${el.id}-w`}
              type="number"
              className="h-8 w-24 text-xs"
              defaultValue={Math.round(pxToMeters(el.width) * 100)}
              onBlur={(e) => builder.updateElementCommit(el.id, { width: metersToPx(Number(e.target.value) / 100) })}
            />
          </Field>
          <Field label="Profondità (cm)">
            <Input
              key={`${el.id}-h`}
              type="number"
              className="h-8 w-24 text-xs"
              defaultValue={Math.round(pxToMeters(el.height) * 100)}
              onBlur={(e) => builder.updateElementCommit(el.id, { height: metersToPx(Number(e.target.value) / 100) })}
            />
          </Field>
        </>
      )}

      {isArea(el) && (
        <Field label="Etichetta">
          <Input
            key={el.id}
            className="h-8 text-xs"
            placeholder={AREA_LABELS[el.type]}
            defaultValue={el.label ?? ""}
            onBlur={(e) => builder.updateElementCommit(el.id, { label: e.target.value || null })}
          />
        </Field>
      )}

      {!isTableRef(el) && (
        <Button type="button" variant="ghost" size="sm" className="mt-2 justify-start text-destructive hover:text-destructive" onClick={() => builder.deleteElement(el.id)}>
          <Trash2 className="h-3.5 w-3.5" /> Elimina elemento
        </Button>
      )}
    </div>
  );
}

function TableInspector({ builder, table }: { builder: RoomBuilder; table: RoomBuilder["tables"][number] }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tavolo {table.label}</h3>
      <Field label="Posti">
        <span className="text-sm font-medium">{table.seats}</span>
      </Field>
      <Field label="Forma">
        <span className="text-sm font-medium capitalize">{table.shape.toLowerCase()}</span>
      </Field>
      <Field label="Rotazione">
        <span className="text-sm font-medium">{table.rotation}°</span>
      </Field>
      <p className="text-xs text-muted-foreground">Nome, posti e forma si modificano dalla gestione tavoli.</p>

      <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={() => builder.removeTableFromPlan(table.id)}>
          Rimuovi dalla piantina
        </Button>
        {!confirmingDelete ? (
          <Button type="button" variant="ghost" size="sm" className="justify-start text-destructive hover:text-destructive" onClick={() => setConfirmingDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" /> Elimina tavolo
          </Button>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2">
            <p className="text-xs text-destructive">Il tavolo verrà eliminato dal gestionale: prenotazioni e assegnazioni collegate andranno perse.</p>
            <div className="flex gap-1.5">
              <Button type="button" variant="destructive" size="sm" className="h-7 flex-1 text-xs" onClick={() => builder.deleteTablePermanently(table.id)}>
                Conferma eliminazione
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmingDelete(false)}>
                Annulla
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ToolInstructions({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-accent-strong">{title}</h3>
      <p className="text-xs text-muted-foreground">{body}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
        <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-sans text-[10px]">Esc</kbd> Annulla
      </p>
    </div>
  );
}
