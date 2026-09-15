"use client";

import { ImagePlus } from "lucide-react";
import {
  DEFAULT_BLOCK_PADDING,
  type Block,
  type BlockStyle,
  type EmailSettings,
} from "@/lib/campaign-blocks";
import { plainTextToRichHtml } from "@/lib/campaign-rich-text";
import { EditablePlain, EditableRich } from "./editable";

/**
 * Il blocco come si vede dentro il foglio.
 *
 * Questa è una *seconda* resa dello stesso contenuto: l'HTML che parte davvero
 * lo scrive `campaign-blocks-compiler.ts` con le tabelle, qui si disegna con
 * elementi normali perché dentro una tabella non si può scrivere comodamente.
 * È la duplicazione che ogni editor visuale si porta dietro; per non farla
 * divergere, tutto ciò che è misura condivisa (la spaziatura predefinita di
 * ogni tipo) sta in un solo posto, `DEFAULT_BLOCK_PADDING`.
 */

export interface BlockViewProps {
  block: Block;
  settings: EmailSettings;
  accent: string;
  onChange: (patch: Partial<Block>, coalesceKey?: string) => void;
  onRequestMedia: () => void;
  onTextFocus: (blockId: string) => void;
  onTextBlur: () => void;
}

function paddingOf(block: Block): string {
  const fallback = DEFAULT_BLOCK_PADDING[block.type];
  const s = block.style;
  const v = (given: number | undefined, def: number) => (typeof given === "number" ? given : def);
  return `${v(s?.paddingTop, fallback[0])}px ${v(s?.paddingRight, fallback[1])}px ${v(
    s?.paddingBottom,
    fallback[2]
  )}px ${v(s?.paddingLeft, fallback[3])}px`;
}

function cellStyle(block: Block, settings: EmailSettings): React.CSSProperties {
  const s: BlockStyle = block.style ?? {};
  return {
    padding: paddingOf(block),
    backgroundColor: s.backgroundColor,
    textAlign: s.align,
    fontFamily: settings.fontFamily,
  };
}

const TITLE_SIZES: Record<1 | 2 | 3, number> = { 1: 26, 2: 21, 3: 17 };

function ImagePlaceholder({ label, onClick, height }: { label: string; onClick: () => void; height: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height }}
      className="flex w-full flex-col items-center justify-center gap-1.5 rounded border-2 border-dashed border-[#d9cebc] bg-[#f7f1e6] text-[13px] text-[#a08e70] transition-colors hover:border-[#b07a45] hover:text-[#74432d]"
    >
      <ImagePlus className="h-5 w-5" />
      {label}
    </button>
  );
}

