"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ImageUp, Lock } from "lucide-react";
import {
  DEFAULT_BLOCK_PADDING,
  EMAIL_FONT_STACKS,
  type Block,
  type BlockAlign,
  type ColumnRatio,
  type EmailSettings,
} from "@/lib/campaign-blocks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ColorField, FieldRow, NumberStepper, PanelSection, SegmentedControl } from "./controls";
import { BLOCK_TYPE_LABELS, STRUCTURE_ITEMS } from "./block-library";

export interface InspectorProps {
  block: Block | null;
  settings: EmailSettings;
  brandColors: { color: string; label: string }[];
  onChangeBlock: (patch: Partial<Block>) => void;
  onChangeStyle: (patch: Record<string, unknown>) => void;
  onChangeSettings: (patch: Partial<EmailSettings>) => void;
  onRequestMedia: () => void;
}

const ALIGN_OPTIONS: { value: BlockAlign; label: React.ReactNode; title: string }[] = [
  { value: "left", label: <AlignLeft className="h-3.5 w-3.5" />, title: "Sinistra" },
  { value: "center", label: <AlignCenter className="h-3.5 w-3.5" />, title: "Centro" },
  { value: "right", label: <AlignRight className="h-3.5 w-3.5" />, title: "Destra" },
];

/**
 * La spaziatura, spiegata come la pensa chi la usa.
 *
 * Quattro campi da un carattere l'uno («T R B L») sono il modo in cui gli
 * editor la chiedono e il motivo per cui nessuno la tocca. Qui si chiede
 * *verticale* e *orizzontale*, che è il 95% dei casi; i quattro lati separati
 * restano, dietro un interruttore, per il 5% che serve davvero.
 */
function SpacingSection({ block, onChangeStyle }: { block: Block; onChangeStyle: InspectorProps["onChangeStyle"] }) {
  const [advanced, setAdvanced] = useState(false);
  const fallback = DEFAULT_BLOCK_PADDING[block.type];
  const s = block.style ?? {};
  const top = s.paddingTop ?? fallback[0];
  const right = s.paddingRight ?? fallback[1];
  const bottom = s.paddingBottom ?? fallback[2];
  const left = s.paddingLeft ?? fallback[3];

  return (
    <PanelSection title="Spaziatura">
      {advanced ? (
        <>
          <FieldRow label="Sopra">
            <NumberStepper value={top} onChange={(v) => onChangeStyle({ paddingTop: v })} max={120} step={2} />
          </FieldRow>
          <FieldRow label="Destra">
            <NumberStepper value={right} onChange={(v) => onChangeStyle({ paddingRight: v })} max={120} step={2} />
          </FieldRow>
          <FieldRow label="Sotto">
            <NumberStepper value={bottom} onChange={(v) => onChangeStyle({ paddingBottom: v })} max={120} step={2} />
          </FieldRow>
          <FieldRow label="Sinistra">
            <NumberStepper value={left} onChange={(v) => onChangeStyle({ paddingLeft: v })} max={120} step={2} />
          </FieldRow>
        </>
      ) : (
        <>
          <FieldRow label="Verticale">
            <NumberStepper
              value={top}
              onChange={(v) => onChangeStyle({ paddingTop: v, paddingBottom: v })}
              max={120}
              step={2}
            />
          </FieldRow>
          <FieldRow label="Orizzontale">
            <NumberStepper
              value={left}
              onChange={(v) => onChangeStyle({ paddingLeft: v, paddingRight: v })}
              max={120}
              step={2}
            />
          </FieldRow>
        </>
      )}
      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        className="text-xs text-accent-strong underline underline-offset-2"
      >
        {advanced ? "Controlli semplici" : "Controlli avanzati"}
      </button>
    </PanelSection>
  );
}

function BackgroundSection({
  block,
  brandColors,
  onChangeStyle,
}: {
  block: Block;
  brandColors: InspectorProps["brandColors"];
  onChangeStyle: InspectorProps["onChangeStyle"];
}) {
  return (
    <PanelSection title="Sfondo">
      <FieldRow label="Colore">
        <ColorField
          value={block.style?.backgroundColor}
          onChange={(v) => onChangeStyle({ backgroundColor: v })}
          brandColors={brandColors}
          allowEmpty
        />
      </FieldRow>
    </PanelSection>
  );
}

