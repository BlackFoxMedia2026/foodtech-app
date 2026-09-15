"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Monitor, Redo2, Smartphone, Undo2 } from "lucide-react";
import {
  parseEmailDocument,
  withUnsubscribeBlock,
  type Block,
  type BlockAlign,
  type ColumnRatio,
  type EmailDocument,
} from "@/lib/campaign-blocks";
import {
  createColumnsBlock,
  findBlock,
  upgradeLegacyBlocks,
  type DropTarget,
} from "@/lib/campaign-document-ops";
import { plainTextToRichHtml, richHtmlToPlainText } from "@/lib/campaign-rich-text";
import { patchCampaignDraft, rewriteCampaignText } from "@/lib/campaign-wizard-api";
import { newId } from "@/lib/campaign-document-ops";
import { cn } from "@/lib/utils";
import { useWizardDispatch, useWizardState } from "../wizard-context";
import { BLOCK_TYPE_LABELS, LIBRARY_BY_ID, type BlockDefaults } from "./block-library";
import { Canvas } from "./canvas";
import { EditorProvider, useEditor } from "./editor-context";
import { Inspector } from "./inspector";
import { LibraryPanel } from "./library-panel";
import { MediaPicker } from "./media-picker";
import { TextToolbar, useAnchorRect, type TextStyleKind } from "./text-toolbar";

const ZOOM_STEPS = [0.75, 1, 1.25];
const MOBILE_WIDTH = 390;
const AUTOSAVE_DELAY_MS = 1200;

/** I blocchi su cui la barra del testo ha senso. */
const TEXTUAL_TYPES: Block["type"][] = ["text", "title", "button_cta"];