export function BlockView({
  block,
  settings,
  accent,
  onChange,
  onRequestMedia,
  onTextFocus,
  onTextBlur,
}: BlockViewProps) {
  const s: BlockStyle = block.style ?? {};
  const base = cellStyle(block, settings);
  const focusProps = { onFocus: () => onTextFocus(block.id), onBlur: onTextBlur };

  switch (block.type) {
    case "logo":
      return (
        <div style={{ ...base, textAlign: s.align ?? block.align }}>
          {block.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt="Logo"
              onClick={onRequestMedia}
              style={{ height: s.fontSize ?? 48, display: "inline-block", cursor: "pointer" }}
            />
          ) : (
            <ImagePlaceholder label="Aggiungi il logo" onClick={onRequestMedia} height={64} />
          )}
        </div>
      );

    case "hero_image":
    case "image": {
      const width = s.width ?? 100;
      return (
        <div style={{ ...base, textAlign: s.align }}>
          {block.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt={block.alt}
              onClick={onRequestMedia}
              style={{
                width: `${width}%`,
                maxWidth: "100%",
                display: "block",
                borderRadius: s.borderRadius,
                cursor: "pointer",
                marginLeft: s.align === "center" ? "auto" : s.align === "right" ? "auto" : undefined,
                marginRight: s.align === "center" ? "auto" : undefined,
              }}
            />
          ) : (
            <ImagePlaceholder
              label="Scegli un'immagine"
              onClick={onRequestMedia}
              height={block.type === "hero_image" ? 200 : 150}
            />
          )}
        </div>
      );
    }

    case "title": {
      const level = block.level ?? 1;
      return (
        <div style={{ ...base, textAlign: s.align ?? block.align }}>
          <EditablePlain
            value={block.text}
            onChange={(text) => onChange({ text }, `title:${block.id}`)}
            {...focusProps}
            style={{
              margin: 0,
              fontSize: s.fontSize ?? TITLE_SIZES[level],
              fontWeight: s.fontWeight ?? 700,
              lineHeight: s.lineHeight ?? 1.3,
              letterSpacing: s.letterSpacing,
              color: s.color ?? "#1a1a1a",
            }}
          />
        </div>
      );
    }

    case "text":
      return (
        <div style={base}>
          <EditableRich
            html={block.html ?? plainTextToRichHtml(block.text)}
            onChange={(html, plain) => onChange({ html, text: plain }, `text:${block.id}`)}
            {...focusProps}
            style={{
              fontSize: s.fontSize ?? 15,
              lineHeight: s.lineHeight ?? 1.6,
              letterSpacing: s.letterSpacing,
              color: s.color ?? settings.textColor,
              textAlign: s.align,
            }}
            className="[&_a]:underline [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-0 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
          />
        </div>
      );

    case "button_cta":
      return (
        <div style={{ ...base, textAlign: s.align ?? block.align }}>
          <EditablePlain
            as="span"
            value={block.label}
            onChange={(label) => onChange({ label }, `button:${block.id}`)}
            {...focusProps}
            style={{
              display: "inline-block",
              background: s.buttonColor ?? accent,
              color: s.buttonTextColor ?? "#ffffff",
              fontSize: s.fontSize ?? 15,
              fontWeight: 600,
              padding: `${s.buttonPaddingV ?? 13}px ${s.buttonPaddingH ?? 30}px`,
              borderRadius: s.borderRadius ?? 6,
            }}
          />
        </div>
      );

    case "divider":
      return (
        <div style={base}>
          <hr style={{ border: 0, borderTop: `1px solid ${s.color ?? "#e5e5e5"}`, margin: 0 }} />
        </div>
      );

    case "spacer":
      return (
        <div
          style={{ height: block.height, backgroundColor: s.backgroundColor }}
          className="flex items-center justify-center"
        >
          <span className="select-none text-[11px] uppercase tracking-wider text-[#c9bda6]">
            {block.height} px
          </span>
        </div>
      );

    case "offer_box":
      return (
        <div style={base}>
          <div
            style={{
              background: s.backgroundColor ?? "#f7f1e6",
              borderRadius: s.borderRadius ?? 8,
              padding: 16,
            }}
          >
            {block.badge && (
              <span
                style={{
                  display: "inline-block",
                  background: accent,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              >
                {block.badge}
              </span>
            )}
            <EditablePlain
              value={block.title}
              onChange={(title) => onChange({ title }, `offer-title:${block.id}`)}
              {...focusProps}
              style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}
            />
            <EditablePlain
              value={block.body}
              onChange={(body) => onChange({ body }, `offer-body:${block.id}`)}
              {...focusProps}
              style={{ marginTop: 8, fontSize: 14, color: "#333" }}
            />
          </div>
        </div>
      );

    case "social_links":
      return (
        <div style={{ ...base, textAlign: s.align ?? "center", fontSize: 13 }}>
          {block.links.map((l, i) => (
            <span key={i} style={{ margin: "0 6px", color: s.color ?? "#6b6b6b", textDecoration: "underline" }}>
              {l.platform || "Social"}
            </span>
          ))}
        </div>
      );

    case "coupon":
      return (
        <div style={base}>
          <div
            style={{
              border: `2px dashed ${s.color ?? accent}`,
              borderRadius: s.borderRadius ?? 8,
              background: s.backgroundColor ?? "#fdf8f1",
              padding: 18,
              textAlign: "center",
            }}
          >
            <EditablePlain
              value={block.title}
              onChange={(title) => onChange({ title }, `coupon-title:${block.id}`)}
              {...focusProps}
              style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}
            />
            <EditablePlain
              value={block.code}
              onChange={(code) => onChange({ code }, `coupon-code:${block.id}`)}
              {...focusProps}
              style={{ margin: "10px 0", fontSize: 24, fontWeight: 700, letterSpacing: 3, color: accent }}
            />
            <EditablePlain
              value={block.description}
              onChange={(description) => onChange({ description }, `coupon-desc:${block.id}`)}
              {...focusProps}
              style={{ fontSize: 14, color: "#4a4a4a", lineHeight: 1.5 }}
            />
            {block.expiry && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#8a8a8a" }}>Valido fino al {block.expiry}</div>
            )}
          </div>
        </div>
      );

    case "event":
      return (
        <div style={base}>
          <div style={{ background: s.backgroundColor ?? "#f7f1e6", borderRadius: s.borderRadius ?? 8, padding: 18 }}>
            <EditablePlain
              value={block.dateLabel}
              onChange={(dateLabel) => onChange({ dateLabel }, `event-date:${block.id}`)}
              {...focusProps}
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: accent,
                fontWeight: 700,
              }}
            />
            <EditablePlain
              value={block.title}
              onChange={(title) => onChange({ title }, `event-title:${block.id}`)}
              {...focusProps}
              style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}
            />
            <EditablePlain
              value={block.description}
              onChange={(description) => onChange({ description }, `event-desc:${block.id}`)}
              {...focusProps}
              style={{ margin: "8px 0 14px", fontSize: 14, color: "#4a4a4a", lineHeight: 1.5 }}
            />
            <EditablePlain
              as="span"
              value={block.ctaLabel}
              onChange={(ctaLabel) => onChange({ ctaLabel }, `event-cta:${block.id}`)}
              {...focusProps}
              style={{
                display: "inline-block",
                background: accent,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 22px",
                borderRadius: 6,
              }}
            />
          </div>
        </div>
      );

    case "contacts":
      return (
        <div style={{ ...base, textAlign: s.align ?? "center", fontSize: 14, color: s.color ?? "#4a4a4a", lineHeight: 1.7 }}>
          <EditablePlain
            value={block.restaurantName}
            onChange={(restaurantName) => onChange({ restaurantName }, `contacts-name:${block.id}`)}
            {...focusProps}
            style={{ fontWeight: 700, color: "#1a1a1a" }}
          />
          <EditablePlain
            value={block.address}
            onChange={(address) => onChange({ address }, `contacts-address:${block.id}`)}
            {...focusProps}
          />
          <EditablePlain
            value={block.phone}
            onChange={(phone) => onChange({ phone }, `contacts-phone:${block.id}`)}
            {...focusProps}
          />
          <EditablePlain
            value={block.hours}
            onChange={(hours) => onChange({ hours }, `contacts-hours:${block.id}`)}
            {...focusProps}
          />
        </div>
      );

    case "footer":
      return (
        <div style={{ ...base, textAlign: s.align ?? "center", fontSize: s.fontSize ?? 12, color: s.color ?? "#8a8a8a" }}>
          <EditablePlain
            value={block.text}
            onChange={(text) => onChange({ text }, `footer:${block.id}`)}
            {...focusProps}
          />
        </div>
      );

    case "unsubscribe_link": {
      const dark = block.theme === "dark";
      const bg = s.backgroundColor ?? (dark ? "#1f2a24" : "#f7f1e6");
      const fg = s.color ?? (dark ? "#b9c5bd" : "#8a8a8a");
      return (
        <div
          style={{
            ...base,
            backgroundColor: bg,
            textAlign: s.align ?? "center",
            fontSize: s.fontSize ?? 12,
            color: fg,
            lineHeight: 1.6,
          }}
        >
          {(block.restaurantName || block.address) && (
            <div>
              {[block.restaurantName, block.address].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <EditablePlain
              as="span"
              value={block.text}
              onChange={(text) => onChange({ text }, `unsub:${block.id}`)}
              {...focusProps}
              style={{ textDecoration: "underline", color: fg }}
            />
          </div>
        </div>
      );
    }

    case "two_columns":
      return (
        <div style={base}>
          <div style={{ display: "flex", gap: 16 }}>
            {[block.left, block.right].map((column, i) => (
              <div key={i} style={{ flex: 1 }}>
                {column.map((child) => (
                  <BlockView
                    key={child.id}
                    block={child}
                    settings={settings}
                    accent={accent}
                    onChange={() => undefined}
                    onRequestMedia={onRequestMedia}
                    onTextFocus={onTextFocus}
                    onTextBlur={onTextBlur}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      );

    case "columns":
      // Le righe a colonne le disegna il canvas, perché ogni colonna è anche
      // una zona di rilascio: vedi canvas.tsx.
      return null;
  }
}
