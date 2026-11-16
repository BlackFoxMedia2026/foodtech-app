"use client";

import { cn } from "@/lib/utils";
import { AgentVisual } from "./agent-visual";
import { AgentStructuredResult } from "./agent-structured-result";
import type { SerializedMessage } from "@/server/ai/agent-service";

export function AgentMessage({
  message,
  acted,
  confirming,
  onConfirmAction,
  onCancelAction,
}: {
  message: SerializedMessage;
  acted: boolean;
  confirming: boolean;
  onConfirmAction: (actionId: string, params: Record<string, unknown>) => void;
  onCancelAction: () => void;
}) {
  const isUser = message.role === "USER";

  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="mt-0.5 shrink-0">
          <AgentVisual state="idle" size={24} />
        </div>
      )}
      <div className="max-w-[85%] space-y-1.5">
        <div
          className={cn(
            "whitespace-pre-wrap text-base leading-relaxed",
            // Sulla pagina verde: chi scrive su bianco, l'agente in bianco sul verde.
            isUser ? "rounded-[20px] rounded-br-md bg-white px-4 py-2.5 text-[#1d3a2f] shadow-sm" : "pt-0.5 text-white",
          )}
        >
          {message.content}
        </div>
        {message.structured && (
          /* I risultati (numeri, elenchi, conferme) sono pensati per il
             chiaro: stanno su una carta bianca. */
          <div className="rounded-2xl bg-[color:var(--card-fill)] p-1.5 text-card-foreground shadow-md">
          <AgentStructuredResult
            result={message.structured}
            acted={acted}
            confirming={confirming}
            onConfirmAction={onConfirmAction}
            onCancelAction={onCancelAction}
          />
          </div>
        )}
      </div>
    </div>
  );
}
