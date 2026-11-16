"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, AudioLines, Check, Loader2, Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRegistratore } from "./use-registratore";

const MAX_HEIGHT = 140;

/**
 * Il campo dell'agente, con la voce come in Gemini:
 * - il **microfono** nel campo detta: si parla, e il testo torna nel campo
 *   da rileggere e correggere prima di mandarlo;
 * - il tasto a destra, a campo vuoto, è il **vocale**: si parla e il messaggio
 *   parte da solo appena trascritto. Con del testo scritto diventa «invia».
 *
 * `onAscolto` dice alla pagina quando si sta registrando: i bordi si accendono.
 */
export function AgentComposer({
  onSend,
  disabled,
  onAscolto,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  onAscolto?: (attivo: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [modo, setModo] = useState<"dettatura" | "vocale">("dettatura");
  const ref = useRef<HTMLTextAreaElement>(null);
  const reg = useRegistratore();

  const occupato = reg.stato !== "fermo";

  useEffect(() => {
    onAscolto?.(occupato);
  }, [occupato, onAscolto]);

  function autoGrow() {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(MAX_HEIGHT, el.scrollHeight)}px`;
  }

  function handleSend() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(autoGrow);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function registra(m: "dettatura" | "vocale") {
    setModo(m);
    await reg.avvia();
  }

  async function chiudiRegistrazione() {
    const testo = await reg.conferma();
    if (!testo) return;
    if (modo === "vocale" && !disabled) {
      onSend(testo);
      return;
    }
    // Dettatura: il testo si aggiunge a quello già scritto, da rileggere.
    setValue((v) => (v.trim() ? `${v.trim()} ${testo}` : testo));
    requestAnimationFrame(() => {
      autoGrow();
      ref.current?.focus();
    });
  }

  const mm = Math.floor(reg.secondi / 60);
  const ss = String(reg.secondi % 60).padStart(2, "0");

  return (
    <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      {reg.errore && (
        <p className="mb-2 px-2 text-center text-sm text-white/85" role="alert">
          {reg.errore}
        </p>
      )}
      <div className="mx-auto flex max-w-2xl items-end gap-2">
        <div className="agente-campo flex min-h-[52px] min-w-0 flex-1 items-end rounded-[26px] bg-white py-1.5 pl-4 pr-1.5 shadow-lg">
          {reg.stato === "registra" ? (
            <div className="flex h-10 w-full items-center gap-2">
              <button
                type="button"
                onClick={reg.annulla}
                aria-label="Annulla la registrazione"
                className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#1d3a2f] hover:bg-black/5"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="flex h-8 min-w-0 flex-1 items-center justify-center gap-[3px]" aria-hidden="true">
                {reg.livelli.map((l, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-[#2c5545] transition-[height] duration-75"
                    style={{ height: `${Math.max(12, l * 100)}%` }}
                  />
                ))}
              </span>
              <span className="shrink-0 font-mono text-sm tabular-nums text-[#1d3a2f]/70" aria-live="off">
                {mm}:{ss}
              </span>
              <button
                type="button"
                onClick={chiudiRegistrazione}
                aria-label={modo === "vocale" ? "Invia il vocale" : "Trascrivi nel campo"}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2c5545] text-white"
              >
                {modo === "vocale" ? (
                  <ArrowUp className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Check className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          ) : reg.stato === "trascrive" ? (
            <div className="flex h-10 w-full items-center gap-2 text-[#1d3a2f]/70" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              {modo === "vocale" ? "Trascrivo e invio…" : "Trascrivo…"}
            </div>
          ) : (
            <>
              <textarea
                ref={ref}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  autoGrow();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Chiedi all'Agente"
                aria-label="Messaggio per l'Agente"
                rows={1}
                disabled={disabled}
                className="max-h-[140px] min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-base text-[#1d3a2f] placeholder:text-[#1d3a2f]/45 focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => registra("dettatura")}
                disabled={disabled}
                aria-label="Detta il messaggio"
                title="Detta"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#1d3a2f] hover:bg-black/5 disabled:opacity-40"
              >
                <Mic className="h-5 w-5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* A campo vuoto: il vocale. Con del testo: invia. */}
        {!occupato && (
          <button
            type="button"
            onClick={value.trim() ? handleSend : () => registra("vocale")}
            disabled={disabled}
            aria-label={value.trim() ? "Invia messaggio" : "Manda un vocale"}
            className={cn(
              "grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white text-[#1d3a2f] shadow-lg transition-transform active:scale-95 disabled:opacity-50",
            )}
          >
            {value.trim() ? (
              <ArrowUp className="h-6 w-6" aria-hidden="true" />
            ) : (
              <AudioLines className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
