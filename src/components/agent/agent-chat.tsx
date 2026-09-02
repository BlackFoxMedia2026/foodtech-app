"use client";

import { useEffect, useRef } from "react";
import { AgentMessage } from "./agent-message";
import { AgentComposer } from "./agent-composer";
import type { SerializedMessage } from "@/server/ai/agent-service";

const SUGGESTED_PROMPTS = [
  "Quanti coperti ho stasera?",
  "Quali tavoli non hanno un cameriere?",
  "Mostrami le prenotazioni di oggi.",
  "Quali tavoli sono liberi adesso?",
];

export function AgentChat({
  messages,
  sending,
  usage,
  actedMessageIds,
  confirmingMessageId,
  onSend,
  onConfirmAction,
  onCancelAction,
}: {
  messages: SerializedMessage[];
  sending: boolean;
  usage: { used: number; limit: number } | null;
  actedMessageIds: Set<string>;
  confirmingMessageId: string | null;
  onSend: (text: string) => void;
  onConfirmAction: (messageId: string, actionId: string, params: Record<string, unknown>) => void;
  onCancelAction: (messageId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, sending]);

  const remaining = usage ? usage.limit - usage.used : null;
  const quotaExhausted = remaining !== null && remaining <= 0;
  const lowQuota = remaining !== null && remaining > 0 && remaining <= 10;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-display text-lg leading-tight">Come posso aiutarti?</p>
              <p className="text-sm text-muted-foreground">
                Posso analizzare prenotazioni, tavoli, ospiti, camerieri e dati del ristorante.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onSend(prompt)}
                  className="rounded-full border border-border bg-card/50 px-3 py-1.5 text-xs text-card-foreground/90 transition-colors hover:bg-card"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <AgentMessage
              key={m.id}
              message={m}
              acted={actedMessageIds.has(m.id)}
              confirming={confirmingMessageId === m.id}
              onConfirmAction={(actionId, params) => onConfirmAction(m.id, actionId, params)}
              onCancelAction={() => onCancelAction(m.id)}
            />
          ))
        )}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" />
            L&apos;Agente sta rispondendo…
          </div>
        )}
      </div>

      {usage && (
        <div className="shrink-0 border-t border-border px-4 py-1.5 text-center text-[11px] text-muted-foreground">
          {quotaExhausted
            ? "Limite mensile richieste AI esterne raggiunto — dati e funzioni del gestionale restano disponibili."
            : lowQuota
              ? `Ti restano ${remaining} richieste AI esterne questo mese.`
              : `${usage.used} / ${usage.limit} messaggi AI disponibili`}
        </div>
      )}

      <AgentComposer onSend={onSend} disabled={sending} />
    </div>
  );
}
