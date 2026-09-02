import { db } from "@/lib/db";

export async function getOrCreateConversation(venueId: string, userId: string) {
  const existing = await db.agentConversation.findFirst({
    where: { venueId, userId },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return db.agentConversation.create({ data: { venueId, userId } });
}

export async function startNewConversation(venueId: string, userId: string) {
  return db.agentConversation.create({ data: { venueId, userId } });
}

export async function getConversation(venueId: string, id: string) {
  return db.agentConversation.findFirst({ where: { id, venueId } });
}

export async function listMessages(conversationId: string) {
  return db.agentMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
}

export async function touchConversation(conversationId: string) {
  return db.agentConversation.update({ where: { id: conversationId }, data: {} }).catch(() => null);
}
