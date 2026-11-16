"use client";

import { useEffect, useRef } from "react";
import { AgentMessage } from "./agent-message";
import { AgentComposer } from "./agent-composer";
import { AgentVisual } from "./agent-visual";
import type { SerializedMessage } from "@/server/ai/agent-service";

const SUGGESTED_PROMPTS = [
  "Quanti coperti ho stasera?",
  "Quali tavoli non hanno un cameriere?",
  "Mostrami le prenotazioni di oggi.",
  "Quali tavoli sono liberi adesso?",
];

/**
 * La conversazione, sulla pagina verde dell'agente.
 *
 * Vuota: l'icona grande al centro, «Come possiamo aiutarti?» e le proposte
 * su pillole bianche. Con dei messaggi: quelli di chi scrive su bianco a
 * destra, le risposte in bianco sul verde a sinistra.
 */
export function AgentChat({
  messages,
  sending,
  usage,
  actedMessageIds,
  confirmingMessageId,
  onSend,
  onConfirmAction,
  onCancelAction,
  onAscolto,
}: {
  messages: SerializedMessage[];
  sending: boolean;
  usage: { used: number; limit: number } | null;
  actedMessageIds: Set<string>;
  confirmingMessageId: string | null;
  onSend: (text: string) => void;
  onConfirmAction: (messageId: string, actionId: string, params: Record<string, unknown>) => void;
  onCancelAction: (messageId: string) => void;
  onAscolto?: (attivo: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const remaining = usage ? usage.limit - usage.used : null;
  const quotaExhausted = remaining !== null && remaining <= 0;
  const lowQuota = remaining !== null && remaining > 0 && remaining <= 10;
  const vuota = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="scorrimento min-h-0 flex-1 overflow-y-auto px-4">
        {vuota ? (
          <div className="agente-benvenuto mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 py-8 text-center">
            <AgentVisual state={sending ? "processing" : "active"} size={132} />
            <h2 className="text-display text-3xl leading-tight text-white">Come possiamo aiutarti?</h2>
            <div className="flex w-full flex-col items-center gap-2.5">
              {SUGGESTED_PROMPTS.map((prompt, i) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSend(prompt)}
                  className="agente-proposta min-h-[48px] max-w-full rounded-full bg-white px-4 py-2.5 text-[15px] font-medium text-[#1d3a2f] shadow-md transition-transform active:scale-[0.97]"
                  style={{ animationDelay: `${520 + i * 70}ms` }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4 py-4">
            {messages.map((m) => (
              <AgentMessage
                key={m.id}
                message={m}
                acted={actedMessageIds.has(m.id)}
                confirming={confirmingMessageId === m.id}
                onConfirmAction={(actionId, params) => onConfirmAction(m.id, actionId, params)}
                onCancelAction={() => onCancelAction(m.id)}
              />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-white/75">
                <AgentVisual state="processing" size={22} />
                L&apos;Agente sta rispondendo…
              </div>
            )}
          </div>
        )}
      </div>

      {usage && (
        <p className="shrink-0 px-4 pt-1 text-center text-xs text-white/60">
          {quotaExhausted
            ? "Limite mensile richieste AI esterne raggiunto — dati e funzioni del gestionale restano disponibili."
            : lowQuota
              ? `Ti restano ${remaining} richieste AI esterne questo mese.`
              : `${usage.used} / ${usage.limit} messaggi AI disponibili`}
        </p>
      )}

      <AgentComposer onSend={onSend} disabled={sending} onAscolto={onAscolto} />
    </div>
  );
}