function EmailSettingsPanel({
  settings,
  brandColors,
  onChangeSettings,
}: {
  settings: EmailSettings;
  brandColors: InspectorProps["brandColors"];
  onChangeSettings: InspectorProps["onChangeSettings"];
}) {
  return (
    <>
      <PanelSection title="Colori">
        <FieldRow label="Sfondo email">
          <ColorField
            value={settings.emailBackground}
            onChange={(v) => onChangeSettings({ emailBackground: v ?? "#ffffff" })}
            brandColors={brandColors}
          />
        </FieldRow>
        <FieldRow label="Sfondo pagina">
          <ColorField
            value={settings.pageBackground}
            onChange={(v) => onChangeSettings({ pageBackground: v ?? "#f4f1ea" })}
            brandColors={brandColors}
          />
        </FieldRow>
        <FieldRow label="Testo">
          <ColorField
            value={settings.textColor}
            onChange={(v) => onChangeSettings({ textColor: v ?? "#2b2b2b" })}
            brandColors={brandColors}
          />
        </FieldRow>
      </PanelSection>

      <PanelSection title="Impaginazione">
        <FieldRow label="Larghezza">
          <NumberStepper
            value={settings.contentWidth}
            onChange={(contentWidth) => onChangeSettings({ contentWidth })}
            min={480}
            max={720}
            step={20}
          />
        </FieldRow>
        <FieldRow label="Carattere">
          <select
            value={settings.fontFamily}
            onChange={(e) => onChangeSettings({ fontFamily: e.target.value })}
            className="h-8 max-w-[168px] rounded-md border border-border bg-background/50 px-2 text-sm outline-none"
          >
            {EMAIL_FONT_STACKS.map((f) => (
              <option key={f.id} value={f.stack}>
                {f.label}
              </option>
            ))}
          </select>
        </FieldRow>
      </PanelSection>

      <p className="t-nota leading-relaxed">
        I caratteri sono quelli che ogni client email sa disegnare: un font del web arriverebbe solo ad alcuni
        destinatari, e l&apos;email cambierebbe faccia a seconda di chi la apre.
      </p>
    </>
  );
}

