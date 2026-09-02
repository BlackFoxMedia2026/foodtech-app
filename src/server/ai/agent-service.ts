import { db } from "@/lib/db";
import type { AgentMessage, Prisma } from "@prisma/client";
import { classifyIntent } from "./intent-router";
import { toolRegistry } from "./tool-registry";
import { requireAbility, PermissionDeniedError } from "./permission-guard";
import { tryConsumeLLMRequest, getUsage } from "./usage-service";
import { openaiProvider } from "./openai-adapter";
import { buildSystemPrompt } from "./context";
import { touchConversation } from "./conversation";
import type { AgentContext, StructuredResult } from "./types";

export type AgentTurnEvent =
  | { type: "chunk"; text: string }
  | { type: "done"; message: SerializedMessage; usage: { used: number; limit: number } | null };

export type SerializedMessage = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  structured: StructuredResult | null;
  source: string | null;
  createdAt: string;
};

function serialize(message: AgentMessage): SerializedMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    structured: (message.structured as StructuredResult | null) ?? null,
    source: message.source,
    createdAt: message.createdAt.toISOString(),
  };
}

async function saveAssistantMessage(
  conversationId: string,
  text: string,
  source: "internal" | "external",
  structured?: StructuredResult,
) {
  const saved = await db.agentMessage.create({
    data: {
      conversationId,
      role: "ASSISTANT",
      content: text,
      source,
      structured: structured ? (structured as unknown as Prisma.InputJsonValue) : undefined,
    },
  });
  await touchConversation(conversationId);
  return saved;
}

export async function* runAgentTurn(
  ctx: AgentContext,
  conversationId: string,
  userText: string,
): AsyncGenerator<AgentTurnEvent> {
  await db.agentMessage.create({ data: { conversationId, role: "USER", content: userText } });

  const match = classifyIntent(userText);

  if (match.kind === "internal" && toolRegistry[match.intent]) {
    const tool = toolRegistry[match.intent];
    let text: string;
    let structured: StructuredResult | undefined;
    try {
      requireAbility(ctx.role, tool.ability);
      const result = await tool.run(ctx, match.params);
      text = result.text;
      structured = result.structured;
    } catch (err) {
      text =
        err instanceof PermissionDeniedError
          ? "Non hai i permessi necessari per questa richiesta."
          : "Non sono riuscito a recuperare questi dati. Riprova.";
    }
    const saved = await saveAssistantMessage(conversationId, text, "internal", structured);
    yield { type: "done", message: serialize(saved), usage: null };
    return;
  }

  // External fallback (ChatGPT). Availability is checked BEFORE touching the
  // quota — if there's no provider configured, no real request is ever sent
  // to it, so it must not count against the monthly limit.
  if (!openaiProvider.available) {
    const text = "Il servizio AI esterno non è al momento disponibile.";
    const saved = await saveAssistantMessage(conversationId, text, "external");
    const usage = await getUsage(ctx.venueId);
    yield { type: "done", message: serialize(saved), usage: { used: usage.used, limit: usage.limit } };
    return;
  }

  const usage = await tryConsumeLLMRequest(ctx.venueId);
  if (!usage.allowed) {
    const text =
      "Hai raggiunto il limite mensile delle richieste AI esterne. Posso continuare ad aiutarti con i dati e le funzioni del gestionale.";
    const saved = await saveAssistantMessage(conversationId, text, "internal");
    yield { type: "done", message: serialize(saved), usage: { used: usage.used, limit: usage.limit } };
    return;
  }

  const systemPrompt = buildSystemPrompt(ctx);
  let full = "";
  try {
    for await (const delta of openaiProvider.stream([
      { role: "system", content: systemPrompt },
      { role: "user", content: userText },
    ])) {
      full += delta;
      yield { type: "chunk", text: delta };
    }
  } catch {
    full = full || "Non sono riuscito a completare la richiesta al servizio esterno. Riprova più tardi.";
  }

  const saved = await saveAssistantMessage(conversationId, full, "external");
  yield { type: "done", message: serialize(saved), usage: { used: usage.used, limit: usage.limit } };
}
