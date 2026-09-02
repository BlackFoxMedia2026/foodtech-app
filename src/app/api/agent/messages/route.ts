import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActiveVenue } from "@/lib/tenant";
import { getOrCreateConversation, startNewConversation, getConversation, listMessages } from "@/server/ai/conversation";
import { runAgentTurn } from "@/server/ai/agent-service";
import { getUsage } from "@/server/ai/usage-service";
import type { AgentContext } from "@/server/ai/types";

export async function GET() {
  const ctx = await getActiveVenue();
  const conversation = await getOrCreateConversation(ctx.venueId, ctx.userId);
  const [messages, usage] = await Promise.all([listMessages(conversation.id), getUsage(ctx.venueId)]);
  return NextResponse.json({
    conversationId: conversation.id,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      structured: m.structured ?? null,
      source: m.source,
      createdAt: m.createdAt.toISOString(),
    })),
    usage: { used: usage.used, limit: usage.limit },
  });
}

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  conversationId: z.string().optional(),
  newConversation: z.boolean().optional(),
  page: z
    .object({
      route: z.string().optional(),
      roomId: z.string().optional(),
      roomName: z.string().optional(),
      date: z.string().optional(),
      service: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await getActiveVenue();

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }

  const conversation = body.newConversation
    ? await startNewConversation(ctx.venueId, ctx.userId)
    : body.conversationId
      ? await getConversation(ctx.venueId, body.conversationId)
      : await getOrCreateConversation(ctx.venueId, ctx.userId);

  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  const agentCtx: AgentContext = {
    venueId: ctx.venueId,
    venueName: ctx.venue.name,
    role: ctx.role,
    userId: ctx.userId,
    page: body.page,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAgentTurn(agentCtx, conversation.id, body.text)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: "done", message: null, usage: null, error: "internal_error" })}\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