function Workspace() {
  const wizard = useWizardState();
  const wizardDispatch = useWizardDispatch();
  const editor = useEditor();
  const { doc, selectedId, viewport, zoom } = editor.state;

  const [dragging, setDragging] = useState<string | null>(null);
  const [mediaFor, setMediaFor] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const selected = selectedId ? findBlock(doc, selectedId) : null;
  const accent = wizard.brandPrimaryColor || "#c9a25a";

  const defaults: BlockDefaults = {
    brandLogoUrl: wizard.brandLogoUrl,
    restaurantName: wizard.venueName,
    address: wizard.venueAddress,
    phone: wizard.venuePhone,
  };

  /** La tavolozza offerta ovunque si scelga un colore: il brand, più i neutri dell'email. */
  const brandColors = [
    ...(wizard.brandPrimaryColor ? [{ color: wizard.brandPrimaryColor, label: "Colore del brand" }] : []),
    { color: "#13332c", label: "Verde" },
    { color: "#b07a45", label: "Terracotta" },
    { color: "#f2e7d0", label: "Crema" },
    { color: "#1a1a1a", label: "Nero" },
    { color: "#ffffff", label: "Bianco" },
  ];

  /* ---------------------------------------------------------------- stato su */
  // Il documento dell'editor risale al wizard, che è chi lo salva e chi decide
  // se si può andare avanti. Il flusso è in una direzione sola: qui si scrive,
  // il wizard legge — mai il contrario, o i due stati si rincorrerebbero.
  useEffect(() => {
    wizardDispatch({ type: "SET_BLOCKS", blocks: doc.blocks });
    wizardDispatch({ type: "SET_EMAIL_SETTINGS", settings: doc.settings });
  }, [doc, wizardDispatch]);

  /* -------------------------------------------------------------- autosalvataggio */
  const firstRender = useRef(true);
  const campaignId = wizard.campaignId;
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!campaignId) return;
    wizardDispatch({ type: "SET_AUTO_SAVE", autoSave: "saving" });
    const timer = setTimeout(() => {
      patchCampaignDraft(campaignId, { contentBlocks: doc })
        .then(() => wizardDispatch({ type: "SET_AUTO_SAVE", autoSave: "saved" }))
        .catch(() => wizardDispatch({ type: "SET_AUTO_SAVE", autoSave: "error" }));
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, campaignId, wizardDispatch]);

  /* ------------------------------------------------------------------ comandi */
  const addBlock = useCallback(
    (itemId: string, target?: DropTarget) => {
      const item = LIBRARY_BY_ID.get(itemId);
      if (!item) return;
      const index = doc.blocks.findIndex((b) => b.type === "unsubscribe_link");
      editor.insert(item.create(defaults), target ?? { kind: "root", index: index === -1 ? doc.blocks.length : index });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, editor]
  );

  const addRow = useCallback(
    (ratio: ColumnRatio, target?: DropTarget) => {
      const index = doc.blocks.findIndex((b) => b.type === "unsubscribe_link");
      editor.insert(
        createColumnsBlock(ratio),
        target ?? { kind: "root", index: index === -1 ? doc.blocks.length : index }
      );
    },
    [doc, editor]
  );

  /* -------------------------------------------------------- scorciatoie da tastiera */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const editing =
        !!target &&
        (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA");

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        // Dentro un testo l'annullamento è quello del browser: togliere una
        // lettera, non l'ultimo blocco aggiunto.
        if (editing) return;
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedId && !editing) {
        e.preventDefault();
        editor.duplicate(selectedId);
        return;
      }
      if (e.key === "Escape") {
        if (editing) (target as HTMLElement).blur();
        editor.select(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !editing) {
        e.preventDefault();
        editor.remove(selectedId);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editor, selectedId]);

  /* --------------------------------------------------------------- trascinamento */
  const sensors = useSensors(
    // Cinque pixel di tolleranza: senza, un clic sulla piastrella della
    // libreria verrebbe letto come l'inizio di un trascinamento e il clic per
    // inserire non funzionerebbe mai.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    setDragging(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const target = event.over?.data.current?.target as DropTarget | undefined;
    if (!target) return;
    const data = event.active.data.current as
      | { kind: "new"; itemId: string }
      | { kind: "row"; ratio: ColumnRatio }
      | { kind: "move"; blockId: string }
      | undefined;
    if (!data) return;

    if (data.kind === "new") addBlock(data.itemId, target);
    // Una riga a colonne dentro una colonna non esiste: vedi DropTarget.
    else if (data.kind === "row" && target.kind === "root") addRow(data.ratio, target);
    else if (data.kind === "move") editor.move(data.blockId, target);
  }

  /* ------------------------------------------------------------ barra del testo */
  const showTextToolbar = !!selected && TEXTUAL_TYPES.includes(selected.type);
  const anchor = useAnchorRect(showTextToolbar ? selectedId : null);

  function convertBlock(kind: TextStyleKind) {
    if (!selected) return;
    if (kind === "p") {
      if (selected.type !== "title") return;
      const text = selected.text;
      editor.update(selected.id, {
        type: "text",
        text,
        html: plainTextToRichHtml(text),
        level: undefined,
      } as unknown as Partial<Block>);
      return;
    }
    const level = Number(kind.slice(1)) as 1 | 2 | 3;
    if (selected.type === "title") {
      editor.update(selected.id, { level });
      return;
    }
    if (selected.type === "text") {
      editor.update(selected.id, {
        type: "title",
        text: richHtmlToPlainText(selected.html ?? selected.text),
        align: selected.style?.align ?? "left",
        level,
        html: undefined,
      } as unknown as Partial<Block>);
    }
  }

  function insertVariable(token: string) {
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) {
      document.execCommand("insertText", false, token);
      return;
    }
    if (!selected) return;
    // Nessun cursore: il token va in coda al testo del blocco, che è la sola
    // posizione sensata quando non se ne conosce una migliore.
    if (selected.type === "title") editor.update(selected.id, { text: `${selected.text}${token}` });
    else if (selected.type === "button_cta") editor.update(selected.id, { label: `${selected.label}${token}` });
    else if (selected.type === "text") {
      const text = `${selected.text}${token}`;
      editor.update(selected.id, { text, html: plainTextToRichHtml(text) });
    }
  }

  async function runAi(action: string) {
    if (!selected) return;
    const source =
      selected.type === "text"
        ? richHtmlToPlainText(selected.html ?? selected.text)
        : selected.type === "title"
          ? selected.text
          : selected.type === "button_cta"
            ? selected.label
            : "";
    if (!source.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const { text } = await rewriteCampaignText(action, source);
      if (selected.type === "text") editor.update(selected.id, { text, html: plainTextToRichHtml(text) });
      else if (selected.type === "title") editor.update(selected.id, { text });
      else if (selected.type === "button_cta") editor.update(selected.id, { label: text });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "L'assistente non ha risposto");
    } finally {
      setAiBusy(false);
    }
  }

  /* ------------------------------------------------------------------ render */
  const canvasWidth = viewport === "desktop" ? doc.settings.contentWidth : MOBILE_WIDTH;
  const draggedLabel =
    dragging?.startsWith("new:")
      ? LIBRARY_BY_ID.get(dragging.slice(4))?.label
      : dragging?.startsWith("row:")
        ? "Riga"
        : dragging
          ? BLOCK_TYPE_LABELS[findBlock(doc, dragging)?.type ?? "text"]
          : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {/* I margini negativi riportano il banco di lavoro ai bordi dello schermo:
          la cornice dell'applicazione ha un respiro che qui toglie spazio al foglio. */}
      <div className="schermo -mx-4 h-full overflow-hidden border-y border-border md:-mx-6 lg:-mx-8">
        <div className="flex h-full min-h-0">
          {/* ------------------------------------------------ libreria */}
          <aside className="hidden w-[300px] shrink-0 flex-col border-r border-border bg-card-sunken lg:flex xl:w-[312px]">
            <LibraryPanel onAddBlock={(id) => addBlock(id)} onAddRow={(r) => addRow(r)} />
          </aside>

          {/* -------------------------------------------------- canvas */}
          <div className="flex min-w-0 flex-1 flex-col bg-[#070f0c] recessed">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
              <p className="hidden text-[15px] font-medium md:block">Editor email</p>

              <div className="flex items-center gap-0.5 rounded-md bg-secondary/60 p-0.5">
                {(
                  [
                    { v: "desktop" as const, icon: Monitor, label: "Desktop" },
                    { v: "mobile" as const, icon: Smartphone, label: "Mobile" },
                  ]
                ).map(({ v, icon: Icon, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => editor.setViewport(v)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded px-3 text-[13px] transition-colors",
                      viewport === v ? "bg-cream text-clay-ink" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    aria-label="Annulla"
                    title="Annulla (⌘Z)"
                    disabled={!editor.canUndo}
                    onClick={editor.undo}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-35"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Ripristina"
                    title="Ripristina (⌘⇧Z)"
                    disabled={!editor.canRedo}
                    onClick={editor.redo}
                    className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-35"
                  >
                    <Redo2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex h-8 items-center rounded-md border border-border">
                  <button
                    type="button"
                    aria-label="Riduci"
                    onClick={() => editor.setZoom(ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(zoom) - 1)] ?? 0.75)}
                    className="w-7 text-muted-foreground hover:text-foreground"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-[13px] tabular-nums">{Math.round(zoom * 100)}%</span>
                  <button
                    type="button"
                    aria-label="Ingrandisci"
                    onClick={() =>
                      editor.setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(zoom) + 1)] ?? 1.25)
                    }
                    className="w-7 text-muted-foreground hover:text-foreground"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {aiError && (
              <p className="shrink-0 border-b border-border/60 bg-destructive/10 px-4 py-1.5 text-xs text-destructive-soft">
                {aiError}
              </p>
            )}

            <div className="fill-scroll px-4 pb-24 pt-12">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                <Canvas
                  blocks={doc.blocks}
                  settings={doc.settings}
                  accent={accent}
                  selectedId={selectedId}
                  dragging={dragging !== null}
                  width={canvasWidth}
                  onSelect={editor.select}
                  onChangeBlock={(id, patch, key) => editor.update(id, patch, key)}
                  onDuplicate={editor.duplicate}
                  onDelete={editor.remove}
                  onRequestMedia={setMediaFor}
                  onTextFocus={editor.select}
                  onTextBlur={() => undefined}
                  onAddFirst={() => addBlock("text")}
                  onAddRow={(r) => addRow(r)}
                />
              </div>
            </div>
          </div>

          {/* ---------------------------------------------- proprietà */}
          {panelOpen ? (
            <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card-sunken md:flex">
              <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
                <p className="text-base font-semibold">
                  {selected ? BLOCK_TYPE_LABELS[selected.type] : "Impostazioni email"}
                </p>
                <button
                  type="button"
                  aria-label="Nascondi pannello"
                  onClick={() => setPanelOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="fill-scroll p-4">
                <Inspector
                  block={selected}
                  settings={doc.settings}
                  brandColors={brandColors}
                  onChangeBlock={(patch) => selected && editor.update(selected.id, patch)}
                  onChangeStyle={(patch) => selected && editor.setStyle(selected.id, patch)}
                  onChangeSettings={editor.setSettings}
                  onRequestMedia={() => selected && setMediaFor(selected.id)}
                />
              </div>
            </aside>
          ) : (
            <aside className="hidden w-12 shrink-0 flex-col items-center gap-3 border-l border-border bg-card-sunken pt-3 md:flex">
              <button
                type="button"
                aria-label="Mostra pannello"
                onClick={() => setPanelOpen(true)}
                className="text-accent-strong"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="t-etichetta [writing-mode:vertical-rl]">Proprietà</span>
            </aside>
          )}
        </div>
      </div>

      {/* La barra del testo segue il blocco selezionato: sta fuori dal foglio
          perché il foglio scorre e viene ridimensionato dallo zoom. */}
      {showTextToolbar && anchor && selected && (
        <div
          className="fixed z-50"
          style={{
            top: Math.max(72, anchor.top - 46),
            left: Math.min(Math.max(12, anchor.left), window.innerWidth - 640),
          }}
        >
          <TextToolbar
            block={selected}
            brandColors={brandColors}
            aiBusy={aiBusy}
            onConvert={convertBlock}
            onAlign={(align: BlockAlign) => editor.setStyle(selected.id, { align })}
            onAi={runAi}
            onInsertVariable={insertVariable}
          />
        </div>
      )}

      <DragOverlay dropAnimation={null}>
        {draggedLabel && (
          <div className="rounded-md border border-accent bg-card px-3 py-2 text-sm shadow-2xl">{draggedLabel}</div>
        )}
      </DragOverlay>

      <MediaPicker
        open={mediaFor !== null}
        onOpenChange={(open) => !open && setMediaFor(null)}
        onPick={(url) => {
          if (mediaFor) editor.update(mediaFor, { imageUrl: url } as Partial<Block>);
          setMediaFor(null);
        }}
      />
    </DndContext>
  );
}

export function Step5Editor() {
  const wizard = useWizardState();
  // Il documento iniziale si costruisce una volta sola: da qui in avanti la
  // fonte di verità è l'editor, e il wizard riceve gli aggiornamenti.
  const [initialDoc] = useState<EmailDocument>(() => {
    const parsed = parseEmailDocument({
      version: 2,
      settings: wizard.emailSettings,
      blocks: wizard.contentBlocks,
    });
    const blocks = upgradeLegacyBlocks(withUnsubscribeBlock(parsed.blocks)).map((b) =>
      b.type === "unsubscribe_link" && !b.restaurantName
        ? {
            ...b,
            id: b.id || newId(),
            restaurantName: wizard.venueName || "{{RESTAURANT_NAME}}",
            address: b.address ?? wizard.venueAddress,
          }
        : b
    );
    return { ...parsed, blocks };
  });

  return (
    <EditorProvider initialDoc={initialDoc}>
      <Workspace />
    </EditorProvider>
  );
}
