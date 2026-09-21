import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireVenueApi } from "@/lib/api-auth";
import { z } from "zod";
import { db } from "@/lib/db";

import { actionExecutors } from "@/server/ai/action-executors";
import { getConversation } from "@/server/ai/conversation";
import {
  PermissionDeniedError,
  requireAbility,
} from "@/server/ai/permission-guard";

const Body = z.object({
  conversationId: z.string(),
  actionId: z.string(),
  params: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  const ctx = await requireVenueApi();
  if (!ctx.ok) return ctx.response;

  try {
    const body = Body.parse(await req.json());
    const executor = actionExecutors[body.actionId];
    if (!executor) {
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }

    /*
      Il permesso, che qui non c'era.

      Questa rotta **scrive**: era protetta solo dall'essere membri del locale,
      quindi un accesso in sola lettura poteva assegnare un cameriere passando
      per l'assistente, mentre la schermata che fa la stessa cosa chiede
      `manage_staff`. Ogni esecutore dichiara adesso la capacità della sua
      schermata, e si controlla **qui**: nascondere un pulsante non impedisce a
      nessuno di chiamare l'indirizzo.
    */
    requireAbility(ctx.role, executor.ability);

    const conversation = await getConversation(
      ctx.venueId,
      body.conversationId,
    );
    if (!conversation) {
      return NextResponse.json(
        { error: "conversation_not_found" },
        { status: 404 },
      );
    }

    const result = await executor.run(
      {
        venueId: ctx.venueId,
        venueName: ctx.venue.name,
        venueTimezone: ctx.venue.timezone,
        role: ctx.role,
        userId: ctx.userId,
        orgId: ctx.orgId,
      },
      body.params,
    );

    const saved = await db.agentMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: result.text,
        source: "internal",
      },
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
    if (err instanceof PermissionDeniedError) {
      return NextResponse.json(
        {
          error: "permission_denied",
          message: "Non hai il permesso per questa azione.",
        },
        { status: 403 },
      );
    }
    return apiErrorResponse(err);
  }
}
