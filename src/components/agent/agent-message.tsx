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
          <AgentVisual state="idle" size={18} />
        </div>
      )}
      <div className="max-w-[85%] space-y-1.5">
        <div
          className={cn(
            "whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed",
            isUser ? "bg-accent-strong text-white" : "bg-card/80 text-card-foreground",
          )}
        >
          {message.content}
        </div>
        {message.structured && (
          <AgentStructuredResult
            result={message.structured}
            acted={acted}
            confirming={confirming}
            onConfirmAction={onConfirmAction}
            onCancelAction={onCancelAction}
          />
        )}
      </div>
    </div>
  );
}
