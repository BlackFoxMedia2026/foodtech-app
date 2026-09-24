"use client";

import { memo } from "react";
import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DIMENSIONE_TAVOLO,
  dimensioneDisegnata,
  posizioniSedie,
  LARGHEZZA_SEDIA,
  PROFONDITA_SEDIA,
  RAGGIO_FORMA,
} from "@/lib/tavolo-geometria";
import type { LocalTable } from "@/components/floor/table-node";

/**
 * Il tavolo **mentre lo si dispone**.
 *
 * Il fratello operativo (`RoomTableNode`) disegna lo stesso oggetto per chi
 * guarda la sala durante il servizio: stessa geometria, stesse sedie, stesso
 * legno. Qui in più ci sono le tre cose che servono solo a chi sta
 * disegnando — il contorno di selezione, i quattro angoli per ridimensionare,
 * la maniglia per ruotare — e in meno tutto quello che riguarda il servizio:
 * niente stato, niente personale, niente prenotazioni. Tenerli separati
 * evita il componente con dodici modalità che nessuno riesce più a cambiare.
 */

export type ManiglieRidimensiona = "nw" | "ne" | "sw" | "se";

export const TavoloEditorNode = memo(function TavoloEditorNode({
  table: t,
  selezionato,
  inTrascinamento,
  onSelezione,
  onInizioSpostamento,
  onInizioRidimensiona,
  onInizioRotazione,
}: {
  table: LocalTable;
  selezionato: boolean;
  inTrascinamento?: boolean;
  onSelezione: (id: string, additivo: boolean) => void;
  onInizioSpostamento: (id: string, e: React.PointerEvent) => void;
  onInizioRidimensiona: (id: string, angolo: ManiglieRidimensiona, e: React.PointerEvent) => void;
  onInizioRotazione: (id: string, e: React.PointerEvent) => void;
}) {
  const impronta = DIMENSIONE_TAVOLO[t.shape];
  const piano = dimensioneDisegnata(t);
  const raggio = RAGGIO_FORMA[t.shape];
  const sedie = posizioniSedie(t.shape, piano.w, piano.h, t.seats);

  // L'impronta deve contenere il piano anche quando è stato allargato a mano,
  // altrimenti la maniglia in basso a destra finisce fuori dall'area che
  // riceve i clic.
  const larghezza = Math.max(impronta.w, piano.w);
  const altezza = Math.max(impronta.h, piano.h);

  return (
    <div
      data-oggetto-mappa=""
      role="button"
      tabIndex={0}
      aria-label={`Tavolo ${t.label}, ${t.seats} posti`}
      aria-pressed={selezionato}
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelezione(t.id, e.shiftKey);
        onInizioSpostamento(t.id, e);
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group absolute touch-none select-none",
        inTrascinamento ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        left: t.posX,
        top: t.posY,
        width: larghezza,
        height: altezza,
        transform: `rotate(${t.rotation}deg)`,
        zIndex: selezionato ? 5 : 2,
      }}
    >
      <div className="relative grid h-full w-full place-items-center">
        {/* Le sedie stanno sotto al piano: una sedia disegnata sopra il tavolo
            sembra appoggiata sul tavolo. */}
        <div aria-hidden="true" className="absolute inset-0">
          {sedie.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-[3px] bg-forest/90 shadow-sm"
              style={{
                left: "50%",
                top: "50%",
                width: LARGHEZZA_SEDIA,
                height: PROFONDITA_SEDIA,
                transform: `translate(-50%, -50%) translate(${s.x}px, ${s.y}px) rotate(${s.rotazione}deg)`,
              }}
            />
          ))}
        </div>

        {/* Lo spessore del piano: una copia spostata sotto, non una
            prospettiva. */}
        <div
          aria-hidden="true"
          className="absolute bg-surface-brown-light"
          style={{
            width: piano.w,
            height: piano.h,
            borderRadius: raggio === "full" ? 9999 : raggio,
            transform: "translateY(5px)",
          }}
        />

        <div
          className={cn("relative grid place-items-center table-wood text-clay-ink", !t.active && "opacity-60")}
          style={{
            width: piano.w,
            height: piano.h,
            borderRadius: raggio === "full" ? 9999 : raggio,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,.65), 0 2px 0 rgba(0,0,0,.14), 0 6px 10px -2px rgba(0,0,0,.28)",
            outline: selezionato ? "2px solid #B07A45" : undefined,
            outlineOffset: 2,
          }}
        >
          <span
            className="text-display text-[13px] font-semibold leading-none"
            style={{ transform: "scale(var(--ui-scale, 1))" }}
          >
            {t.label}
          </span>
        </div>

        {selezionato && (
          <>
            {/* Ruotare: la maniglia sta sopra, con un filo che la collega al
                tavolo — è la convenzione di ogni editor grafico, e qui vale
                perché nessuno la deve imparare. */}
            <div
              aria-hidden="true"
              className="absolute left-1/2 bg-accent-strong/70"
              style={{
                width: 1.5,
                height: 16,
                top: -16 - (altezza - piano.h) / 2,
                transform: "translateX(-50%)",
              }}
            />
            <button
              type="button"
              aria-label={`Ruota tavolo ${t.label}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                onInizioRotazione(t.id, e);
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-1/2 grid h-5 w-5 cursor-grab place-items-center rounded-full bg-accent-strong text-white shadow-md active:cursor-grabbing"
              style={{
                top: -30 - (altezza - piano.h) / 2,
                transform: "translateX(-50%) scale(var(--ui-scale, 1))",
              }}
            >
              <RotateCw className="h-3 w-3" />
            </button>

            {(["nw", "ne", "sw", "se"] as const).map((angolo) => (
              <button
                key={angolo}
                type="button"
                aria-label={`Ridimensiona tavolo ${t.label}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onInizioRidimensiona(t.id, angolo, e);
                }}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "absolute h-2.5 w-2.5 rounded-[2px] border border-line bg-accent-strong shadow",
                  angolo === "nw" && "cursor-nwse-resize",
                  angolo === "ne" && "cursor-nesw-resize",
                  angolo === "sw" && "cursor-nesw-resize",
                  angolo === "se" && "cursor-nwse-resize",
                )}
                style={{
                  left: angolo === "nw" || angolo === "sw" ? `calc(50% - ${piano.w / 2}px)` : `calc(50% + ${piano.w / 2}px)`,
                  top: angolo === "nw" || angolo === "ne" ? `calc(50% - ${piano.h / 2}px)` : `calc(50% + ${piano.h / 2}px)`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
});
