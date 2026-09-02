import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getActiveVenue } from "@/lib/tenant";
import { actionExecutors } from "@/server/ai/action-executors";
import { getConversation } from "@/server/ai/conversation";

const Body = z.object({
  conversationId: z.string(),
  actionId: z.string(),
  params: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  const ctx = await getActiveVenue();

  try {
    const body = Body.parse(await req.json());
    const executor = actionExecutors[body.actionId];
    if (!executor) {
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }

    const conversation = await getConversation(ctx.venueId, body.conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
    }

    const result = await executor(
      { venueId: ctx.venueId, venueName: ctx.venue.name, role: ctx.role, userId: ctx.userId },
      body.params,
    );

    const saved = await db.agentMessage.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content: result.text, source: "internal" },
    });

    return NextResponse.json({
      message: {
        id: saved.id,
        role: saved.role,
        content: saved.content,
        structured: null,
        source: saved.source,
        createdAt: saved.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "invalid" }, { status: 400 });
  }
}