export function Inspector({
  block,
  settings,
  brandColors,
  onChangeBlock,
  onChangeStyle,
  onChangeSettings,
  onRequestMedia,
}: InspectorProps) {
  if (!block) {
    return (
      <div className="space-y-6">
        <EmailSettingsPanel settings={settings} brandColors={brandColors} onChangeSettings={onChangeSettings} />
      </div>
    );
  }

  const s = block.style ?? {};
  const align = (s.align ?? ("align" in block ? block.align : "left")) as BlockAlign;

  return (
    <div className="space-y-6">
      {block.type === "unsubscribe_link" && (
        <div className="flex items-start gap-2 rounded-md border border-accent/50 bg-accent/15 p-2.5 text-[13px] leading-snug text-accent-strong">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Elemento obbligatorio: puoi cambiarne l&apos;aspetto, ma il link di disiscrizione resta.
        </div>
      )}

      {/* ---------------------------------------------------------- contenuto */}
      {block.type === "image" && (
        <PanelSection title="Immagine">
          <button
            type="button"
            onClick={onRequestMedia}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-cta text-sm font-medium text-cta-ink hover:brightness-105"
          >
            <ImageUp className="h-4 w-4" /> {block.imageUrl ? "Cambia immagine" : "Scegli immagine"}
          </button>
          <Input
            value={block.alt}
            onChange={(e) => onChangeBlock({ alt: e.target.value })}
            placeholder="Testo alternativo"
          />
          <Input
            value={block.linkUrl ?? ""}
            onChange={(e) => onChangeBlock({ linkUrl: e.target.value })}
            placeholder="Link (facoltativo)"
          />
        </PanelSection>
      )}

      {(block.type === "hero_image" || block.type === "logo") && (
        <PanelSection title={BLOCK_TYPE_LABELS[block.type]}>
          <button
            type="button"
            onClick={onRequestMedia}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-cta text-sm font-medium text-cta-ink hover:brightness-105"
          >
            <ImageUp className="h-4 w-4" /> {block.imageUrl ? "Cambia immagine" : "Scegli immagine"}
          </button>
          {block.type === "hero_image" && (
            <Input
              value={block.alt}
              onChange={(e) => onChangeBlock({ alt: e.target.value })}
              placeholder="Testo alternativo"
            />
          )}
          {block.type === "logo" && (
            <FieldRow label="Altezza">
              <NumberStepper
                value={s.fontSize ?? 48}
                onChange={(v) => onChangeStyle({ fontSize: v })}
                min={20}
                max={140}
                step={4}
              />
            </FieldRow>
          )}
        </PanelSection>
      )}

      {block.type === "button_cta" && (
        <PanelSection title="Contenuto">
          <Input
            value={block.label}
            onChange={(e) => onChangeBlock({ label: e.target.value })}
            placeholder="Testo del pulsante"
          />
          <Input
            value={block.url}
            onChange={(e) => onChangeBlock({ url: e.target.value })}
            placeholder="https://… oppure {{BOOKING_LINK}}"
          />
          <p className="t-nota leading-relaxed">
            Con <code>{"{{BOOKING_LINK}}"}</code> il link porta alla pagina di prenotazione del locale, con la
            campagna già dentro.
          </p>
        </PanelSection>
      )}

      {block.type === "coupon" && (
        <PanelSection title="Coupon">
          <Input value={block.title} onChange={(e) => onChangeBlock({ title: e.target.value })} placeholder="Titolo" />
          <Input value={block.code} onChange={(e) => onChangeBlock({ code: e.target.value })} placeholder="Codice" />
          <Textarea
            rows={3}
            value={block.description}
            onChange={(e) => onChangeBlock({ description: e.target.value })}
            placeholder="Come si usa"
          />
          <Input
            value={block.expiry ?? ""}
            onChange={(e) => onChangeBlock({ expiry: e.target.value })}
            placeholder="Scadenza (facoltativa)"
          />
        </PanelSection>
      )}

      {block.type === "event" && (
        <PanelSection title="Evento">
          <Input value={block.title} onChange={(e) => onChangeBlock({ title: e.target.value })} placeholder="Titolo" />
          <Input
            value={block.dateLabel}
            onChange={(e) => onChangeBlock({ dateLabel: e.target.value })}
            placeholder="Quando"
          />
          <Textarea
            rows={3}
            value={block.description}
            onChange={(e) => onChangeBlock({ description: e.target.value })}
            placeholder="Descrizione"
          />
          <Input
            value={block.ctaLabel}
            onChange={(e) => onChangeBlock({ ctaLabel: e.target.value })}
            placeholder="Testo del pulsante"
          />
          <Input value={block.ctaUrl} onChange={(e) => onChangeBlock({ ctaUrl: e.target.value })} placeholder="Link" />
        </PanelSection>
      )}

      {block.type === "contacts" && (
        <PanelSection title="Contatti">
          <Input
            value={block.restaurantName}
            onChange={(e) => onChangeBlock({ restaurantName: e.target.value })}
            placeholder="Nome del locale"
          />
          <Input
            value={block.address}
            onChange={(e) => onChangeBlock({ address: e.target.value })}
            placeholder="Indirizzo"
          />
          <Input value={block.phone} onChange={(e) => onChangeBlock({ phone: e.target.value })} placeholder="Telefono" />
          <Textarea
            rows={2}
            value={block.hours}
            onChange={(e) => onChangeBlock({ hours: e.target.value })}
            placeholder="Orari"
          />
        </PanelSection>
      )}

      {block.type === "social_links" && (
        <PanelSection title="Social">
          {block.links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={link.platform}
                placeholder="Nome"
                onChange={(e) => {
                  const links = [...block.links];
                  links[i] = { ...link, platform: e.target.value };
                  onChangeBlock({ links });
                }}
              />
              <Input
                value={link.url}
                placeholder="URL"
                onChange={(e) => {
                  const links = [...block.links];
                  links[i] = { ...link, url: e.target.value };
                  onChangeBlock({ links });
                }}
              />
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-accent-strong underline underline-offset-2"
            onClick={() => onChangeBlock({ links: [...block.links, { platform: "", url: "" }] })}
          >
            Aggiungi link
          </button>
        </PanelSection>
      )}

      {block.type === "spacer" && (
        <PanelSection title="Spazio">
          <FieldRow label="Altezza">
            <NumberStepper
              value={block.height}
              onChange={(height) => onChangeBlock({ height })}
              min={4}
              max={160}
              step={4}
            />
          </FieldRow>
        </PanelSection>
      )}

      {block.type === "columns" && (
        <PanelSection title="Riga">
          <div className="grid grid-cols-2 gap-2">
            {STRUCTURE_ITEMS.map((item) => (
              <button
                key={item.ratio}
                type="button"
                onClick={() => onChangeBlock({ ratio: item.ratio as ColumnRatio })}
                className={`rounded-md border px-2 py-1.5 text-xs ${
                  block.ratio === item.ratio ? "border-accent-strong bg-accent/15" : "border-border hover:bg-secondary"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <FieldRow label="Allineamento">
            <SegmentedControl
              value={(s.align ?? "left") as "left" | "center"}
              options={[
                { value: "left", label: "In alto" },
                { value: "center", label: "Al centro" },
              ]}
              onChange={(v) => onChangeStyle({ align: v })}
            />
          </FieldRow>
        </PanelSection>
      )}

      {block.type === "unsubscribe_link" && (
        <PanelSection title="Contenuto">
          <Input
            value={block.restaurantName ?? ""}
            onChange={(e) => onChangeBlock({ restaurantName: e.target.value })}
            placeholder="Nome del locale"
          />
          <Input
            value={block.address ?? ""}
            onChange={(e) => onChangeBlock({ address: e.target.value })}
            placeholder="Indirizzo"
          />
          <Input
            value={block.text}
            onChange={(e) => onChangeBlock({ text: e.target.value })}
            placeholder="Testo del link"
          />
          <FieldRow label="Tema">
            <SegmentedControl
              value={block.theme ?? "light"}
              options={[
                { value: "light", label: "Chiaro" },
                { value: "dark", label: "Scuro" },
              ]}
              onChange={(theme) => onChangeBlock({ theme })}
            />
          </FieldRow>
        </PanelSection>
      )}

      {block.type === "footer" && (
        <PanelSection title="Contenuto">
          <Textarea rows={2} value={block.text} onChange={(e) => onChangeBlock({ text: e.target.value })} />
        </PanelSection>
      )}

      {/* ------------------------------------------------------------ aspetto */}
      {(block.type === "text" || block.type === "title") && (
        <PanelSection title={block.type === "title" ? "Titolo" : "Testo"}>
          {block.type === "title" && (
            <FieldRow label="Livello">
              <SegmentedControl
                value={String(block.level ?? 1) as "1" | "2" | "3"}
                options={[
                  { value: "1", label: "T1" },
                  { value: "2", label: "T2" },
                  { value: "3", label: "T3" },
                ]}
                onChange={(v) => onChangeBlock({ level: Number(v) as 1 | 2 | 3 })}
              />
            </FieldRow>
          )}
          <FieldRow label="Dimensione">
            <NumberStepper
              value={s.fontSize ?? (block.type === "title" ? 26 : 15)}
              onChange={(v) => onChangeStyle({ fontSize: v })}
              min={10}
              max={54}
            />
          </FieldRow>
          <FieldRow label="Interlinea">
            <NumberStepper
              value={s.lineHeight ?? (block.type === "title" ? 1.3 : 1.6)}
              onChange={(v) => onChangeStyle({ lineHeight: v })}
              min={1}
              max={2.4}
              step={0.1}
              decimals={1}
            />
          </FieldRow>
          <FieldRow label="Spaziatura lettere">
            <NumberStepper
              value={s.letterSpacing ?? 0}
              onChange={(v) => onChangeStyle({ letterSpacing: v })}
              min={-2}
              max={8}
              step={0.5}
              decimals={1}
            />
          </FieldRow>
          <FieldRow label="Colore">
            <ColorField
              value={s.color}
              onChange={(v) => onChangeStyle({ color: v })}
              brandColors={brandColors}
              allowEmpty
            />
          </FieldRow>
          <FieldRow label="Allineamento">
            <SegmentedControl value={align} options={ALIGN_OPTIONS} onChange={(v) => onChangeStyle({ align: v })} />
          </FieldRow>
        </PanelSection>
      )}

      {block.type === "button_cta" && (
        <>
          <PanelSection title="Stile">
            <FieldRow label="Sfondo">
              <ColorField
                value={s.buttonColor}
                onChange={(v) => onChangeStyle({ buttonColor: v })}
                brandColors={brandColors}
                allowEmpty
              />
            </FieldRow>
            <FieldRow label="Testo">
              <ColorField
                value={s.buttonTextColor}
                onChange={(v) => onChangeStyle({ buttonTextColor: v })}
                brandColors={brandColors}
                allowEmpty
              />
            </FieldRow>
            <FieldRow label="Dimensione testo">
              <NumberStepper value={s.fontSize ?? 15} onChange={(v) => onChangeStyle({ fontSize: v })} min={11} max={26} />
            </FieldRow>
            <FieldRow label="Angoli">
              <NumberStepper
                value={s.borderRadius ?? 6}
                onChange={(v) => onChangeStyle({ borderRadius: v })}
                max={40}
              />
            </FieldRow>
          </PanelSection>
          <PanelSection title="Dimensione">
            <FieldRow label="Altezza">
              <NumberStepper
                value={s.buttonPaddingV ?? 13}
                onChange={(v) => onChangeStyle({ buttonPaddingV: v })}
                min={4}
                max={40}
              />
            </FieldRow>
            <FieldRow label="Larghezza">
              <NumberStepper
                value={s.buttonPaddingH ?? 30}
                onChange={(v) => onChangeStyle({ buttonPaddingH: v })}
                min={8}
                max={80}
                step={2}
              />
            </FieldRow>
            <FieldRow label="Allineamento">
              <SegmentedControl value={align} options={ALIGN_OPTIONS} onChange={(v) => onChangeStyle({ align: v })} />
            </FieldRow>
          </PanelSection>
        </>
      )}

      {(block.type === "image" || block.type === "hero_image") && (
        <PanelSection title="Aspetto">
          <FieldRow label="Larghezza">
            <NumberStepper
              value={s.width ?? 100}
              onChange={(v) => onChangeStyle({ width: v })}
              min={20}
              max={100}
              step={5}
              suffix="%"
            />
          </FieldRow>
          <FieldRow label="Angoli">
            <NumberStepper value={s.borderRadius ?? 0} onChange={(v) => onChangeStyle({ borderRadius: v })} max={40} />
          </FieldRow>
          <FieldRow label="Allineamento">
            <SegmentedControl value={align} options={ALIGN_OPTIONS} onChange={(v) => onChangeStyle({ align: v })} />
          </FieldRow>
        </PanelSection>
      )}

      {block.type === "divider" && (
        <PanelSection title="Aspetto">
          <FieldRow label="Colore">
            <ColorField
              value={s.color}
              onChange={(v) => onChangeStyle({ color: v })}
              brandColors={brandColors}
              allowEmpty
            />
          </FieldRow>
        </PanelSection>
      )}

      {(block.type === "coupon" || block.type === "event" || block.type === "offer_box") && (
        <PanelSection title="Aspetto">
          <FieldRow label="Angoli">
            <NumberStepper value={s.borderRadius ?? 8} onChange={(v) => onChangeStyle({ borderRadius: v })} max={30} />
          </FieldRow>
        </PanelSection>
      )}

      {(block.type === "contacts" || block.type === "footer" || block.type === "unsubscribe_link") && (
        <PanelSection title="Aspetto">
          <FieldRow label="Dimensione testo">
            <NumberStepper
              value={s.fontSize ?? (block.type === "contacts" ? 14 : 12)}
              onChange={(v) => onChangeStyle({ fontSize: v })}
              min={9}
              max={20}
            />
          </FieldRow>
          <FieldRow label="Colore">
            <ColorField
              value={s.color}
              onChange={(v) => onChangeStyle({ color: v })}
              brandColors={brandColors}
              allowEmpty
            />
          </FieldRow>
          <FieldRow label="Allineamento">
            <SegmentedControl value={align} options={ALIGN_OPTIONS} onChange={(v) => onChangeStyle({ align: v })} />
          </FieldRow>
        </PanelSection>
      )}

      {block.type !== "spacer" && <BackgroundSection block={block} brandColors={brandColors} onChangeStyle={onChangeStyle} />}
      {block.type !== "spacer" && <SpacingSection block={block} onChangeStyle={onChangeStyle} />}
    </div>
  );
}
